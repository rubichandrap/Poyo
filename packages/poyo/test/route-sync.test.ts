import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPaths } from "../src/config.js";
import { findFiles, scaffoldRouteFiles } from "../src/scaffold.js";
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

const controllerBacked: Route = {
	path: "/Dashboard",
	name: "Dashboard",
	files: {
		react: "src/pages/Dashboard/index.page.tsx",
		view: "Views/Dashboard/Index.cshtml",
	},
	access: "protected",
	controller: "Dashboard",
	action: "Index",
};

const CONTROLLER_SOURCE = `using Microsoft.AspNetCore.Mvc;
using Poyo.Framework;

namespace Poyo.Server.Controllers;

public sealed class DashboardController : Controller
{
    public IActionResult Index()
    {
        return this.PoyoPage(null);
    }
}
`;

const ACTIONRESULT_CONTROLLER_SOURCE = `using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public sealed class DashboardController : Controller
{
    public ActionResult Index()
    {
        return View();
    }
}
`;

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

	it("does not treat an underscore view beside the route views as untracked", () => {
		const fixture = fixtureWithHomeFiles();
		writeFixtureFile(
			fixture,
			"Poyo.Server/Views/_ViewImports.cshtml",
			"@using Poyo.Framework\n",
		);

		const result = execInFixture(fixture, ["route", "sync"]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("[OK]");
	});

	it("treats a view merely named Shared… as untracked", () => {
		const fixture = fixtureWithHomeFiles();
		writeFixtureFile(
			fixture,
			"Poyo.Server/Views/SharedReports/Index.cshtml",
			'<div id="react-root"></div>\n',
		);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Views/Shared/_Layout.cshtml",
			"<html></html>\n",
		);

		const result = execInFixture(fixture, ["route", "sync", "--add"]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Views/SharedReports/Index.cshtml");
		expect(result.stdout).not.toContain("Views/Shared/_Layout.cshtml");
	});

	it("describes --delete as deleting React pages only", () => {
		const result = execInFixture(makeFixture(), ["route", "sync", "--help"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Delete untracked React pages from disk");
	});

	/**
	 * The collected list is project-relative with "/" separators; the predicate
	 * decides membership of that list, so it must see the same spelling. A
	 * native Windows path reaches it in backslashes, and a caller excluding
	 * partial views by their leading underscore then never matches one.
	 */
	it("hands findFiles' predicate the project-relative path it records", () => {
		const fixture = makeFixture();
		writeFixtureFile(
			fixture,
			"Poyo.Server/Views/_ViewImports.cshtml",
			"@using Poyo.Framework\n",
		);
		const seen: string[] = [];
		const found = findFiles(
			path.join(fixture.dir, "Poyo.Server", "Views"),
			(file) => {
				seen.push(file);
				return file.endsWith(".cshtml");
			},
			[],
			path.join(fixture.dir, "Poyo.Server"),
		);

		expect(found).toEqual(["Views/_ViewImports.cshtml"]);
		expect(seen).toEqual(found);
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

	it("rescaffolds a controller-backed route without failing on its existing action", () => {
		const fixture = makeFixture([controllerBacked]);
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/Dashboard/index.page.tsx",
			"export default () => null;\n",
		);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/DashboardController.cs",
			CONTROLLER_SOURCE,
		);

		const result = execInFixture(fixture, ["route", "sync", "--rescaffold"]);

		expect(result.status, result.stderr).toBe(0);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Dashboard/Index.cshtml"),
		).toBe(true);
		expect(
			readFixtureFile(
				fixture,
				"Poyo.Server/Controllers/DashboardController.cs",
			),
		).toBe(CONTROLLER_SOURCE);
	});

	it("keeps an existing action whose return type is not IActionResult", () => {
		const fixture = makeFixture([controllerBacked]);
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/Dashboard/index.page.tsx",
			"export default () => null;\n",
		);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/DashboardController.cs",
			ACTIONRESULT_CONTROLLER_SOURCE,
		);

		const result = execInFixture(fixture, ["route", "sync", "--rescaffold"]);

		expect(result.status, result.stderr).toBe(0);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Dashboard/Index.cshtml"),
		).toBe(true);
		expect(
			readFixtureFile(
				fixture,
				"Poyo.Server/Controllers/DashboardController.cs",
			),
		).toBe(ACTIONRESULT_CONTROLLER_SOURCE);
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

	it("preserves dynamic: false on existing routes when syncing with --add", () => {
		const fixture = makeFixture([{ ...starter[0], dynamic: false }]);
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
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/About/index.page.tsx",
			"export default () => null;\n",
		);

		const result = execInFixture(fixture, ["route", "sync", "--add"]);
		expect(result.status).toBe(0);
		const home = fixture.routesJson().find((r) => r.path === "/Home");
		expect(home?.dynamic).toBe(false);
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

	it("deletes untracked React pages with --delete but keeps plain Razor views", () => {
		const fixture = fixtureWithHomeFiles();
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/Stale/index.page.tsx",
			"export default () => null;\n",
		);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Views/Plain/Index.cshtml",
			'<div id="react-root"></div>\n',
		);

		const result = execInFixture(fixture, ["route", "sync", "--delete"]);

		expect(result.status, result.stderr).toBe(0);
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/Stale/index.page.tsx"),
		).toBe(false);
		// A view outside the registry can belong to a plain `View()` route,
		// so `--delete` leaves every view in place and names what it kept.
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Plain/Index.cshtml"),
		).toBe(true);
		expect(result.stdout).toContain("left in place");
		expect(result.stdout).toContain("Views/Plain/Index.cshtml");
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Home"]);
	});

	it("writes no view for an addition that makes the registry invalid", () => {
		// `/ABOUT` already owns the path `/About` case-insensitively, and the
		// untracked page's own view does not exist yet: the command used to
		// write that view and then fail on the duplicate.
		const fixture = makeFixture([
			{
				path: "/ABOUT",
				name: "ABOUT",
				files: {
					react: "src/pages/Home/index.page.tsx",
					view: "Views/Home/Index.cshtml",
				},
				access: "protected",
			},
		]);
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
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/about/index.page.tsx",
			"export default () => null;\n",
		);
		const registryBefore = readFixtureFile(fixture, "routes.json");

		const result = execInFixture(fixture, ["route", "sync", "--add"]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Duplicate route path");
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/About/Index.cshtml"),
		).toBe(false);
		expect(readFixtureFile(fixture, "routes.json")).toBe(registryBefore);
	});

	it("refuses to rescaffold a registry whose page leaves the project", () => {
		const fixture = makeFixture([
			{
				...starter[0],
				files: {
					react: "src/pages/../../victim.page.tsx",
					view: "Views/Home/Index.cshtml",
				},
			},
		]);
		const result = execInFixture(fixture, ["route", "sync", "--rescaffold"]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('".." segment');
		expect(result.stderr).toContain('"files.react"');
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/Home/index.page.tsx"),
		).toBe(false);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Home/Index.cshtml"),
		).toBe(false);
	});

	/**
	 * `--rescaffold` writes through `scaffoldRouteFiles`, and the guard lives
	 * there rather than only in the registry read: this calls the seam with a
	 * route the reader never saw, so the test fails if a hand-edited path can
	 * still reach a write.
	 */
	it.each([
		[
			"react",
			(file: string) => ({
				react: file,
				view: "Views/Evil/Index.cshtml",
			}),
			"Poyo.Server/Views/Evil/Index.cshtml",
		],
		[
			"view",
			(file: string) => ({
				react: "src/pages/Evil/index.page.tsx",
				view: file,
			}),
			"poyo.client/src/pages/Evil/index.page.tsx",
		],
	])("refuses to rescaffold an outside %s path without a validated registry", (field, filesFor, sibling) => {
		const fixture = makeFixture();
		const paths = getPaths(fixture.dir);
		const victim = path.join(
			os.tmpdir(),
			`poyo-sync-victim-${field}-${process.pid}-${Date.now()}.txt`,
		);

		try {
			expect(() =>
				scaffoldRouteFiles(
					paths,
					"Evil",
					filesFor(`../../${path.basename(victim)}`),
					{},
				),
			).toThrow(/Refusing route file path/);

			expect(fs.existsSync(victim)).toBe(false);
			expect(existsFixtureFile(fixture, sibling)).toBe(false);
		} finally {
			fs.rmSync(victim, { force: true });
		}
	});
});
