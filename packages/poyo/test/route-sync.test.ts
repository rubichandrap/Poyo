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
		path: "/Home",
		name: "Home",
		files: {
			react: "src/pages/Home/index.page.tsx",
			view: "Views/Home/Index.cshtml",
		},
		access: "protected",
	},
];

function fixtureWithHomeFiles(): ReturnType<typeof makeFixture> {
	const fixture = makeFixture(starter);
	writeFixtureFile(
		fixture,
		"poyo.client/src/pages/Home/index.page.tsx",
		"export default () => null;\n",
	);
	writeFixtureFile(
		fixture,
		"Poyo.Server/Views/Home/Index.cshtml",
		'<div id="react-root"></div>\n',
	);
	return fixture;
}

describe("poyo route sync", () => {
	it("reports OK when every route has its files and nothing is untracked", () => {
		const fixture = fixtureWithHomeFiles();
		const result = execInFixture(fixture, ["route", "sync"]);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("[OK]");
	});

	it("rescaffolds missing files with --rescaffold", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, ["route", "sync", "--rescaffold"]);

		expect(result.status).toBe(0);
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/Home/index.page.tsx"),
		).toBe(true);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Home/Index.cshtml"),
		).toBe(true);
	});

	it("prunes routes with missing files with --prune", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, ["route", "sync", "--prune"]);

		expect(result.status).toBe(0);
		expect(fixture.routesJson()).toEqual([]);
	});

	it("adds untracked pages with --add", () => {
		const fixture = fixtureWithHomeFiles();
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/About/index.page.tsx",
			"export default () => null;\n",
		);

		const result = execInFixture(fixture, ["route", "sync", "--add"]);

		expect(result.status).toBe(0);
		const routes = fixture.routesJson();
		expect(routes.map((r) => r.path)).toEqual(["/About", "/Home"]);
		expect(routes.find((r) => r.path === "/About")?.files).toEqual({
			react: "src/pages/About/index.page.tsx",
			view: "Views/About/Index.cshtml",
		});
		expect(routes.find((r) => r.path === "/About")?.access).toBe("protected");
		expect(routes.find((r) => r.path === "/About")).not.toHaveProperty(
			"reactFile",
		);
	});

	it("creates a view when adding an untracked page that lacks one", () => {
		const fixture = fixtureWithHomeFiles();
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/Contact/index.page.tsx",
			"export default () => null;\n",
		);

		execInFixture(fixture, ["route", "sync", "--add"]);

		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Contact/Index.cshtml"),
		).toBe(true);
	});

	it("warns about untracked views with no matching React page on --add", () => {
		const fixture = fixtureWithHomeFiles();
		writeFixtureFile(
			fixture,
			"Poyo.Server/Views/Stale/Index.cshtml",
			'<div id="react-root"></div>\n',
		);

		const result = execInFixture(fixture, ["route", "sync", "--add"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("manual intervention needed");
		expect(result.stdout).toContain("Views/Stale/Index.cshtml");
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Home"]);
	});

	it("deletes untracked files with --delete", () => {
		const fixture = fixtureWithHomeFiles();
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/Stale/index.page.tsx",
			"export default () => null;\n",
		);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Views/Stale/Index.cshtml",
			'<div id="react-root"></div>\n',
		);

		const result = execInFixture(fixture, ["route", "sync", "--delete"]);

		expect(result.status).toBe(0);
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/Stale/index.page.tsx"),
		).toBe(false);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Stale/Index.cshtml"),
		).toBe(false);
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Home"]);
	});
});
