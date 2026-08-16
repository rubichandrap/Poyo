import { describe, expect, it } from "vitest";
import {
	execInFixture,
	existsFixtureFile,
	makeFixture,
	readFixtureFile,
	writeFixtureFile,
	type Route,
} from "./helpers.js";

const starter: Route[] = [
	{
		path: "/About",
		name: "About",
		files: {
			react: "src/pages/About/index.page.tsx",
			view: "Views/About/Index.cshtml",
		},
		access: "protected",
	},
	{
		path: "/Reports",
		name: "Reports",
		files: {
			react: "src/pages/Reports/index.page.tsx",
			view: "Views/Reports/Index.cshtml",
		},
		access: "protected",
		controller: "ReportsController",
		action: "Index",
	},
];

function fixtureWithFiles(): ReturnType<typeof makeFixture> {
	const fixture = makeFixture(starter);
	for (const route of starter) {
		writeFixtureFile(
			fixture,
			`poyo.client/${route.files.react}`,
			"export default () => null;\n",
		);
		writeFixtureFile(
			fixture,
			`Poyo.Server/${route.files.view}`,
			'<div id="react-root"></div>\n',
		);
	}
	if (starter.find((r) => r.controller)) {
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
			"public class ReportsController {}\n",
		);
	}
	return fixture;
}

describe("poyo route remove", () => {
	it("removes the route from routes.json and deletes files with --yes", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/About",
			"--yes",
		]);

		expect(result.status).toBe(0);
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Reports"]);
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/About/index.page.tsx"),
		).toBe(false);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/About/Index.cshtml"),
		).toBe(false);
	});

	it("deletes the custom controller with --yes when the route uses one", () => {
		const fixture = fixtureWithFiles();
		execInFixture(fixture, ["route", "remove", "/Reports", "--yes"]);

		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(false);
	});

	it("keeps files on disk and reports orphans with --keep-files", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/About",
			"--keep-files",
		]);

		expect(result.status).toBe(0);
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Reports"]);
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/About/index.page.tsx"),
		).toBe(true);
		expect(result.stdout).toContain("Orphaned files kept");
		expect(result.stdout).toContain("src/pages/About/index.page.tsx");
	});

	it("matches routes with or without a leading slash", () => {
		const fixture = fixtureWithFiles();
		execInFixture(fixture, ["route", "remove", "About", "--yes"]);
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Reports"]);
	});

	it("errors for a route that does not exist", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, ["route", "remove", "/Nope"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Route not found");
	});
	it("re-emits the route manifest after removing a route", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/About",
			"--keep-files",
		]);

		expect(result.status).toBe(0);
		const manifest = readFixtureFile(
			fixture,
			"poyo.client/src/routes/routes.generated.ts",
		);
		expect(manifest).not.toContain("About");
		expect(manifest).toContain('export type RouteName = "Reports";');
	});
});
