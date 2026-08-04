import { describe, expect, it } from "vitest";
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

	it("keeps routes.json and .env intact", () => {
		const cwd = makeTempDir();
		runCli(["MyApp", "--skip-install"], { cwd });

		const routes = readJson(cwd, "MyApp/routes.json") as {
			path: string;
		}[];
		expect(routes.some((r) => r.path === "/Dashboard")).toBe(true);

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
});
