import { describe, expect, it } from "vitest";
import {
	execInFixture,
	existsFixtureFile,
	makeFixture,
	readFixtureFile,
	writeFixtureFile,
	type Fixture,
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
			access: "protected",
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
		expect(routes.find((r) => r.path === "/Login")?.access).toBe("public");
		expect(routes.find((r) => r.path === "/Register")?.access).toBe("guest");
	});

	it("defaults new routes to protected", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "add", "/About"]);

		const route = fixture.routesJson().find((r) => r.path === "/About");
		expect(route?.access).toBe("protected");
	});

	it("accepts a stray '--' forwarded by pnpm before the path and flags", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, [
			"route",
			"add",
			"--",
			"/GuestPage",
			"--guest",
		]);

		expect(result.status).toBe(0);
		const route = fixture.routesJson().find((r) => r.path === "/GuestPage");
		expect(route).toMatchObject({ access: "guest" });
	});

	it("rejects combining --public and --guest", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, [
			"route",
			"add",
			"/About",
			"--public",
			"--guest",
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("--public");
		expect(result.stderr).toContain("--guest");
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

const baseRoute: Route = {
	path: "/Home",
	name: "Home",
	files: {
		react: "src/pages/Home/index.page.tsx",
		view: "Views/Home/Index.cshtml",
	},
	access: "protected",
};

function registryWith(routeOverrides: Record<string, unknown>): Fixture {
	const fixture = makeFixture();
	writeFixtureFile(
		fixture,
		"routes.json",
		`${JSON.stringify([{ ...baseRoute, ...routeOverrides }], null, 2)}\n`,
	);
	return fixture;
}

function registryRaw(content: unknown): Fixture {
	const fixture = makeFixture();
	writeFixtureFile(
		fixture,
		"routes.json",
		`${JSON.stringify(content, null, 2)}\n`,
	);
	return fixture;
}

describe("poyo route registry validation", () => {
	it("accepts a valid v2 registry", () => {
		const fixture = registryWith({});
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(0);
	});

	it("rejects legacy isPublic as an unknown field", () => {
		const fixture = registryWith({ isPublic: true });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("isPublic");
		expect(result.stderr).toContain("unknown field");
	});

	it("rejects legacy isGuestOnly as an unknown field", () => {
		const fixture = registryWith({ isGuestOnly: true });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("isGuestOnly");
		expect(result.stderr).toContain("unknown field");
	});

	it("rejects any unknown field on read", () => {
		const fixture = registryWith({ bogus: 1 });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("bogus");
		expect(result.stderr).toContain("unknown field");
	});

	it("rejects a non-array registry", () => {
		const fixture = registryRaw({ path: "/Home" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("array");
	});

	it("rejects duplicate case-insensitive paths", () => {
		const fixture = registryRaw([baseRoute, { ...baseRoute, path: "/home" }]);
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Duplicate route path");
		expect(result.stderr).toContain("/home");
	});

	it("rejects a path without a leading slash", () => {
		const fixture = registryWith({ path: "Home" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("path");
		expect(result.stderr).toContain("/");
	});

	it("rejects an empty path", () => {
		const fixture = registryWith({ path: "" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("path");
	});

	it("rejects a name with edge slashes", () => {
		const fixture = registryWith({ name: "/Home/" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("name");
	});

	it("rejects an empty name", () => {
		const fixture = registryWith({ name: "" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("name");
	});

	it("rejects missing files", () => {
		const fixture = registryWith({ files: undefined });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("files");
	});

	it("rejects malformed files fields", () => {
		const fixture = registryWith({ files: { react: "x" } });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("view");
	});

	it("rejects unknown fields inside files", () => {
		const fixture = registryWith({
			files: { react: "x.tsx", view: "y.cshtml", bogus: 1 },
		});
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("files.bogus");
	});

	it("rejects an access value outside the enum", () => {
		const fixture = registryWith({ access: "secret" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("access");
	});

	it("rejects a missing access field", () => {
		const fixture = registryWith({ access: undefined });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("access");
	});

	it("rejects controller without action", () => {
		const fixture = registryWith({ controller: "HomeController" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("controller");
		expect(result.stderr).toContain("action");
	});

	it("rejects action without controller", () => {
		const fixture = registryWith({ action: "Index" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("controller");
		expect(result.stderr).toContain("action");
	});

	it("rejects a non-string controller", () => {
		const fixture = registryWith({ controller: 123, action: "Index" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("controller");
	});

	it("rejects a non-object seo", () => {
		const fixture = registryWith({ seo: "title only" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("seo");
	});
});

describe("invalid registry rejected by every route command", () => {
	const legacy = [
		{
			path: "/Home",
			name: "Home",
			files: {
				react: "src/pages/Home/index.page.tsx",
				view: "Views/Home/Index.cshtml",
			},
			access: "protected",
			isPublic: true,
		},
	];

	it("route update rejects a legacy registry", () => {
		const fixture = makeFixture(legacy as unknown as Route[]);
		const result = execInFixture(fixture, [
			"route",
			"update",
			"/Home",
			"--public",
			"true",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("isPublic");
	});

	it("route remove rejects a legacy registry", () => {
		const fixture = makeFixture(legacy as unknown as Route[]);
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Home",
			"--yes",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("isPublic");
	});

	it("route sync rejects a legacy registry", () => {
		const fixture = makeFixture(legacy as unknown as Route[]);
		const result = execInFixture(fixture, ["route", "sync"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("isPublic");
	});
});
