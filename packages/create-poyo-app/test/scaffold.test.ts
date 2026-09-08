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

	it("renames Poyo to the project name inside file contents", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const controller = readFile(
			cwd,
			"MyApp/MyApp.Server/Controllers/PageController.cs",
		);
		expect(controller).toContain("namespace MyApp.Server.Controllers;");
		expect(controller).not.toContain("Poyo.Server");

		const slnx = readFile(cwd, "MyApp/MyApp.slnx");
		expect(slnx).toContain('Path="MyApp.Server/MyApp.Server.csproj"');
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

	it("ships a workspace manifest listing the renamed client and server", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const ws = readFile(cwd, "MyApp/pnpm-workspace.yaml");
		expect(ws).toContain("myapp.client");
		expect(ws).toContain("MyApp.Server");
		expect(ws).not.toContain("Poyo");
		expect(ws).not.toContain("poyo.client");
	});

	it("copies the committed route table to the client package root without predev hook", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		expect(exists(cwd, "MyApp/myapp.client/routes.generated.ts")).toBe(true);
		expect(
			exists(cwd, "MyApp/myapp.client/src/routes/routes.generated.ts"),
		).toBe(false);

		const manifest = readFile(cwd, "MyApp/myapp.client/routes.generated.ts");
		expect(manifest).toContain("export const routeManifest =");
		expect(manifest).toContain(
			"export function routePath(name: RouteName): RoutePath",
		);

		const clientPkg = readJson(cwd, "MyApp/myapp.client/package.json") as {
			scripts: Record<string, string>;
		};
		expect(clientPkg.scripts.predev).toBeUndefined();
	});

	it("copies the committed openapi snapshot and gitignores generated schemas", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		expect(exists(cwd, "MyApp/myapp.client/openapi/openapi.json")).toBe(true);
		const gitignore = readFile(cwd, "MyApp/myapp.client/.gitignore");
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

	it("freshly scaffolded client type-checks without any generate step", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const clientDir = path.join(cwd, "MyApp", "myapp.client");
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
		const tscBin = path.join(templateClientModules, ".bin", "tsc");
		const result = spawnSync(tscBin, ["-p", "tsconfig.app.json", "--noEmit"], {
			cwd: clientDir,
			encoding: "utf-8",
		});
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
				'		"typescript": "5.9.3"',
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
