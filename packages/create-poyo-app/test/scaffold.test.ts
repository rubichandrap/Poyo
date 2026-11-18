import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureEnvFile } from "../src/index.js";
import { rewriteClientPackageJson } from "../src/rewrite.js";
import {
	OWN_VERSION,
	exists,
	makeTempDir,
	readFile,
	readJson,
	runCli,
} from "./helpers.js";

describe("create-poyo-app", () => {
	it("creates a project with renamed server, client, and slnx", () => {
		const cwd = makeTempDir();
		const result = runCli(["MyApp", "--skip-install"], { cwd });

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"Next: cd MyApp && pnpm run restore && pnpm run generate && pnpm run dev",
		);
		expect(exists(cwd, "MyApp/package.json")).toBe(true);
		expect(exists(cwd, "MyApp/MyApp.Server/Poyo.Server.csproj")).toBe(false);
		expect(exists(cwd, "MyApp/MyApp.Server/MyApp.Server.csproj")).toBe(true);
		expect(exists(cwd, "MyApp/myapp.client")).toBe(true);
		expect(exists(cwd, "MyApp/MyApp.slnx")).toBe(true);
	});

	it("drops the template's publishing metadata from the project manifest", () => {
		const cwd = makeTempDir();
		runCli(["Shop", "--skip-install"], { cwd });

		const manifest = JSON.parse(readFile(cwd, "Shop/package.json")) as Record<
			string,
			unknown
		>;
		// Left in, the rename turned the template's repository URL into
		// github.com/rubichandrap/Shop, a repository that does not exist.
		for (const field of ["repository", "homepage", "bugs", "keywords"]) {
			expect(manifest[field], field).toBeUndefined();
		}
		expect(manifest.name).toBe("shop");
	});

	it("renames Poyo to the project name inside file contents", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const controller = readFile(
			cwd,
			"MyApp/MyApp.Server/Controllers/Api/AuthController.cs",
		);
		expect(controller).toContain("namespace MyApp.Server.Controllers.Api;");
		expect(controller).not.toContain("Poyo.Server");

		const slnx = readFile(cwd, "MyApp/MyApp.slnx");
		expect(slnx).toContain('Path="MyApp.Server/MyApp.Server.csproj"');
	});

	it("keeps framework identifiers intact through the rename", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		// The server core lives inside the poyo package under the fixed
		// Poyo.Framework namespace (ADR 0008); Program.cs must keep calling it
		// by the fixed names in every generated project.
		const program = readFile(cwd, "MyApp/MyApp.Server/Program.cs");
		expect(program).toContain("using Poyo.Framework;");
		expect(program).toContain("AddPoyo");
		expect(program).toContain("MapPoyoRoutes");
		expect(program).not.toContain("MyApp.Framework");
		expect(program).not.toContain("MyAppAddPoyo");

		const layout = readFile(
			cwd,
			"MyApp/MyApp.Server/Views/Shared/_Layout.cshtml",
		);
		expect(layout).toContain("@Html.PoyoPageData()");
		expect(layout).not.toContain("MyAppPageData");

		const viewImports = readFile(
			cwd,
			"MyApp/MyApp.Server/Views/_ViewImports.cshtml",
		);
		expect(viewImports).toContain("@using Poyo.Framework");
	});

	it("keeps the framework host entry point verbatim under a non-default name", () => {
		const cwd = makeTempDir();
		runCli(["Shop", "--skip-install"], { cwd });

		// The framework owns the host bootstrap (ADR 0021); the generated
		// Program.cs calls it by its fixed name, so the rename must leave it
		// alone the way it leaves the other framework identifiers alone.
		const program = readFile(cwd, "Shop/Shop.Server/Program.cs");
		expect(program).toContain("PoyoHost.CreateBuilder(args)");
		expect(program).not.toContain("ShopHost.CreateBuilder");

		// The framework also applies the path base, so the call that replaces
		// the template's own UsePathBase block survives the same rename.
		expect(program).toContain("UsePoyoPathBase()");
		expect(program).not.toContain("UseShopPathBase");
	});

	it("keeps every Poyo-prefixed framework identifier verbatim under any name", () => {
		const cwd = makeTempDir();
		runCli(["Shop", "--skip-install"], { cwd });

		// A framework identifier is recognized by its shape — Poyo followed by
		// an uppercase letter — not by appearing on a hand-kept list, so one no
		// list names survives the rename too. The build guard is such an
		// identifier today.
		const csproj = readFile(cwd, "Shop/Shop.Server/Shop.Server.csproj");
		expect(csproj).toContain('Name="PoyoServerCoreGuard"');
		expect(csproj).not.toContain("ShopServerCoreGuard");

		// The dotted namespace and the header literal are protected on their
		// own spellings.
		const program = readFile(cwd, "Shop/Shop.Server/Program.cs");
		expect(program).toContain("using Poyo.Framework;");
		const pageResultTests = readFile(
			cwd,
			"Shop/Shop.Server.Tests/PageResultTests.cs",
		);
		expect(pageResultTests).toContain('"X-Poyo-Navigation"');

		// Everything that is the project's own is still renamed: the server and
		// test projects, their namespaces, and the client folder.
		expect(exists(cwd, "Shop/Shop.Server")).toBe(true);
		expect(exists(cwd, "Shop/Poyo.Server")).toBe(false);
		expect(exists(cwd, "Shop/Shop.Server.Tests/Shop.Server.Tests.csproj")).toBe(
			true,
		);
		expect(exists(cwd, "Shop/Poyo.Server.Tests")).toBe(false);
		expect(pageResultTests).toContain("namespace Shop.Server.Tests;");
		expect(exists(cwd, "Shop/shop.client")).toBe(true);
		expect(exists(cwd, "Shop/poyo.client")).toBe(false);
	});

	it("keeps the poyo CLI binary name in scripts and renames pnpm filters", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const pkg = readJson(cwd, "MyApp/package.json") as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts["client:dev"]).toBe("pnpm --filter ./myapp.client dev");
		expect(pkg.scripts["server:dev"]).toBe("pnpm --filter ./MyApp.Server dev");
		expect(pkg.scripts["route:add"]).toBe("poyo route add");
		expect(pkg.scripts.build).toContain("poyo build");
	});

	it("rewrites package.json with name, fresh version, and pinned poyo", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const pkg = readJson(cwd, "MyApp/package.json") as {
			name: string;
			version: string;
			private: boolean;
			devDependencies: Record<string, string>;
		};
		expect(pkg.name).toBe("myapp");
		expect(pkg.version).toBe("0.0.1");
		expect(pkg.private).toBe(true);
		expect(pkg.devDependencies["@rubichandrap/poyo"]).toBe(OWN_VERSION);
		expect(pkg.devDependencies["@rubichandrap/poyo"]).not.toBe("workspace:*");
	});

	it("rewrites the client's poyo devDependency to the released version", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const client = readJson(cwd, "MyApp/myapp.client/package.json") as {
			devDependencies: Record<string, string>;
		};
		expect(client.devDependencies["@rubichandrap/poyo"]).toBe(OWN_VERSION);
		expect(client.devDependencies["@rubichandrap/poyo"]).not.toBe(
			"workspace:*",
		);
	});

	it("renames the sub-package.json names", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const client = readJson(cwd, "MyApp/myapp.client/package.json") as {
			name: string;
		};
		expect(client.name).toBe("myapp.client");
	});

	it("does not copy node_modules or build artifacts", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		expect(exists(cwd, "MyApp/node_modules")).toBe(false);
		expect(exists(cwd, "MyApp/MyApp.Server/bin")).toBe(false);
		expect(exists(cwd, "MyApp/MyApp.Server/obj")).toBe(false);
		expect(exists(cwd, "MyApp/myapp.client/dist")).toBe(false);
		expect(exists(cwd, "MyApp/MyApp.Server/wwwroot/generated")).toBe(false);
	});

	it("supports --project", () => {
		const cwd = makeTempDir();
		const result = runCli(["--project", "OtherApp", "--skip-install"], { cwd });

		expect(result.status).toBe(0);
		expect(exists(cwd, "OtherApp/package.json")).toBe(true);
	});

	it("launches the dependency install without Node's shell deprecation warning", () => {
		const cwd = makeTempDir();
		const binDir = path.join(cwd, "bin");
		fs.mkdirSync(binDir);
		// A pnpm that succeeds at once: the test is the launch, not the install.
		if (process.platform === "win32") {
			fs.writeFileSync(path.join(binDir, "pnpm.cmd"), "@exit /b 0\r\n");
		} else {
			const shim = path.join(binDir, "pnpm");
			fs.writeFileSync(shim, "#!/bin/sh\nexit 0\n");
			fs.chmodSync(shim, 0o755);
		}

		const result = runCli(["Installed"], {
			cwd,
			env: { PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
		});

		expect(result.status, result.stderr).toBe(0);
		// Node 24 deprecates a shell launch that also passes an argument
		// vector; the scaffolder must not warn on every run, on every OS.
		expect(result.stderr).not.toContain("DEP0190");
		expect(result.stdout).toContain("Created Installed");
	});

	it("errors when the target directory already exists", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });
		const result = runCli(["MyApp", "--skip-install"], { cwd });

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("already exists");
	});

	it("bootstraps .env and keeps routes.json intact", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const routes = readJson(cwd, "MyApp/routes.json") as {
			path: string;
		}[];
		expect(routes.some((r) => r.path === "/Dashboard")).toBe(true);

		expect(exists(cwd, "MyApp/.env")).toBe(true);
		expect(exists(cwd, "MyApp/.env.example")).toBe(true);

		const env = readFile(cwd, "MyApp/.env");
		expect(env).toContain("VITE_APP_NAME=MyApp");
	});

	it("does not let the bootstrapped .env set the hosting environment", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		// The process owns the hosting environment. A generated project whose
		// own .env sets it would be a project that looks like it decides its
		// own environment and does not — a value that is ignored reads as one
		// that is honoured until the day it is not.
		for (const file of [".env", ".env.example"]) {
			const contents = readFile(cwd, `MyApp/${file}`);
			expect(contents).not.toMatch(/^ASPNETCORE_ENVIRONMENT=/m);
			expect(contents).not.toMatch(/^DOTNET_ENVIRONMENT=/m);
			// ... and it says where the hosting environment comes from.
			expect(contents).toContain("ASPNETCORE_ENVIRONMENT");
		}
	});

	it("ships a workspace manifest listing the renamed client and server", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const ws = readFile(cwd, "MyApp/pnpm-workspace.yaml");
		expect(ws).toContain("myapp.client");
		expect(ws).toContain("MyApp.Server");
		expect(ws).not.toContain("Poyo");
		expect(ws).not.toContain("poyo.client");
	});

	it("gitignores routes.generated.ts and leaves route manifest uncommitted at client root", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		expect(exists(cwd, "MyApp/myapp.client/routes.generated.ts")).toBe(false);
		expect(
			exists(cwd, "MyApp/myapp.client/src/routes/routes.generated.ts"),
		).toBe(false);

		const gitignore = readFile(cwd, "MyApp/myapp.client/.gitignore");
		expect(gitignore).toContain("routes.generated.ts");

		const clientPkg = readJson(cwd, "MyApp/myapp.client/package.json") as {
			scripts: Record<string, string>;
		};
		expect(clientPkg.scripts.predev).toBeUndefined();
	});

	it("compiles the server core from the package and keeps the navigation opt-out", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		// The C# server core ships inside @rubichandrap/poyo and compiles in
		// place (ADR 0008): the csproj includes the package source under
		// node_modules — an in-tree copy would freeze the framework again.
		const csproj = readFile(cwd, "MyApp/MyApp.Server/MyApp.Server.csproj");
		expect(csproj).toContain(
			"../node_modules/@rubichandrap/poyo/server/**/*.cs",
		);
		expect(exists(cwd, "MyApp/MyApp.Server/Routing")).toBe(false);
		expect(
			exists(cwd, "MyApp/MyApp.Server/Controllers/PageController.cs"),
		).toBe(false);

		// No dead index.html: the Razor views own every document, and the
		// Vite entry is the client module itself (ADR 0010).
		expect(exists(cwd, "MyApp/myapp.client/index.html")).toBe(false);

		// The registry reaches the generated project untouched — including
		// the dynamic-navigation opt-out (ADR 0009).
		const routes = readJson(cwd, "MyApp/routes.json") as {
			name: string;
			dynamic?: boolean;
		}[];
		expect(routes.find((route) => route.name === "Register")?.dynamic).toBe(
			false,
		);
	});

	it("copies the committed openapi snapshot and gitignores generated schemas", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		expect(exists(cwd, "MyApp/myapp.client/openapi/openapi.json")).toBe(true);
		const gitignore = readFile(cwd, "MyApp/myapp.client/.gitignore");
		expect(gitignore).toContain("routes.generated.ts");
		expect(gitignore).toContain("src/schemas/dtos.generated.ts");
		expect(gitignore).toContain("src/schemas/validations.generated.ts");
	});

	it("restores .gitignore from .gitignore.template with dynamic project name", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		expect(exists(cwd, "MyApp/.gitignore")).toBe(true);
		expect(exists(cwd, "MyApp/.gitignore.template")).toBe(false);

		const gitignore = readFile(cwd, "MyApp/.gitignore");
		expect(gitignore).toContain("MyApp.Server/wwwroot/generated/");
		expect(gitignore).toContain("MyApp.Server/wwwroot/manifest.json");
		expect(gitignore).toContain("MyApp.Server/wwwroot/index.html");
		expect(gitignore).toContain(
			"MyApp.Server/Views/Shared/_ReactAssets.cshtml",
		);
		expect(gitignore).not.toContain("Poyo.Server");

		expect(exists(cwd, "MyApp/myapp.client/.gitignore")).toBe(true);
		expect(exists(cwd, "MyApp/myapp.client/.gitignore.template")).toBe(false);
	});

	// The documented first steps are restore, generate, dev. `generate` writes
	// the gitignored route manifest, DTOs and Zod schemas offline from the
	// committed OpenAPI snapshot; the template ships none of them, so a client
	// type-checks after it and not before. This test passed "without any
	// generate step" only while a developer's workspace held those ignored
	// files, and failed on the first clean CI checkout.
	it("freshly scaffolded client type-checks after the offline generate step", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const projectDir = path.join(cwd, "MyApp");
		const clientDir = path.join(projectDir, "myapp.client");
		// The published template ships none of these; a workspace copy may
		// hold them from a local generate, so remove them to match npm.
		for (const generated of [
			"src/schemas/dtos.generated.ts",
			"src/schemas/validations.generated.ts",
			"routes.generated.ts",
		]) {
			fs.rmSync(path.join(clientDir, generated), { force: true });
		}
		const poyoCli = path.resolve(
			import.meta.dirname,
			"../../poyo/dist/index.js",
		);
		const generate = spawnSync(process.execPath, [poyoCli, "generate"], {
			cwd: projectDir,
			encoding: "utf-8",
		});
		expect(generate.status, generate.stderr).toBe(0);

		const templateClientModules = path.resolve(
			import.meta.dirname,
			"../../poyo-template/poyo.client/node_modules",
		);
		expect(fs.existsSync(templateClientModules)).toBe(true);
		fs.symlinkSync(
			templateClientModules,
			path.join(clientDir, "node_modules"),
			"junction",
		);
		// `.bin/tsc` is a POSIX shell shim, and a `tsc.cmd` on Windows, so it
		// is not spawnable by path on both. The compiler's entry point is:
		const tscBin = path.join(templateClientModules, "typescript", "bin", "tsc");
		const result = spawnSync(
			process.execPath,
			[tscBin, "-p", "tsconfig.app.json", "--noEmit"],
			{
				cwd: clientDir,
				encoding: "utf-8",
			},
		);
		expect(result.status).toBe(0);
	});

	describe("client manifest rewrite (unit seam)", () => {
		function writeClientManifest(
			cwd: string,
			manifest: Record<string, unknown>,
		): string {
			const clientDir = path.join(cwd, "myapp.client");
			fs.mkdirSync(clientDir, { recursive: true });
			const pkgPath = path.join(clientDir, "package.json");
			fs.writeFileSync(pkgPath, `${JSON.stringify(manifest, null, 2)}\n`);
			return pkgPath;
		}

		it("pins a workspace:* poyo dependency to the released version", () => {
			const cwd = makeTempDir();
			writeClientManifest(cwd, {
				name: "myapp.client",
				devDependencies: { "@rubichandrap/poyo": "workspace:*" },
			});

			rewriteClientPackageJson(cwd, "myapp", OWN_VERSION);

			const pkg = readJson(cwd, "myapp.client/package.json") as {
				devDependencies: Record<string, string>;
			};
			expect(pkg.devDependencies["@rubichandrap/poyo"]).toBe(OWN_VERSION);
		});

		it("leaves the client manifest untouched when the poyo dependency is absent", () => {
			const cwd = makeTempDir();
			// Deliberately non-canonical formatting (tabs, like the real
			// template): the skip must be a true no-write, not a
			// re-serialization that happens to round-trip.
			const original = [
				"{",
				'	"name": "myapp.client",',
				'	"devDependencies": {',
				'		"typescript": "6.0.3"',
				"	}",
				"}",
				"",
			].join("\n");
			const pkgPath = path.join(cwd, "myapp.client", "package.json");
			fs.mkdirSync(path.dirname(pkgPath), { recursive: true });
			fs.writeFileSync(pkgPath, original);

			rewriteClientPackageJson(cwd, "myapp", OWN_VERSION);

			expect(fs.readFileSync(pkgPath, "utf-8")).toBe(original);
		});
	});

	describe("env bootstrapping (unit seam)", () => {
		it("copies .env.example to .env if .env does not exist", () => {
			const cwd = makeTempDir();
			const examplePath = path.join(cwd, ".env.example");
			fs.writeFileSync(examplePath, "VITE_APP_NAME=Poyo\nPORT=5000\n");

			ensureEnvFile(cwd);

			const envPath = path.join(cwd, ".env");
			expect(fs.existsSync(envPath)).toBe(true);
			expect(fs.readFileSync(envPath, "utf-8")).toBe(
				"VITE_APP_NAME=Poyo\nPORT=5000\n",
			);
		});

		it("preserves existing .env when already present", () => {
			const cwd = makeTempDir();
			const examplePath = path.join(cwd, ".env.example");
			const envPath = path.join(cwd, ".env");
			fs.writeFileSync(examplePath, "VITE_APP_NAME=Poyo\nPORT=5000\n");
			fs.writeFileSync(envPath, "VITE_APP_NAME=Custom\nPORT=9999\n");

			ensureEnvFile(cwd);

			expect(fs.readFileSync(envPath, "utf-8")).toBe(
				"VITE_APP_NAME=Custom\nPORT=9999\n",
			);
		});

		it("does nothing if .env.example does not exist", () => {
			const cwd = makeTempDir();
			ensureEnvFile(cwd);
			expect(fs.existsSync(path.join(cwd, ".env"))).toBe(false);
		});
	});
});
