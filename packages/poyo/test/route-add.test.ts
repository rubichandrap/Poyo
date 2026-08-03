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
		path: "/Dashboard",
		name: "Dashboard",
		files: {
			react: "src/pages/Dashboard/index.page.tsx",
			view: "Views/Dashboard/Index.cshtml",
		},
	},
];

describe("poyo route add", () => {
	it("registers the route, writes routes.json sorted by path, and scaffolds page + view", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, ["route", "add", "/About"]);

		expect(result.status).toBe(0);
		const routes = fixture.routesJson();
		expect(routes.map((r) => r.path)).toEqual(["/About", "/Dashboard"]);

		const about = routes.find((r) => r.path === "/About");
		expect(about).toMatchObject({
			name: "About",
			files: {
				react: "src/pages/About/index.page.tsx",
				view: "Views/About/Index.cshtml",
			},
			isPublic: false,
			isGuestOnly: false,
		});

		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/About/index.page.tsx"),
		).toBe(true);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/About/Index.cshtml"),
		).toBe(true);
	});

	it("handles nested paths with PascalCase conversion", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, ["route", "add", "/admin/users"]);

		expect(result.status).toBe(0);
		const routes = fixture.routesJson();
		expect(routes.map((r) => r.path)).toEqual(["/Admin/Users", "/Dashboard"]);
		expect(
			existsFixtureFile(
				fixture,
				"poyo.client/src/pages/Admin/Users/index.page.tsx",
			),
		).toBe(true);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Admin/Users/Index.cshtml"),
		).toBe(true);
	});

	it("writes a usable page and view", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "add", "/About"]);

		const page = readFixtureFile(
			fixture,
			"poyo.client/src/pages/About/index.page.tsx",
		);
		expect(page).toContain("export default About");

		const view = readFixtureFile(
			fixture,
			"Poyo.Server/Views/About/Index.cshtml",
		);
		expect(view).toContain('data-page-name="About"');
	});

	it("honors --public and --guest", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "add", "/Login", "--public"]);
		execInFixture(fixture, ["route", "add", "/Register", "--guest"]);

		const routes = fixture.routesJson();
		expect(routes.find((r) => r.path === "/Login")?.isPublic).toBe(true);
		expect(routes.find((r) => r.path === "/Register")?.isGuestOnly).toBe(true);
		expect(routes.find((r) => r.path === "/Register")?.isPublic).toBe(false);
	});

	it("honors --flat for single pages", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "add", "/Contact", "--flat"]);

		const route = fixture.routesJson().find((r) => r.path === "/Contact");
		expect(route?.files).toEqual({
			react: "src/pages/contact.page.tsx",
			view: "Views/Contact.cshtml",
		});
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/contact.page.tsx"),
		).toBe(true);
		expect(existsFixtureFile(fixture, "Poyo.Server/Views/Contact.cshtml")).toBe(
			true,
		);
	});

	it("honors --no-view to skip the MVC view", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "add", "/Health", "--no-view"]);

		const route = fixture.routesJson().find((r) => r.path === "/Health");
		expect(route?.files.view).toBe("Views/Health/Index.cshtml");
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/Health/index.page.tsx"),
		).toBe(true);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Health/Index.cshtml"),
		).toBe(false);
	});

	it("rejects duplicate routes", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "add", "/About"]);

		const result = execInFixture(fixture, ["route", "add", "/about"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Route already exists: /About");
	});

	it("requires --action when --controller is given", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"ReportsController",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("--action");
	});

	it("creates a custom controller and records it on the route", () => {
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

		const route = fixture.routesJson().find((r) => r.path === "/Reports");
		expect(route?.controller).toBe("ReportsController");
		expect(route?.action).toBe("Index");

		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("class ReportsController : Controller");
		expect(controller).toContain("public IActionResult Index()");
		expect(controller).toContain('View("~/Views/Reports/Index.cshtml")');
	});

	it("injects an action into an existing controller without duplicating the class", () => {
		const fixture = makeFixture(starter);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
			`using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public class ReportsController : Controller
{
    public IActionResult Existing()
    {
        return Content("hi");
    }
}
`,
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
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("class ReportsController : Controller");
		expect(controller).toContain("public IActionResult Index()");
		expect(controller).toContain("public IActionResult Existing()");
	});
});
