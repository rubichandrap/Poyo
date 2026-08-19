/**
 * Release-time fixture e2e: the npm-resolution proof (issue #27) and
 * first-run experience verification (issue #06).
 *
 * Scaffolds a real project with the local create-poyo-app CLI, runs
 * `pnpm install` inside it, and asserts the chain generated projects depend
 * on, end to end:
 *
 *   1. A real project is scaffolded with the local scaffolder's built CLI.
 *   2. Fresh scaffold carries committed route table at client package root,
 *      un-ignored in .gitignore, bootstrapped .env, no predev hook.
 *   3. The scaffolder pins `@rubichandrap/poyo` to the release version in
 *      both the root and client manifests (workspace:* rewritten away).
 *   4. `pnpm install` resolves that version from npm — the version is read
 *      back from node_modules and its realpath must not be the monorepo
 *      (a workspace link would pass the install but prove nothing).
 *   5. The resolved package ships the `./runtime` subpath (dist/runtime/),
 *      including the route-table module (dist/runtime/route-table.js).
 *   6. Offline OpenAPI codegen (`pnpm run generate`) generates TS types and
 *      Zod schemas from the committed snapshot without a running server.
 *   7. Client type-checks and builds offline; bundle carries the runtime
 *      surface (`usePage`, `window.SERVER_DATA`, `[RouteTable]`).
 *   8. Server boot exports OpenAPI snapshot in-process without network requests.
 *   9. Served page renders HTML with data-page-name and data-base-path.
 *
 * This test is a publish-time gate, wired into `pnpm run test:release`. It is
 * RED until the release version is published: an unpublished version fails
 * pnpm install with a resolution error, which the fixture surfaces with a
 * [RED-UNTIL-PUBLISHED] diagnostic. Run it after publishing (or at any time)
 * to prove the published packages work together.
 */

import { before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
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
const SERVER_DIR = "fixtureApp.Server";

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

function getFreePort() {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => {
			const address = srv.address();
			if (!address || typeof address === "string") {
				srv.close(() => reject(new Error("Invalid server address")));
				return;
			}
			const port = address.port;
			srv.close((err) => {
				if (err) reject(err);
				else resolve(port);
			});
		});
	});
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
	// 120s + install 600s + client build 300s + server boot 120s = 1440s) so the
	// per-step timeouts, not the outer test timeout, are the effective caps.
	{ timeout: 1_800_000 },
	async () => {
		const version = releaseVersion();
		const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-fixture-"));
		const fixture = path.join(tmpRoot, PROJECT_NAME);
		let serverProcess = null;
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

			// 2. Pre-install first-run experience assertions:
			//    - Pinned version in root and client manifests
			//    - .env bootstrapped from .env.example
			//    - Committed route table at client root, not gitignored
			//    - Generated schema DTOs/validations gitignored
			//    - No circular-deadlock predev hook in client package.json
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
			assert.equal(
				clientPkg.scripts?.predev,
				undefined,
				"client package.json should not contain a predev hook",
			);

			assert.ok(
				fs.existsSync(path.join(fixture, ".env")),
				".env file missing after scaffolding",
			);
			const envContent = fs.readFileSync(path.join(fixture, ".env"), "utf-8");
			assert.match(
				envContent,
				/VITE_APP_NAME=FixtureApp/,
				".env does not contain project name",
			);

			const clientRouteTable = path.join(
				fixture,
				CLIENT_DIR,
				"routes.generated.ts",
			);
			assert.ok(
				fs.existsSync(clientRouteTable),
				"routes.generated.ts missing at client package root in fresh scaffold",
			);
			assert.ok(
				!fs.existsSync(
					path.join(
						fixture,
						CLIENT_DIR,
						"src",
						"routes",
						"routes.generated.ts",
					),
				),
				"routes.generated.ts should not exist in src/routes/",
			);

			const clientGitignore = fs.readFileSync(
				path.join(fixture, CLIENT_DIR, ".gitignore"),
				"utf-8",
			);
			assert.ok(
				!clientGitignore.includes("routes.generated.ts"),
				"routes.generated.ts must not be gitignored in client",
			);
			assert.ok(
				clientGitignore.includes("src/schemas/dtos.generated.ts"),
				"dtos.generated.ts must be gitignored in client",
			);
			assert.ok(
				clientGitignore.includes("src/schemas/validations.generated.ts"),
				"validations.generated.ts must be gitignored in client",
			);

			const routeTableContent = fs.readFileSync(clientRouteTable, "utf-8");
			assert.match(
				routeTableContent,
				/export const routeManifest =/,
				"routes.generated.ts missing routeManifest export",
			);
			assert.match(
				routeTableContent,
				/export function routePath/,
				"routes.generated.ts missing routePath helper",
			);

			const initialSnapshot = path.join(
				fixture,
				CLIENT_DIR,
				"openapi",
				"openapi.json",
			);
			assert.ok(
				fs.existsSync(initialSnapshot),
				"openapi/openapi.json missing in fresh scaffold",
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
			const resolvedGenerateSrc = fs.readFileSync(
				path.join(resolvedDir, "dist", "commands", "generate.js"),
				"utf-8",
			);
			assert.ok(
				resolvedGenerateSrc.includes("openapi/openapi.json") ||
					resolvedGenerateSrc.includes("defaultSnapshot"),
				"dist/commands/generate.js is missing snapshot-only codegen — " +
					`${POYO_PKG}@${version} on npm predates offline snapshot codegen; ` +
					"the gate stays red until a version shipping offline snapshot codegen is published",
			);

			// 5. Offline codegen verification: generate DTOs and Zod schemas
			// completely offline from the committed openapi/openapi.json snapshot.
			const dtosPath = path.join(
				fixture,
				CLIENT_DIR,
				"src",
				"schemas",
				"dtos.generated.ts",
			);
			const validationsPath = path.join(
				fixture,
				CLIENT_DIR,
				"src",
				"schemas",
				"validations.generated.ts",
			);
			fs.rmSync(dtosPath, { force: true });
			fs.rmSync(validationsPath, { force: true });

			const generate = run("pnpm", ["run", "generate"], fixture, 120_000);
			assert.equal(
				generate.status,
				0,
				`offline pnpm run generate failed:\n${generate.output}`,
			);
			assert.ok(
				fs.existsSync(dtosPath),
				"dtos.generated.ts was not generated by offline generate",
			);
			assert.ok(
				fs.existsSync(validationsPath),
				"validations.generated.ts was not generated by offline generate",
			);
			assert.match(
				fs.readFileSync(dtosPath, "utf-8"),
				/LoginRequest/,
				"dtos.generated.ts missing LoginRequest",
			);
			assert.match(
				fs.readFileSync(validationsPath, "utf-8"),
				/export const schemas/,
				"validations.generated.ts missing schemas export",
			);

			// 6. Client type-check passes offline without any server running.
			const typeCheck = run(
				"pnpm",
				["run", "client:type-check"],
				fixture,
				120_000,
			);
			assert.equal(
				typeCheck.status,
				0,
				`client type-check failed:\n${typeCheck.output}`,
			);

			// 7. Build the client and prove the accessor ships in the bundle.
			const clientBuild = run(
				"pnpm",
				["run", "client:build"],
				fixture,
				300_000,
			);
			assert.equal(
				clientBuild.status,
				0,
				`client build failed:\n${clientBuild.output}`,
			);

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

			// 8. Server build succeeds.
			const serverBuild = run(
				"pnpm",
				["run", "server:build"],
				fixture,
				300_000,
			);
			assert.equal(
				serverBuild.status,
				0,
				`server build failed:\n${serverBuild.output}`,
			);

			// 9. In-process OpenAPI snapshot generation on server boot:
			// Delete snapshot, boot server, and assert server writes fresh snapshot.
			const snapshotFile = path.join(
				fixture,
				CLIENT_DIR,
				"openapi",
				"openapi.json",
			);
			fs.rmSync(snapshotFile, { force: true });
			assert.ok(!fs.existsSync(snapshotFile), "Snapshot was not cleared");

			const serverPort = await getFreePort();
			const serverDll = path.join(
				fixture,
				SERVER_DIR,
				"bin",
				"Debug",
				"net10.0",
				`${PROJECT_NAME}.Server.dll`,
			);

			serverProcess = spawn(
				"dotnet",
				[serverDll, "--urls", `http://127.0.0.1:${serverPort}`],
				{
					cwd: path.join(fixture, SERVER_DIR),
					env: {
						...process.env,
						ASPNETCORE_ENVIRONMENT: "Development",
						Vite__Server__AutoRun: "false",
						Vite__Server__DevServerUrl: "http://localhost:5173",
						ASPNETCORE_URLS: `http://127.0.0.1:${serverPort}`,
					},
					stdio: ["ignore", "pipe", "pipe"],
				},
			);

			let serverReady = false;
			for (let attempt = 0; attempt < 50; attempt++) {
				await new Promise((r) => setTimeout(r, 200));
				try {
					const res = await fetch(`http://127.0.0.1:${serverPort}/Login`);
					if (res.status === 200) {
						serverReady = true;
						break;
					}
				} catch {
					// Server is still starting up
				}
			}
			assert.ok(
				serverReady,
				`Server failed to start and respond on port ${serverPort}`,
			);

			// Assert in-process OpenAPI snapshot generation
			assert.ok(
				fs.existsSync(snapshotFile),
				"Server boot did not write openapi/openapi.json snapshot in-process",
			);
			const generatedOpenApi = readJson(snapshotFile);
			assert.match(
				generatedOpenApi.openapi,
				/^3\./,
				"OpenAPI snapshot must be version 3.x",
			);
			assert.ok(
				generatedOpenApi.paths?.["/api/Auth/Login"],
				"OpenAPI snapshot missing /api/Auth/Login endpoint",
			);
			assert.ok(
				generatedOpenApi.components?.schemas?.LoginRequest,
				"OpenAPI snapshot missing LoginRequest schema",
			);

			// 10. Served HTML and hydration binding verification:
			//     - Guest page (/Login): renders with data-page-name and data-base-path
			//     - Home page (/): renders with data-page-name="Home"
			//     - Protected page (/Dashboard): redirects unauthenticated guest to /Login
			const loginRes = await fetch(`http://127.0.0.1:${serverPort}/Login`);
			assert.equal(loginRes.status, 200);
			const loginHtml = await loginRes.text();
			assert.match(
				loginHtml,
				/data-base-path="\/"/,
				"Served HTML must contain data-base-path='/'",
			);
			assert.match(
				loginHtml,
				/data-page-name="Login"/,
				"Served HTML must contain data-page-name='Login'",
			);
			assert.match(
				loginHtml,
				/<div id="react-root" data-page-name="Login"><\/div>/,
				"react-root element missing from served HTML",
			);

			const homeRes = await fetch(`http://127.0.0.1:${serverPort}/`);
			assert.equal(homeRes.status, 200);
			const homeHtml = await homeRes.text();
			assert.match(
				homeHtml,
				/data-page-name="Home"/,
				"Home page served HTML must declare data-page-name='Home'",
			);

			const dashRes = await fetch(`http://127.0.0.1:${serverPort}/Dashboard`, {
				redirect: "manual",
			});
			assert.ok(
				[301, 302, 307, 308].includes(dashRes.status),
				`Protected route /Dashboard should redirect anonymous request (status was ${dashRes.status})`,
			);
			assert.match(
				dashRes.headers.get("location") || "",
				/\/Login/,
				"Protected route redirect should target /Login",
			);

			if (serverProcess && !serverProcess.killed) {
				serverProcess.kill("SIGTERM");
				serverProcess = null;
			}

			fs.rmSync(tmpRoot, { recursive: true, force: true });
		} catch (error) {
			if (serverProcess && !serverProcess.killed) {
				serverProcess.kill("SIGTERM");
			}
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
