#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Command } from "commander";
import { CliError } from "./error.js";
import {
	isProjectNameValid,
	pascalProjectName,
	projectNameError,
} from "./project-name.js";
import {
	protectFrameworkIdentifiers,
	rewriteClientPackageJson,
	rewritePackageJson,
	unprotectFrameworkIdentifiers,
} from "./rewrite.js";

const require = createRequire(import.meta.url);

const TEMPLATE_PKG = "@rubichandrap/poyo-template/package.json";

// Mirrors the gitignored build artifacts so the copy matches the published
// template package, not the dev workspace with its generated output.
const EXCLUDED_DIR_NAMES = new Set([
	"node_modules",
	".git",
	"bin",
	"obj",
	"dist",
	"publish",
	"generated",
]);

const EXCLUDED_FILE_NAMES: Record<string, true> = {
	"routes.generated.ts": true,
};
const BINARY_EXTENSIONS = new Set([
	".dll",
	".exe",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".ico",
	".webp",
	".pdf",
	".woff",
	".woff2",
	".ttf",
	".eot",
]);

type RenameRule = { from: RegExp; to: string };

function resolveTemplateDir(): string {
	const pkgPath = require.resolve(TEMPLATE_PKG);
	return path.dirname(pkgPath);
}

function ownVersion(): string {
	const pkg = JSON.parse(
		fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
	) as { version: string };
	return pkg.version;
}

function copyRecursive(src: string, dest: string): void {
	const base = path.basename(src);
	if (EXCLUDED_DIR_NAMES.has(base) || EXCLUDED_FILE_NAMES[base]) return;

	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		const entries = fs.readdirSync(src);
		if (entries.length === 0) return;
		fs.mkdirSync(dest, { recursive: true });
		for (const entry of entries) {
			copyRecursive(path.join(src, entry), path.join(dest, entry));
		}
		return;
	}
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(src, dest);
}

function renameRules(pascal: string, lower: string): RenameRule[] {
	return [
		// Capital Poyo: namespaces, project dirs, docs, VITE_APP_NAME.
		{ from: /Poyo/g, to: pascal },
		// Structural lowercase tokens. The bare "poyo" CLI binary is NOT renamed
		// so the generated project's scripts keep calling `poyo`.
		{ from: /poyo\.client/g, to: `${lower}.client` },
		{ from: /poyo-server/g, to: `${lower}-server` },
	];
}

function applyRules(value: string, rules: RenameRule[]): string {
	return rules.reduce((acc, rule) => acc.replace(rule.from, rule.to), value);
}

function renameContent(filePath: string, rules: RenameRule[]): void {
	if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return;
	const content = fs.readFileSync(filePath, "utf-8");
	// Framework identifiers survive the rename verbatim (see rewrite.ts).
	const protectedContent = protectFrameworkIdentifiers(content);
	const renamed = unprotectFrameworkIdentifiers(
		applyRules(protectedContent, rules),
	);
	if (renamed !== content) {
		fs.writeFileSync(filePath, renamed, "utf-8");
	}
}

function renameTree(dir: string, rules: RenameRule[]): void {
	for (const entry of fs.readdirSync(dir)) {
		if (EXCLUDED_DIR_NAMES.has(entry)) continue;

		const fullPath = path.join(dir, entry);
		const renamedEntry = applyRules(entry, rules);
		const renamedPath = path.join(dir, renamedEntry);
		if (renamedEntry !== entry) {
			fs.renameSync(fullPath, renamedPath);
		}

		const stat = fs.statSync(renamedPath);
		if (stat.isDirectory()) {
			renameTree(renamedPath, rules);
		} else {
			renameContent(renamedPath, rules);
		}
	}
}

function restoreTemplates(dir: string): void {
	for (const entry of fs.readdirSync(dir)) {
		if (EXCLUDED_DIR_NAMES.has(entry)) continue;

		const fullPath = path.join(dir, entry);
		const stat = fs.statSync(fullPath);
		if (stat.isDirectory()) {
			restoreTemplates(fullPath);
		} else if (entry.endsWith(".template")) {
			const restoredPath = path.join(dir, entry.slice(0, -".template".length));
			if (fs.existsSync(restoredPath)) {
				fs.rmSync(restoredPath);
			}
			fs.renameSync(fullPath, restoredPath);
		}
	}
}

function installDependencies(targetDir: string): void {
	// Windows resolves `pnpm` to `pnpm.cmd`, which CreateProcess cannot launch,
	// so it needs a shell; elsewhere the executable is launched directly. The
	// shell gets one constant command line rather than an argument vector,
	// which Node 24 deprecates (DEP0190).
	const result =
		process.platform === "win32"
			? spawnSync("pnpm install", {
					cwd: targetDir,
					stdio: "inherit",
					shell: true,
				})
			: spawnSync("pnpm", ["install"], {
					cwd: targetDir,
					stdio: "inherit",
				});
	if (result.status !== 0) {
		throw new CliError(`pnpm install failed in ${targetDir}`);
	}
}

export function ensureEnvFile(targetDir: string): void {
	const envPath = path.join(targetDir, ".env");
	const envExamplePath = path.join(targetDir, ".env.example");
	if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
		fs.copyFileSync(envExamplePath, envPath);
	}
}

export function createProject(
	projectName: string,
	options: { skipInstall: boolean },
): void {
	// Validate before anything touches the filesystem: the name becomes a C#
	// namespace segment, an npm package name and a directory, so a name that
	// breaks one of the three must fail here, not halfway through scaffolding.
	if (!isProjectNameValid(projectName)) {
		throw new CliError(projectNameError(projectName));
	}

	const pascal = pascalProjectName(projectName);
	const lower = projectName.toLowerCase();
	const targetDir = path.resolve(process.cwd(), projectName);
	const poyoVersion = ownVersion();

	if (fs.existsSync(targetDir)) {
		throw new CliError(`Directory '${projectName}' already exists.`);
	}

	const templateDir = resolveTemplateDir();
	const rules = renameRules(pascal, lower);

	// The project is assembled beside its future name and moved into place as
	// the last step of the copy. A copy that fails halfway therefore leaves no
	// directory under the project's name, so a re-run is not refused as
	// "already exists" — and a process killed mid-copy leaves only a staging
	// directory the operator can delete.
	const stagingDir = fs.mkdtempSync(`${targetDir}.staging-`);

	try {
		copyRecursive(templateDir, stagingDir);
		ensureEnvFile(stagingDir);
		renameTree(stagingDir, rules);
		// npm/pnpm pack strips .gitignore from published tarballs;
		// ship it under .template extension and restore it in the generated project.
		restoreTemplates(stagingDir);
		rewritePackageJson(stagingDir, pascal, lower, poyoVersion);
		rewriteClientPackageJson(stagingDir, lower, poyoVersion);

		// The move happens before the install: pnpm records absolute junction
		// targets in node_modules on Windows, which a later rename would strand
		// in the staging path, and renaming a freshly installed tree competes
		// with virus scanners for its handles.
		fs.renameSync(stagingDir, targetDir);
	} catch (error) {
		fs.rmSync(stagingDir, { recursive: true, force: true });
		throw error;
	}

	// An install that fails leaves the complete scaffolded project in place,
	// as it did before staging: re-running `pnpm install` is the fix.
	if (!options.skipInstall) {
		installDependencies(targetDir);
	}

	process.stdout.write(
		`Created ${projectName} from Poyo template (poyo@${poyoVersion}).\n`,
	);
	process.stdout.write(
		`Next: cd ${projectName} && pnpm run restore && pnpm run generate && pnpm run dev\n`,
	);
}

export function createPoyoAppCommand(): Command {
	return new Command("create-poyo-app")
		.description("Scaffold a new Poyo project")
		.version(ownVersion())
		.argument("[project-name]", "Name of the project to create")
		.option(
			"--project <name>",
			"Name of the project (alternative to positional)",
		)
		.option("--skip-install", "Skip pnpm install after scaffolding")
		.action(
			async (
				projectName: string | undefined,
				options: { project?: string; skipInstall?: boolean },
			) => {
				let name = projectName ?? options.project;
				if (!name) {
					const { input } = await import("@inquirer/prompts");
					name = await input({
						message: "Project Name:",
						default: "MyPoyoApp",
					});
				}
				createProject(name, { skipInstall: options.skipInstall ?? false });
			},
		);
}

function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

async function main(): Promise<void> {
	const program = createPoyoAppCommand();
	await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
	process.stderr.write(`[ERROR] ${messageOf(error)}\n`);
	process.exit(1);
});
