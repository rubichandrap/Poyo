import { describe, expect, it } from "vitest";
import { execInFixture, makeFixture, type Route } from "./helpers.js";

const starter: Route[] = [
	{
		path: "/Dashboard",
		name: "Dashboard",
		files: {
			react: "src/pages/Dashboard/index.page.tsx",
			view: "Views/Dashboard/Index.cshtml",
		},
	},
	{
		path: "/Login",
		name: "Login",
		files: {
			react: "src/pages/Login/index.page.tsx",
			view: "Views/Login/Index.cshtml",
		},
		isPublic: true,
	},
];

describe("poyo route update", () => {
	it("toggles --public", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, [
			"route",
			"update",
			"/Dashboard",
			"--public",
			"true",
		]);
		expect(
			fixture.routesJson().find((r) => r.path === "/Dashboard")?.isPublic,
		).toBe(true);

		execInFixture(fixture, [
			"route",
			"update",
			"/Dashboard",
			"--public",
			"false",
		]);
		expect(
			fixture.routesJson().find((r) => r.path === "/Dashboard")?.isPublic,
		).toBe(false);
	});

	it("toggles --guest", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "update", "/Login", "--guest", "true"]);
		expect(
			fixture.routesJson().find((r) => r.path === "/Login")?.isGuestOnly,
		).toBe(true);
	});

	it("matches routes with or without a leading slash", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, [
			"route",
			"update",
			"Dashboard",
			"--public",
			"true",
		]);
		expect(
			fixture.routesJson().find((r) => r.path === "/Dashboard")?.isPublic,
		).toBe(true);
	});

	it("leaves the file layout untouched", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "update", "/Login", "--public", "false"]);
		const routes = fixture.routesJson();
		expect(routes).toHaveLength(2);
		expect(routes.map((r) => r.path)).toEqual(["/Dashboard", "/Login"]);
	});

	it("errors for a route that does not exist", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, [
			"route",
			"update",
			"/Nope",
			"--public",
			"true",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Route not found");
	});
});
