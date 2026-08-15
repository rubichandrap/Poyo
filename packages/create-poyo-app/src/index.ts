#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Command } from "commander";
import { CliError } from "./error.js";

const require = createRequire(import.meta.url);

const TEMPLATE_PKG = "@rubichandrap/poyo-template/package.json";
const POYO_PKG = "@rubichandrap/poyo";
const FRESH_VERSION = "0.0.1";

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
	if (EXCLUDED_DIR_NAMES.has(path.basename(src))) return;

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
	const renamed = applyRules(content, rules);
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

function pinPoyoDevDep(
	pkg: Record<string, unknown>,
	poyoVersion: string,
): void {
	const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
	devDeps[POYO_PKG] = poyoVersion;
	pkg.devDependencies = devDeps;
}

function rewritePackageJson(
	targetDir: string,
	projectPascal: string,
	projectLower: string,
	poyoVersion: string,
): void {
	const pkgPath = path.join(targetDir, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
		string,
		unknown
	>;
	pkg.name = projectLower;
	pkg.version = FRESH_VERSION;
	pkg.description = `Project ${projectPascal} created from the Poyo template`;
	pkg.private = true;
	delete pkg.bin;
	delete pkg.files;
	pinPoyoDevDep(pkg, poyoVersion);
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function rewriteClientPackageJson(
	targetDir: string,
	projectLower: string,
	poyoVersion: string,
): void {
	const pkgPath = path.join(
		targetDir,
		`${projectLower}.client`,
		"package.json",
	);
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
		string,
		unknown
	>;
	pinPoyoDevDep(pkg, poyoVersion);
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function installDependencies(targetDir: string): void {
	const result = spawnSync("pnpm", ["install"], {
		cwd: targetDir,
		stdio: "inherit",
	});
	if (result.status !== 0) {
		throw new CliError(`pnpm install failed in ${targetDir}`);
	}
}

export function createProject(
	projectName: string,
	options: { skipInstall: boolean },
): void {
	const pascal = projectName.charAt(0).toUpperCase() + projectName.slice(1);
	const lower = projectName.toLowerCase();
	const targetDir = path.resolve(process.cwd(), projectName);
	const poyoVersion = ownVersion();

	if (fs.existsSync(targetDir)) {
		throw new CliError(`Directory '${projectName}' already exists.`);
	}

	const templateDir = resolveTemplateDir();
	const rules = renameRules(pascal, lower);

	copyRecursive(templateDir, targetDir);
	renameTree(targetDir, rules);
	rewritePackageJson(targetDir, pascal, lower, poyoVersion);
	rewriteClientPackageJson(targetDir, lower, poyoVersion);

	if (!options.skipInstall) {
		installDependencies(targetDir);
	}

	process.stdout.write(
		`Created ${projectName} from Poyo template (poyo@${poyoVersion}).\n`,
	);
	process.stdout.write(
		`Next: cd ${projectName} && pnpm run restore && pnpm run dev\n`,
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
