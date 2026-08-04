import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getPaths } from "../src/config.js";
import {
	execInFixture,
	makeFixture,
	readFixtureFile,
	writeFixtureFile,
	type Route,
} from "./helpers.js";

const starter: Route[] = [
	{
		path: "/Dashboard",
		name: "Dashboard",
		files: {
			react: "src/pages/Dashboard/index.page.tsx",
			view: "Views/Dashboard/Index.cshtml",
		},
		access: "protected",
	},
];

const CS_PROJECT = (namespace?: string) =>
	`<Project Sdk="Microsoft.NET.Sdk.Web">${
		namespace
			? `<PropertyGroup><RootNamespace>${namespace}</RootNamespace></PropertyGroup>`
			: ""
	}</Project>
`;

function renamedFixture(): ReturnType<typeof makeFixture> {
	const fixture = makeFixture(starter, {
		clientDir: "myapp.client",
		serverDir: "MyApp.Server",
	});
	writeFixtureFile(
		fixture,
		"MyApp.Server/MyApp.Server.csproj",
		CS_PROJECT(),
	);
	return fixture;
}

describe("project identity seam", () => {
	it("derives the server namespace from the csproj name", () => {
		const fixture = renamedFixture();
		expect(getPaths(fixture.dir).serverNamespace).toBe("MyApp.Server");
	});

	it("honors a RootNamespace override in the csproj", () => {
		const fixture = makeFixture(starter, {
			clientDir: "myapp.client",
			serverDir: "MyApp.Server",
		});
		writeFixtureFile(
			fixture,
			"MyApp.Server/MyApp.Server.csproj",
			CS_PROJECT("Custom.Ns"),
		);
		expect(getPaths(fixture.dir).serverNamespace).toBe("Custom.Ns");
	});

	it("falls back to the server dir name when no csproj exists", () => {
		const fixture = makeFixture(starter);
		expect(getPaths(fixture.dir).serverNamespace).toBe("Poyo.Server");
	});

	it("falls back gracefully when the server dir cannot be detected", () => {
		const fixture = makeFixture(starter, { serverDir: "MyApp.Server" });
		fs.rmSync(path.join(fixture.dir, "MyApp.Server"), {
			recursive: true,
			force: true,
		});
		expect(getPaths(fixture.dir).serverNamespace).toBe("Poyo.Server");
	});

	it("scaffolds a controller in the project namespace, not the template's", () => {
		const fixture = renamedFixture();
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"ReportsController",
			"--action",
			"Index",
		]);

		const controller = readFixtureFile(
			fixture,
			"MyApp.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("namespace MyApp.Server.Controllers;");
		expect(controller).not.toContain("Poyo.Server");
	});

	it("scaffolds a controller in the RootNamespace override", () => {
		const fixture = makeFixture(starter, {
			clientDir: "myapp.client",
			serverDir: "MyApp.Server",
		});
		writeFixtureFile(
			fixture,
			"MyApp.Server/MyApp.Server.csproj",
			CS_PROJECT("Custom.Ns"),
		);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"ReportsController",
			"--action",
			"Index",
		]);

		const controller = readFixtureFile(
			fixture,
			"MyApp.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("namespace Custom.Ns.Controllers;");
	});

	it("keeps the template namespace for template-named fixtures", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"ReportsController",
			"--action",
			"Index",
		]);

		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("namespace Poyo.Server.Controllers;");
	});

	it("renders remove messages with the project's dir names", () => {
		const fixture = renamedFixture();
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"ReportsController",
			"--action",
			"Index",
		]);
		execInFixture(fixture, ["route", "add", "/About"]);

		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/About",
			"--keep-files",
		]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"myapp.client/src/pages/About/index.page.tsx",
		);
		expect(result.stdout).toContain("MyApp.Server/Views/About/Index.cshtml");

		const removeController = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports",
			"--keep-files",
		]);
		expect(removeController.stdout).toContain(
			"MyApp.Server/Controllers/ReportsController.cs",
		);
		expect(removeController.stdout).not.toContain("Poyo.Server/Controllers");
	});

	it("renders sync orphan-view warnings with the project's dir names", () => {
		const fixture = renamedFixture();
		writeFixtureFile(
			fixture,
			"MyApp.Server/Views/Stale/Index.cshtml",
			'<div id="react-root"></div>\n',
		);

		const result = execInFixture(fixture, ["route", "sync", "--add"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("MyApp.Server/Views/Stale/Index.cshtml");
	});

	it("toProjectPath renders project-relative display paths", () => {
		const fixture = renamedFixture();
		const paths = getPaths(fixture.dir);

		expect(
			paths.toProjectPath("client", "src/pages/About/index.page.tsx"),
		).toBe("myapp.client/src/pages/About/index.page.tsx");
		expect(paths.toProjectPath("server", "Views\\About\\Index.cshtml")).toBe(
			"MyApp.Server/Views/About/Index.cshtml",
		);
		expect(paths.resolveSide("src/pages/About/index.page.tsx")).toBe("client");
		expect(paths.resolveSide("Views/About/Index.cshtml")).toBe("server");
		expect(paths.dirOf("client")).toBe(
			path.join(fixture.dir, "myapp.client"),
		);
		expect(paths.dirOf("server")).toBe(
			path.join(fixture.dir, "MyApp.Server"),
		);
	});
});
