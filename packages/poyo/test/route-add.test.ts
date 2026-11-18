import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pageTemplate } from "../src/templates.js";
import {
	execInFixture,
	existsFixtureFile,
	type Fixture,
	makeFixture,
	type Route,
	readFixtureFile,
	typeErrors,
	writeFixtureFile,
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

	it("re-emits the route manifest after adding a route", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, ["route", "add", "/About"]);

		expect(result.status).toBe(0);
		const manifest = readFixtureFile(
			fixture,
			"poyo.client/routes.generated.ts",
		);
		expect(manifest).toContain('names: "About" | "Dashboard";');
		expect(manifest).toContain('paths: "/About" | "/Dashboard";');
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

	it("scaffolds a page component that type-checks for any route name", () => {
		const fixture = makeFixture(starter);
		const cases = [
			["/user-profile", "poyo.client/src/pages/User-profile/index.page.tsx"],
			["/123", "poyo.client/src/pages/123/index.page.tsx"],
			["/a-b/c", "poyo.client/src/pages/A-b/C/index.page.tsx"],
			["/react", "poyo.client/src/pages/React/index.page.tsx"],
		] as const;

		for (const [urlPath, pagePath] of cases) {
			const result = execInFixture(fixture, ["route", "add", urlPath]);
			expect(result.status, result.stderr).toBe(0);

			const page = readFixtureFile(fixture, pagePath);
			expect(typeErrors(page), urlPath).toEqual([]);
		}
	});

	it("renders a route name holding JSX-significant characters as text", () => {
		// The name cannot reach the CLI on Windows — `<`, `>` and `:` are not
		// file-name characters there — so the template is checked directly.
		const page = pageTemplate("A<{b}");

		expect(page).toContain('{"A<{b}"}');
		expect(typeErrors(page), "A<{b}").toEqual([]);
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

	it("records the bare controller name MVC matches and scaffolds a PoyoPage action", () => {
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
		// MVC matches a controller by the class name without its suffix; a
		// registry value carrying "Controller" names no controller and 404s.
		expect(route?.controller).toBe("Reports");
		expect(route?.action).toBe("Index");

		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("using Poyo.Framework;");
		expect(controller).toContain("class ReportsController : Controller");
		expect(controller).toContain("public IActionResult Index()");
		expect(controller).toContain("return this.PoyoPage(null);");
		expect(controller).not.toContain("return View(");
	});

	it("creates the Controllers directory when the project has none", () => {
		const fixture = makeFixture(starter);
		fs.rmSync(path.join(fixture.dir, "Poyo.Server", "Controllers"), {
			recursive: true,
			force: true,
		});

		const result = execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"ReportsController",
			"--action",
			"Index",
		]);

		expect(result.status).toBe(0);
		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(true);
	});

	it("accepts a controller name without the suffix and still names the class with it", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"Reports",
			"--action",
			"Index",
		]);

		const route = fixture.routesJson().find((r) => r.path === "/Reports");
		expect(route?.controller).toBe("Reports");

		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("class ReportsController : Controller");
	});

	it("injects a PoyoPage action into an existing controller without duplicating the class", () => {
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
			"Reports",
			"--action",
			"Index",
		]);

		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("using Poyo.Framework;");
		expect(controller).toContain("class ReportsController : Controller");
		expect(controller).toContain("public IActionResult Index()");
		expect(controller).toContain("return this.PoyoPage(null);");
		expect(controller).toContain("public IActionResult Existing()");
	});

	it("places the framework using after extern alias lines", () => {
		const fixture = makeFixture(starter);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
			`extern alias Foo;
using Microsoft.AspNetCore.Mvc;

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
			"Reports",
			"--action",
			"Index",
		]);

		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller.startsWith("extern alias Foo;\n")).toBe(true);
		expect(controller.indexOf("using Poyo.Framework;")).toBeGreaterThan(
			controller.indexOf("extern alias Foo;"),
		);
		expect(controller).toContain("return this.PoyoPage(null);");
	});

	it("does not add a local using when the project has a global one", () => {
		const fixture = makeFixture(starter);
		writeFixtureFile(
			fixture,
			"Poyo.Server/GlobalUsings.cs",
			"global using Poyo.Framework;\n",
		);
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
			"Reports",
			"--action",
			"Index",
		]);

		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).not.toContain("using Poyo.Framework;");
		expect(controller).toContain("return this.PoyoPage(null);");
	});
});

describe("poyo route add validates --controller and --action", () => {
	it("requires --controller when --action is given", () => {
		const fixture = makeFixture(starter);
		const treeBefore = tree(fixture.dir);
		const registryBefore = readFixtureFile(fixture, "routes.json");

		const result = execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--action",
			"Index",
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("--controller");
		expect(tree(fixture.dir)).toEqual(treeBefore);
		expect(readFixtureFile(fixture, "routes.json")).toBe(registryBefore);
	});

	const invalid: [string, string][] = [
		["../../../poyo-escaped-controller", "controller"],
		["Reports.Controller", "controller"],
		["Reports Controller", "controller"],
		["1Reports", "controller"],
		["class", "controller"],
		["Index()", "action"],
		["class", "action"],
		["void", "action"],
	];

	it.each(
		invalid,
	)("refuses the %s argument for --%s before writing anything", (value, flag) => {
		const fixture = makeFixture(starter);
		const treeBefore = tree(fixture.dir);
		const registryBefore = readFixtureFile(fixture, "routes.json");

		const result = execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			flag === "controller" ? value : "Reports",
			"--action",
			flag === "action" ? value : "Index",
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(`--${flag}`);
		expect(result.stderr).toContain("C# identifier");
		expect(tree(fixture.dir)).toEqual(treeBefore);
		expect(readFixtureFile(fixture, "routes.json")).toBe(registryBefore);
	});

	it("writes nothing outside the project for an escaping --controller", () => {
		const fixture = makeFixture(starter);
		const outside = path.join(
			os.tmpdir(),
			"poyo-escaped-controllerController.cs",
		);

		try {
			const result = execInFixture(fixture, [
				"route",
				"add",
				"/Reports",
				"--controller",
				"../../../poyo-escaped-controller",
				"--action",
				"Index",
			]);

			expect(result.status).toBe(1);
			expect(fs.existsSync(outside)).toBe(false);
		} finally {
			fs.rmSync(outside, { force: true });
		}
	});

	it("refuses a --controller that is only the Controller suffix", () => {
		const fixture = makeFixture(starter);
		const treeBefore = tree(fixture.dir);

		const result = execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"Controller",
			"--action",
			"Index",
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("--controller");
		expect(tree(fixture.dir)).toEqual(treeBefore);
	});

	it("refuses a blank --controller", () => {
		const fixture = makeFixture(starter);
		const treeBefore = tree(fixture.dir);

		const result = execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"",
			"--action",
			"Index",
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("--controller");
		expect(tree(fixture.dir)).toEqual(treeBefore);
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

	it("rejects a path with a trailing slash, naming the canonical form", () => {
		const fixture = registryWith({ path: "/Home/" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("trailing slash");
		expect(result.stderr).toContain("/Home/");
		expect(result.stderr).toContain('"/Home"');
	});

	it("rejects two paths differing only by a trailing slash", () => {
		const fixture = registryRaw([baseRoute, { ...baseRoute, path: "/Home/" }]);
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("trailing slash");
		expect(result.stderr).toContain("/Home/");
	});

	it("accepts the root path", () => {
		const fixture = registryWith({ path: "/", name: "Home" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(0);
	});

	it("rejects duplicate case-insensitive names", () => {
		const fixture = registryRaw([
			baseRoute,
			{ ...baseRoute, path: "/Second", name: "home" },
		]);
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Duplicate route name");
		expect(result.stderr).toContain("home");
		expect(result.stderr).toContain("/Second");
	});

	it("accepts a route that declares both a controller and an action", () => {
		const fixture = registryWith({
			controller: "Custom",
			action: "Index",
		});
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(0);
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

	it("rejects a controller without an action", () => {
		const fixture = registryWith({ controller: "Custom" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'"controller" is specified without "action"',
		);
		expect(result.stderr).toContain("/Home");
	});

	it("rejects an action without a controller", () => {
		const fixture = registryWith({ action: "Index" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'"action" is specified without "controller"',
		);
		expect(result.stderr).toContain("/Home");
	});

	it("rejects a blank controller, which is a declaration the server cannot act on", () => {
		const fixture = registryWith({ controller: "", action: "Index" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("controller");
		expect(result.stderr).toContain("/Home");
	});

	it("rejects a whitespace-only name, as the server's blank-name rule does", () => {
		const fixture = registryWith({ name: "   " });
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

	it("accepts a missing access field, the server's own default", () => {
		// The server deserializes an absent access to protected, and a
		// registry that omits it is one it serves. Refusing it here would
		// reject a registry the server accepts.
		const fixture = registryWith({ access: undefined });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(0);
		const written = fixture.routesJson().find((r) => r.path === "/About");
		expect(written?.access).toBe("protected");
	});

	it("treats a null controller or action as undeclared, as the server does", () => {
		// route.Controller is not null is false for a null field, so the
		// server reads null as "not declared" rather than as a declaration it
		// cannot act on.
		const fixture = registryWith({ controller: null, action: null });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(0);
	});

	it("still rejects a blank controller, which is a declaration", () => {
		const fixture = registryWith({ controller: "  ", action: "Index" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("controller");
	});

	it("does not import the identity notion of blank into file fields", () => {
		// A file field is not a route's identity and the server never checks
		// one, so a whitespace-only path is left to fail at request time.
		const fixture = registryWith({ files: { react: " ", view: "y.cshtml" } });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(0);
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

	it("accepts dynamic as a boolean (true and false)", () => {
		const fixtureFalse = registryWith({ dynamic: false });
		const resFalse = execInFixture(fixtureFalse, ["route", "add", "/About"]);
		expect(resFalse.status).toBe(0);

		const fixtureTrue = registryWith({ dynamic: true });
		const resTrue = execInFixture(fixtureTrue, ["route", "add", "/About"]);
		expect(resTrue.status).toBe(0);
	});

	it("preserves dynamic: false on existing routes when adding a new route", () => {
		const fixture = registryWith({ dynamic: false });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(0);
		const home = fixture.routesJson().find((r) => r.path === "/Home");
		expect(home?.dynamic).toBe(false);
	});
	it("rejects a non-boolean dynamic value naming the route", () => {
		const fixture = registryWith({ dynamic: "junk" });
		const result = execInFixture(fixture, ["route", "add", "/About"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("dynamic");
		expect(result.stderr).toContain("/Home");
		expect(result.stderr).toContain("boolean");
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

	const malformedDynamic = [
		{
			path: "/Home",
			name: "Home",
			files: {
				react: "src/pages/Home/index.page.tsx",
				view: "Views/Home/Index.cshtml",
			},
			access: "protected",
			dynamic: "not-a-bool",
		},
	];

	it("route update rejects a non-boolean dynamic value naming the route", () => {
		const fixture = makeFixture(malformedDynamic as unknown as Route[]);
		const result = execInFixture(fixture, [
			"route",
			"update",
			"/Home",
			"--public",
			"true",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("dynamic");
		expect(result.stderr).toContain("/Home");
	});

	it("route remove rejects a non-boolean dynamic value naming the route", () => {
		const fixture = makeFixture(malformedDynamic as unknown as Route[]);
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Home",
			"--yes",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("dynamic");
		expect(result.stderr).toContain("/Home");
	});

	it("route sync rejects a non-boolean dynamic value naming the route", () => {
		const fixture = makeFixture(malformedDynamic as unknown as Route[]);
		const result = execInFixture(fixture, ["route", "sync"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("dynamic");
		expect(result.stderr).toContain("/Home");
	});
});

/**
 * A path with an empty or dot segment is refused before its name is derived —
 * the dot segments written with `%2e` included, because the URL parser reads
 * one as a dot. The name becomes a file path, so a resolved dot segment lands
 * outside `src/pages/` and `Views/` — and, with enough `..`, outside the
 * project. Nothing may be written anywhere before the refusal.
 *
 * A backslash is a separator here, because it is one to a browser and to a
 * developer on Windows: the argument is read the same way either way, and the
 * route manager never writes a declared path holding one.
 */
describe("poyo route add refuses dot and empty segments", () => {
	const refused: [string, string][] = [
		["../../X", '".." segment'],
		["/./X", '"." segment'],
		["/Home//X", "empty segment"],
		["/%2e%2e/X", '"%2e%2e" segment'],
		["\\..\\..\\X", '".." segment'],
	];

	it.each(refused)("refuses '%s' and writes nothing", (argument, segment) => {
		const fixture = makeFixture(starter);
		const treeBefore = tree(fixture.dir);
		const registryBefore = readFixtureFile(fixture, "routes.json");

		const result = execInFixture(fixture, ["route", "add", argument]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(segment);
		expect(result.stderr).toContain(argument);
		expect(tree(fixture.dir)).toEqual(treeBefore);
		expect(readFixtureFile(fixture, "routes.json")).toBe(registryBefore);
	});

	it("reads a Windows-style path as separators and registers a normal path", () => {
		const fixture = makeFixture(starter);

		const result = execInFixture(fixture, ["route", "add", "\\Admin\\Users"]);

		expect(result.status).toBe(0);
		const route = fixture.routesJson().find((r) => r.path === "/Admin/Users");
		expect(route).toMatchObject({ name: "Admin/Users" });
		expect(
			existsFixtureFile(
				fixture,
				"poyo.client/src/pages/Admin/Users/index.page.tsx",
			),
		).toBe(true);
	});

	it("writes nothing outside the project", () => {
		const fixture = makeFixture(starter);
		// One argument per side: the page and the view sit at different depths
		// inside the fixture, and each escapes at its own number of segments.
		const escapes: [string, string][] = [
			["../../../poyo-escaped-view", "poyo-escaped-view"],
			["../../../../poyo-escaped-page", "poyo-escaped-page"],
		];

		for (const [argument, outsideName] of escapes) {
			const outside = path.join(os.tmpdir(), outsideName);
			expect(fs.existsSync(outside)).toBe(false);

			try {
				const result = execInFixture(fixture, ["route", "add", argument]);

				expect(result.status).toBe(1);
				expect(result.stderr).toContain('".." segment');
				expect(fs.existsSync(outside)).toBe(false);
			} finally {
				fs.rmSync(outside, { recursive: true, force: true });
			}
		}
	});
});

/**
 * A path holding route-template or URL syntax is refused before its name is
 * derived. The server maps a declared path as an ASP.NET route template while
 * every request-time lookup resolves it literally, so `{`, `}` and `*` would
 * let the endpoint serve URLs the registry does not own, and `?` and `#` split
 * the URL at a character no request path carries. A `%` is refused unless it
 * starts `%2F`, the one escape the server leaves encoded in a request path.
 */
describe("poyo route add refuses route-template and URL syntax", () => {
	const refused: [string, string][] = [
		["/Users/{id}", '"{" character'],
		["/Users/id}", '"}" character'],
		["/Files/*", '"*" character'],
		["/Search?q=draft", '"?" character'],
		["/Docs#top", '"#" character'],
		["/Reports/100%25", '"%" that does not start "%2F"'],
	];

	it.each(refused)("refuses '%s' and writes nothing", (argument, character) => {
		const fixture = makeFixture(starter);
		const treeBefore = tree(fixture.dir);
		const registryBefore = readFixtureFile(fixture, "routes.json");

		const result = execInFixture(fixture, ["route", "add", argument]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(character);
		expect(result.stderr).toContain("declared path is a literal URL");
		expect(result.stderr).toContain(argument);
		expect(tree(fixture.dir)).toEqual(treeBefore);
		expect(readFixtureFile(fixture, "routes.json")).toBe(registryBefore);
	});
});

/**
 * `route add` validates the registry it is about to write before it touches
 * anything else. It used to append the action to the controller first, so a
 * route the registry then refused left a controller file behind that no route
 * named — a file the next run had to explain.
 */
describe("poyo route add validates the resulting registry before writing", () => {
	it("leaves the project untouched when the new route duplicates an existing name", () => {
		const fixture = registryWith({ path: "/Home", name: "Reports" });
		const treeBefore = tree(fixture.dir);
		const registryBefore = readFixtureFile(fixture, "routes.json");

		const result = execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"Reports",
			"--action",
			"Index",
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Duplicate route name");
		expect(tree(fixture.dir)).toEqual(treeBefore);
		expect(readFixtureFile(fixture, "routes.json")).toBe(registryBefore);
		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(false);
	});
});

/** Every path under the fixture, so a write of any kind shows up as a diff. */
function tree(root: string): string[] {
	return fs
		.readdirSync(root, { recursive: true, encoding: "utf-8" })
		.map((entry) => String(entry))
		.sort();
}
