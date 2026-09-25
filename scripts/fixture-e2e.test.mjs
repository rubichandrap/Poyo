/**
 * Release-time fixture e2e: the npm-resolution proof (issue #27) and
 * first-run experience verification (issue #06).
 *
 * Scaffolds a real project with the local create-poyo-app CLI, runs
 * `pnpm install` inside it, and asserts the chain generated projects depend
 * on, end to end:
 *
 *   1. A real project is scaffolded with the local scaffolder's built CLI.
 *   2. Fresh scaffold gitignores route manifest at client package root,
 *      bootstrapped .env, no predev hook.
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
 *      surface (`usePage`, `window.SERVER_DATA`, `[RouteTable]`) plus the
 *      dynamic-navigation surface (router wire literal, `Link` opt-out
 *      attribute, the `routePath` init guard).
 *   8. Server build compiles the C# server core straight from the installed
 *      package (no in-tree framework copies).
 *   9. Server boot exports OpenAPI snapshot in-process without network requests.
 *  10. Served page renders HTML with data-page-name and data-base-path.
 *  11. The dynamic-navigation wire contract (ADR 0009): a descriptor request
 *      answers JSON `{name, seo, pageData}` with `Vary: X-Poyo-Navigation`;
 *      an opted-out route (`"dynamic": false`, the field intact after the
 *      scaffolder's rename) answers the document; a protected route
 *      challenges anonymous descriptor callers without leaking the payload;
 *      an authenticated descriptor carries the document's own page data.
 *  12. No committed route manifest and no client `index.html` in the
 *      generated project.
 *
 * This test is a publish-time gate, wired into `pnpm run test:release`. It is
 * RED until the release version is published: an unpublished version fails
 * pnpm install with a resolution error, which the fixture surfaces with a
 * [RED-UNTIL-PUBLISHED] diagnostic. Run it after publishing (or at any time)
 * to prove the published packages work together.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const SCAFFOLDER_PKG = path.join(REPO_ROOT, "packages", "create-poyo-app");
const SCAFFOLDER_BIN = path.join(SCAFFOLDER_PKG, "dist", "index.js");
const POYO_PKG = "@rubichandrap/poyo";

// The scaffolder's rename rule turns poyo.client into <lower>.client and
// Poyo.Server into <Pascal>.Server, so a project named fixtureApp produces
// fixtureapp.client and FixtureApp.Server — pinned here so a change to that
// rename rule fails this test loudly.
const PROJECT_NAME = "fixtureApp";
const CLIENT_DIR = "fixtureapp.client";
const SERVER_DIR = "FixtureApp.Server";
const PROJECT_PASCAL =
	PROJECT_NAME.charAt(0).toUpperCase() + PROJECT_NAME.slice(1);

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

const PRIVATE_NO_STORE = "private, no-store";
const NAVIGATION_HEADER = "X-Poyo-Navigation";
const AUTH_COOKIE_PREFIX = ".AspNetCore.Cookies=";

function setCookiesOf(response) {
	return typeof response.headers.getSetCookie === "function"
		? response.headers.getSetCookie()
		: [response.headers.get("set-cookie")].filter(Boolean);
}

function assertPrivateNoStore(response) {
	assert.equal(response.headers.get("cache-control"), PRIVATE_NO_STORE);
	assert.equal(response.headers.get("pragma"), null);
	assert.equal(response.headers.get("expires"), null);
}

function assertPageResponse(response) {
	assertPrivateNoStore(response);
	assert.equal(response.headers.get("vary"), NAVIGATION_HEADER);
}

function assertAuthenticationCookie(response) {
	assert.ok(
		setCookiesOf(response).some((cookie) =>
			cookie.startsWith(AUTH_COOKIE_PREFIX),
		),
		"authentication response did not set the session cookie",
	);
}

function assertPrivateAuthenticationResponse(response) {
	assertPrivateNoStore(response);
	assertAuthenticationCookie(response);
}

function assertRedirectTo(response, expectedPath) {
	assert.ok(
		[301, 302, 307, 308].includes(response.status),
		`expected a redirect (status was ${response.status})`,
	);
	const location = response.headers.get("location");
	assert.ok(location, "redirect response has no Location header");
	assert.equal(new URL(location, "http://fixture.test").pathname, expectedPath);
}

function sameOriginDescriptorInit(headers = {}) {
	return { credentials: "same-origin", headers };
}

/**
 * Returns the response's cookies as one Cookie request header value. The demo
 * login sets the auth cookie; the fixture relays it by hand because its fetch
 * has no cookie jar.
 */
function authCookieOf(response) {
	return setCookiesOf(response)
		.map((cookie) => cookie.split(";")[0])
		.join("; ");
}

function extractDocumentPageData(documentBody) {
	const marker = "window.SERVER_DATA = JSON.parse(";
	const markerStart = documentBody.indexOf(marker);
	assert.notEqual(markerStart, -1, "the document does not contain Page data");

	const start = markerStart + marker.length;
	const end = documentBody.indexOf(");</script>", start);
	assert.ok(end > start, "the document Page data script is not closed");

	const json = JSON.parse(documentBody.slice(start, end));
	return JSON.parse(json);
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
				!fs.existsSync(clientRouteTable),
				"routes.generated.ts should not be committed at client package root in fresh scaffold",
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
				clientGitignore.includes("routes.generated.ts"),
				"routes.generated.ts must be gitignored in client",
			);
			assert.ok(
				clientGitignore.includes("src/schemas/dtos.generated.ts"),
				"dtos.generated.ts must be gitignored in client",
			);
			assert.ok(
				clientGitignore.includes("src/schemas/validations.generated.ts"),
				"validations.generated.ts must be gitignored in client",
			);

			// 2b. The dynamic-navigation seam's generated shape (ADR 0008/0009):
			//     the server compiles the framework source from the installed
			//     package, the registry's opt-out survives the scaffolder's
			//     rename untouched, and no dead client entry files ship.
			const scaffoldedRoutes = readJson(path.join(fixture, "routes.json"));
			const optOutRoute = scaffoldedRoutes.find(
				(route) => route.name === "Register",
			);
			assert.ok(
				optOutRoute,
				"scaffolded registry is missing the Register route",
			);
			assert.equal(
				optOutRoute.dynamic,
				false,
				'the Register route\'s "dynamic": false did not survive the rename',
			);

			const serverCsproj = fs.readFileSync(
				path.join(fixture, SERVER_DIR, `${SERVER_DIR}.csproj`),
				"utf-8",
			);
			assert.ok(
				serverCsproj.includes(
					"../node_modules/@rubichandrap/poyo/server/**/*.cs",
				),
				"the server csproj must compile the framework source from the installed package",
			);
			assert.ok(
				!fs.existsSync(path.join(fixture, SERVER_DIR, "Routing")),
				"the scaffolded server must not carry an in-tree framework copy",
			);
			assert.ok(
				!fs.existsSync(
					path.join(fixture, SERVER_DIR, "Controllers", "PageController.cs"),
				),
				"the scaffolded server must not carry an in-tree framework controller",
			);

			assert.ok(
				!fs.existsSync(path.join(fixture, CLIENT_DIR, "index.html")),
				"the scaffolded client must not ship an index.html",
			);
			assert.ok(
				!fs.existsSync(path.join(fixture, CLIENT_DIR, "src", "index.html")),
				"the scaffolded client must not ship a src/index.html",
			);

			const missingViewRoute = {
				path: "/MissingView",
				name: "MissingView",
				files: {
					react: "src/pages/MissingView/index.page.tsx",
					view: "Views/DoesNotExist/Index.cshtml",
				},
				access: "public",
			};
			scaffoldedRoutes.push(missingViewRoute);
			fs.writeFileSync(
				path.join(fixture, "routes.json"),
				`${JSON.stringify(scaffoldedRoutes, null, 2)}\n`,
			);
			const missingViewPage = path.join(
				fixture,
				CLIENT_DIR,
				"src",
				"pages",
				"MissingView",
				"index.page.tsx",
			);
			fs.mkdirSync(path.dirname(missingViewPage), { recursive: true });
			fs.copyFileSync(
				path.join(
					fixture,
					CLIENT_DIR,
					"src",
					"pages",
					"Register",
					"index.page.tsx",
				),
				missingViewPage,
			);
			fs.writeFileSync(
				path.join(
					fixture,
					SERVER_DIR,
					"Controllers",
					"Api",
					"TestUnrelatedController.cs",
				),
				`using Microsoft.AspNetCore.Mvc;\nusing ${PROJECT_PASCAL}.Server.Primitives;\n\nnamespace ${PROJECT_PASCAL}.Server.Controllers.Api;\n\n[ApiController]\n[Route("api/[controller]")]\npublic sealed class TestUnrelatedController : ControllerBase\n{\n    [HttpGet]\n    public ActionResult<JSendResponse<object>> Get()\n    {\n        return Ok(JSend.Success<object>(new { status = "ok" }));\n    }\n}\n`,
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
			// The dynamic-navigation subpaths (ADR 0009): the template's app
			// shell imports the router and Link from here.
			assert.ok(
				fs.existsSync(path.join(resolvedDir, "dist", "runtime", "router.js")) &&
					fs.existsSync(path.join(resolvedDir, "dist", "runtime", "link.js")),
				"the resolved package does not ship the navigation subpaths " +
					`(dist/runtime/router.js, dist/runtime/link.js) — ${POYO_PKG}@${version} ` +
					"on npm predates dynamic navigation (ADR 0009); the gate stays red " +
					"until a version shipping them is published",
			);
			// The csproj compiles this source in place (ADR 0008): without it
			// in the published package, the generated server cannot build.
			assert.ok(
				fs.existsSync(path.join(resolvedDir, "server", "RoutePolicy.cs")),
				"the resolved package does not ship the C# server core " +
					`(server/RoutePolicy.cs) — ${POYO_PKG}@${version} on npm predates ` +
					"(ADR 0008); the gate stays red until a version shipping server/ is published",
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
			const generatedRouteTable = path.join(
				fixture,
				CLIENT_DIR,
				"routes.generated.ts",
			);
			assert.ok(
				fs.existsSync(generatedRouteTable),
				"routes.generated.ts was not generated by offline generate",
			);
			const routeTableContent = fs.readFileSync(generatedRouteTable, "utf-8");
			assert.match(
				routeTableContent,
				/declare module "@rubichandrap\/poyo\/runtime"/,
				"routes.generated.ts missing runtime module augmentation",
			);
			assert.match(
				routeTableContent,
				/interface PoyoRouteRegistry/,
				"routes.generated.ts missing PoyoRouteRegistry interface",
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
			// The dynamic-navigation surface, anchored on literals the
			// minifier cannot rename: the router's wire header (router.ts),
			// Link's opt-out attribute (link.tsx), and the routePath init
			// guard message (route-table.ts).
			assert.match(
				bundle,
				/X-Poyo-Navigation/,
				"the router's navigation wire literal is missing from the built client bundle",
			);
			assert.match(
				bundle,
				/same-origin/,
				"the router's same-origin credential mode is missing from the built client bundle",
			);
			assert.match(
				bundle,
				/data-dynamic-nav/,
				"the Link module's opt-out attribute is missing from the built client bundle",
			);
			assert.match(
				bundle,
				/Route table not initialized/,
				"the runtime route helper (routePath) is missing from the built client bundle",
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
				"FixtureApp.Server.dll",
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
			assertPageResponse(loginRes);
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
			assertPageResponse(homeRes);
			const homeHtml = await homeRes.text();
			assert.match(
				homeHtml,
				/data-page-name="Home"/,
				"Home page served HTML must declare data-page-name='Home'",
			);

			const dashRes = await fetch(`http://127.0.0.1:${serverPort}/Dashboard`, {
				redirect: "manual",
			});
			assertRedirectTo(dashRes, "/Login");
			assertPrivateNoStore(dashRes);

			// 11. The dynamic-navigation wire contract (ADR 0009) as the
			//     scaffolded server answers it: descriptor JSON + Vary for
			//     dynamic routes, the document for the opted-out route, a
			//     challenge (never a payload) for anonymous protected calls,
			//     and page data structurally equal to the document's injection.
			const navHeaders = { "X-Poyo-Navigation": "1" };

			const loginDescriptorRes = await fetch(
				`http://127.0.0.1:${serverPort}/Login`,
				sameOriginDescriptorInit(navHeaders),
			);
			assert.equal(
				loginDescriptorRes.status,
				200,
				"descriptor request for a dynamic route must answer",
			);
			assert.equal(
				loginDescriptorRes.headers.get("content-type")?.split(";")[0],
				"application/json",
				"a descriptor request must answer JSON, not the document",
			);
			assertPageResponse(loginDescriptorRes);
			const loginDescriptor = await loginDescriptorRes.json();
			assert.equal(loginDescriptor.name, "Login");
			assert.equal(loginDescriptor.seo?.title, "Login");
			// Registry copy rides the rename too: the template's "Sign in to
			// Poyo framework demo" reaches the descriptor as the project's
			// own name.
			assert.equal(
				loginDescriptor.seo?.description,
				`Sign in to ${PROJECT_PASCAL} framework demo`,
			);
			assert.equal(
				loginDescriptor.pageData,
				null,
				"a page without server data must send pageData null",
			);
			assert.ok(
				!loginHtml.includes("window.SERVER_DATA"),
				"the Login document injects no window.SERVER_DATA — its null pageData matches",
			);

			// The opted-out route ("dynamic": false) answers the document
			// even when the request carries the navigation header.
			const registerRes = await fetch(
				`http://127.0.0.1:${serverPort}/Register`,
				sameOriginDescriptorInit(navHeaders),
			);
			assert.equal(registerRes.status, 200);
			assertPageResponse(registerRes);
			assert.match(
				registerRes.headers.get("content-type") || "",
				/^text\/html/,
				"the opted-out route must answer descriptor requests with the document",
			);
			const registerHtml = await registerRes.text();
			assert.match(registerHtml, /<!DOCTYPE html>/);
			assert.match(registerHtml, /data-page-name="Register"/);

			const missingDescriptorRes = await fetch(
				`http://127.0.0.1:${serverPort}/MissingView`,
				sameOriginDescriptorInit(navHeaders),
			);
			assert.equal(missingDescriptorRes.status, 404);
			assertPageResponse(missingDescriptorRes);

			// The protected route challenges an anonymous descriptor request;
			// no payload may leak through the challenge.
			const protectedDescriptorRes = await fetch(
				`http://127.0.0.1:${serverPort}/Dashboard`,
				{ ...sameOriginDescriptorInit(navHeaders), redirect: "manual" },
			);
			assertRedirectTo(protectedDescriptorRes, "/Login");
			assert.ok(
				!(await protectedDescriptorRes.text()).includes("pageData"),
				"a challenged descriptor must not leak its payload",
			);
			assertPrivateNoStore(protectedDescriptorRes);

			// The descriptor and document use the same representation for the
			// stable fields; the controller's timestamp is request-specific.
			const loginApiRes = await fetch(
				`http://127.0.0.1:${serverPort}/api/Auth/Login`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ username: "demo", password: "password" }),
				},
			);
			assert.equal(loginApiRes.status, 200, "the demo login must succeed");
			assertPrivateAuthenticationResponse(loginApiRes);
			let authCookie = authCookieOf(loginApiRes);
			assert.ok(authCookie.length > 0, "the demo login set no auth cookie");

			const guestDescriptorRes = await fetch(
				`http://127.0.0.1:${serverPort}/Login`,
				{
					...sameOriginDescriptorInit({ ...navHeaders, cookie: authCookie }),
					redirect: "manual",
				},
			);
			assertRedirectTo(guestDescriptorRes, "/Dashboard");
			assertPrivateNoStore(guestDescriptorRes);

			const refreshApiRes = await fetch(
				`http://127.0.0.1:${serverPort}/api/Auth/Refresh`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						cookie: authCookie,
					},
					body: JSON.stringify({
						token: "demo-token",
						refreshToken: "demo-refresh-token",
					}),
				},
			);
			assert.equal(refreshApiRes.status, 200, "the demo refresh must succeed");
			assertPrivateAuthenticationResponse(refreshApiRes);
			authCookie = authCookieOf(refreshApiRes);
			assert.ok(authCookie.length > 0, "the demo refresh set no auth cookie");

			const unrelatedApiRes = await fetch(
				`http://127.0.0.1:${serverPort}/api/test-unrelated`,
				{ headers: { cookie: authCookie } },
			);
			assert.equal(unrelatedApiRes.status, 200);
			assert.equal(unrelatedApiRes.headers.get("cache-control"), null);
			assert.equal(unrelatedApiRes.headers.get("pragma"), null);
			assert.equal(unrelatedApiRes.headers.get("expires"), null);
			const unrelatedApiBody = await unrelatedApiRes.json();
			assert.equal(unrelatedApiBody.status, "success");
			assert.equal(unrelatedApiBody.data.status, "ok");

			const dashboardDocumentRes = await fetch(
				`http://127.0.0.1:${serverPort}/Dashboard`,
				{ headers: { cookie: authCookie } },
			);
			assert.equal(dashboardDocumentRes.status, 200);
			assertPageResponse(dashboardDocumentRes);
			const dashboardHtml = await dashboardDocumentRes.text();
			const dashboardDocumentData = extractDocumentPageData(dashboardHtml);

			const dashboardDescriptorRes = await fetch(
				`http://127.0.0.1:${serverPort}/Dashboard`,
				sameOriginDescriptorInit({ ...navHeaders, cookie: authCookie }),
			);
			assert.equal(dashboardDescriptorRes.status, 200);
			assertPageResponse(dashboardDescriptorRes);
			const dashboardDescriptor = await dashboardDescriptorRes.json();
			assert.equal(dashboardDescriptor.name, "Dashboard");
			assert.equal(dashboardDescriptor.seo?.title, "Dashboard");
			assert.equal(
				dashboardDescriptor.pageData?.user,
				dashboardDocumentData.user,
				"the descriptor payload must carry the document's data",
			);
			assert.equal(dashboardDescriptor.pageData?.user, "demo");
			assert.equal(
				dashboardDescriptor.pageData?.message,
				dashboardDocumentData.message,
			);
			assert.deepEqual(
				Object.keys(dashboardDescriptor.pageData ?? {}).sort(),
				Object.keys(dashboardDocumentData).sort(),
				"the descriptor payload must have the document's shape",
			);

			const logoutApiRes = await fetch(
				`http://127.0.0.1:${serverPort}/api/Auth/Logout`,
				{ method: "POST", headers: { cookie: authCookie } },
			);
			assert.equal(logoutApiRes.status, 200, "the demo logout must succeed");
			assertPrivateAuthenticationResponse(logoutApiRes);

			const loggedOutCookie = authCookieOf(logoutApiRes);
			const postLogoutRes = await fetch(
				`http://127.0.0.1:${serverPort}/Dashboard`,
				{ headers: { cookie: loggedOutCookie }, redirect: "manual" },
			);
			assertRedirectTo(postLogoutRes, "/Login");
			assertPrivateNoStore(postLogoutRes);

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
