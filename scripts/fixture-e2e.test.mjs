/**
 * Release-time fixture e2e: the npm-resolution proof (issue #27).
 *
 * Scaffolds a real project with the local create-poyo-app CLI, runs
 * `pnpm install` inside it, and asserts the chain generated projects depend
 * on, end to end:
 *
 *   1. A real project is scaffolded with the local scaffolder's built CLI.
 *   2. The scaffolder pins `@rubichandrap/poyo` to the release version in
 *      both the root and client manifests (workspace:* rewritten away).
 *   3. `pnpm install` resolves that version from npm — the version is read
 *      back from node_modules and its realpath must not be the monorepo
 *      (a workspace link would pass the install but prove nothing).
 *   4. The resolved package ships the `./runtime` subpath (dist/runtime/),
 *      including the route-table module (dist/runtime/route-table.js).
 *   5. The built client bundle carries the runtime surface: the `usePage`
 *      accessor, its `window.SERVER_DATA` channel, and the route-table
 *      module's `[RouteTable]` diagnostics all appear in the output.
 *
 * This test is a publish-time gate, wired into `pnpm run test:release`. It is
 * RED until the release version is published: an unpublished version fails
 * pnpm install with a resolution error, which the fixture surfaces with a
 * [RED-UNTIL-PUBLISHED] diagnostic. Run it after publishing (or at any time)
 * to prove the published packages work together.
 */

import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const SCAFFOLDER_PKG = path.join(REPO_ROOT, "packages", "create-poyo-app");
const SCAFFOLDER_BIN = path.join(SCAFFOLDER_PKG, "dist", "index.js");
const POYO_PKG = "@rubichandrap/poyo";

// The scaffolder's rename rule turns poyo.client into <lower>.client, so a
// project named fixtureApp produces fixtureapp.client — pinned here so a
// change to that rename rule fails this test loudly.
const PROJECT_NAME = "fixtureApp";
const CLIENT_DIR = "fixtureapp.client";

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function releaseVersion() {
	return readJson(path.join(SCAFFOLDER_PKG, "package.json")).version;
}

function run(command, args, cwd, timeout = 600_000) {
	const result = spawnSync(command, args, { cwd, encoding: "utf-8", timeout });
	const output = [result.stdout, result.stderr]
		.filter(Boolean)
		.join("\n")
		.trim();
	if (result.error) {
		throw new Error(
			`${command} ${args.join(" ")} failed: ${result.error.message}\n${output}`,
		);
	}
	return { status: result.status, output };
}

function collectFiles(dir, files = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectFiles(full, files);
		} else {
			files.push(full);
		}
	}
	return files;
}

before(() => {
	// The fixture drives the local scaffolder's built CLI — the artifact that
	// gets published — so build it fresh from source first.
	const build = run(
		"pnpm",
		["--filter", "@rubichandrap/create-poyo-app", "build"],
		REPO_ROOT,
		300_000,
	);
	assert.equal(build.status, 0, `scaffolder build failed:\n${build.output}`);
});

test(
	"scaffolded project resolves the framework from npm and bundles the accessor",
	// Must exceed the sum of the subprocess budgets (build 300s + scaffold
	// 120s + install 600s + client build 300s = 1320s) so the per-step
	// timeouts, not the outer test timeout, are the effective caps.
	{ timeout: 1_500_000 },
	() => {
		const version = releaseVersion();
		const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-fixture-"));
		const fixture = path.join(tmpRoot, PROJECT_NAME);
		try {
			// 1. Scaffold a real project with the local scaffolder.
			const scaffold = run(
				process.execPath,
				[SCAFFOLDER_BIN, PROJECT_NAME, "--skip-install"],
				tmpRoot,
				120_000,
			);
			assert.equal(scaffold.status, 0, `scaffold failed:\n${scaffold.output}`);
			assert.ok(
				fs.existsSync(path.join(fixture, "package.json")),
				"scaffold produced no package.json",
			);

			// 2. The scaffolder pinned the release version in both manifests.
			const rootPkg = readJson(path.join(fixture, "package.json"));
			assert.equal(
				rootPkg.devDependencies[POYO_PKG],
				version,
				"root manifest not pinned to the release version",
			);
			const clientPkg = readJson(
				path.join(fixture, CLIENT_DIR, "package.json"),
			);
			assert.equal(
				clientPkg.devDependencies[POYO_PKG],
				version,
				"client manifest not pinned to the release version",
			);

			// 3. pnpm install — this is where npm resolution is proven. An
			// unpublished version fails resolution, keeping the gate red until
			// the release hits the registry.
			const install = run("pnpm", ["install"], fixture, 600_000);
			if (install.status !== 0) {
				const published = run(
					"npm",
					["view", `${POYO_PKG}@${version}`, "version"],
					REPO_ROOT,
					60_000,
				);
				// Only a registry 404 means the version is unpublished; any
				// other npm-view failure (network, auth) must not mask the
				// real install error with a RED-UNTIL-PUBLISHED claim.
				const missingFromRegistry =
					published.status !== 0 &&
					/404|no match found/i.test(published.output);
				if (missingFromRegistry) {
					throw new Error(
						`[RED-UNTIL-PUBLISHED] ${POYO_PKG}@${version} is not on npm ` +
							"yet — publish the release first (this gate is expected to " +
							"be red pre-publish).",
					);
				}
				throw new Error(
					`pnpm install failed in ${fixture} ` +
						`(npm view check: ${published.status === 0 ? "published" : "check failed"}):\n` +
						install.output,
				);
			}

			// 4. The resolved package is the registry release, not a workspace copy.
			const resolvedDir = path.join(fixture, "node_modules", POYO_PKG);
			const resolvedPkg = readJson(path.join(resolvedDir, "package.json"));
			assert.equal(
				resolvedPkg.version,
				version,
				"node_modules resolved a different version",
			);
			const realDir = fs.realpathSync(resolvedDir);
			assert.ok(
				!realDir.startsWith(REPO_ROOT),
				`${POYO_PKG} resolved from the workspace (${realDir}), not from npm`,
			);
			assert.ok(
				fs.existsSync(path.join(resolvedDir, "dist", "runtime", "index.js")),
				"the ./runtime subpath export is missing from the resolved package — " +
					`${POYO_PKG}@${version} on npm predates the client runtime (ADR 0005); ` +
					"the gate stays red until a version shipping dist/runtime/ is published",
			);
			assert.ok(
				fs.existsSync(
					path.join(resolvedDir, "dist", "runtime", "route-table.js"),
				),
				"dist/runtime/route-table.js is missing from the resolved package — " +
					`${POYO_PKG}@${version} on npm predates the route table (ADR 0006); ` +
					"the gate stays red until a version shipping dist/runtime/route-table.js is published",
			);

			// 5. Build the client and prove the accessor ships in the bundle.
			const build = run("pnpm", ["run", "client:build"], fixture, 300_000);
			assert.equal(build.status, 0, `client build failed:\n${build.output}`);

			const bundle = collectFiles(path.join(fixture, CLIENT_DIR, "dist"))
				.filter((file) => file.endsWith(".js"))
				.map((file) => fs.readFileSync(file, "utf-8"))
				.join("\n");
			assert.match(
				bundle,
				/usePage/,
				"usePage accessor missing from the built client bundle",
			);
			assert.match(
				bundle,
				/SERVER_DATA/,
				"usePage's window.SERVER_DATA channel missing from the built bundle",
			);
			// The route-table module's own diagnostic prefix: the minifier
			// renames the createRouteTable identifier, so the literal
			// [RouteTable] prefix from route-table.ts is the stable proof
			// that the module shipped in the bundle.
			assert.match(
				bundle,
				/\[RouteTable\]/,
				"route-table module missing from the built client bundle " +
					"([RouteTable] diagnostics absent)",
			);

			fs.rmSync(tmpRoot, { recursive: true, force: true });
		} catch (error) {
			console.error(`Fixture left at ${fixture} for debugging.`);
			throw error;
		}
	},
);

test(
	"published create-poyo-app installs standalone and scaffolds a project",
	// pnpm dlx downloads the published package and installs it with its
	// dependencies — the one path the local-CLI test above cannot see.
	// Catches a workspace:* protocol leaking into the published manifest
	// (0.3.0 shipped exactly that; pnpm publish rewrites workspace deps,
	// npm publish does not). Red until a working version is published.
	{ timeout: 300_000 },
	() => {
		const version = releaseVersion();
		const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-dlx-"));
		const fixture = path.join(tmpRoot, "SmokeDlx");
		try {
			const dlx = run(
				"pnpm",
				[
					"dlx",
					`@rubichandrap/create-poyo-app@${version}`,
					"SmokeDlx",
					"--skip-install",
				],
				tmpRoot,
				240_000,
			);
			if (dlx.status !== 0) {
				const published = run(
					"npm",
					["view", `@rubichandrap/create-poyo-app@${version}`, "version"],
					REPO_ROOT,
					60_000,
				);
				const missingFromRegistry =
					published.status !== 0 &&
					/404|no match found/i.test(published.output);
				if (missingFromRegistry) {
					throw new Error(
						`[RED-UNTIL-PUBLISHED] @rubichandrap/create-poyo-app@${version} ` +
							"is not on npm yet — publish the release first.",
					);
				}
				throw new Error(
					`published create-poyo-app@${version} failed to install/run ` +
						`standalone (workspace:* leaked?):\n${dlx.output}`,
				);
			}
			const rootPkg = readJson(path.join(fixture, "package.json"));
			assert.equal(
				rootPkg.devDependencies[POYO_PKG],
				version,
				"root manifest not pinned to the release version",
			);
			fs.rmSync(tmpRoot, { recursive: true, force: true });
		} catch (error) {
			console.error(`Fixture left at ${fixture} for debugging.`);
			throw error;
		}
	},
);
