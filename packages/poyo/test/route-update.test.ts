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
		access: "protected",
	},
	{
		path: "/Login",
		name: "Login",
		files: {
			react: "src/pages/Login/index.page.tsx",
			view: "Views/Login/Index.cshtml",
		},
		access: "public",
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
			fixture.routesJson().find((r) => r.path === "/Dashboard")?.access,
		).toBe("public");

		execInFixture(fixture, [
			"route",
			"update",
			"/Dashboard",
			"--public",
			"false",
		]);
		expect(
			fixture.routesJson().find((r) => r.path === "/Dashboard")?.access,
		).toBe("protected");
	});

	it("toggles --guest", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "update", "/Login", "--guest", "true"]);
		expect(fixture.routesJson().find((r) => r.path === "/Login")?.access).toBe(
			"guest",
		);
	});

	it("maps --guest false back to protected", () => {
		const fixture = makeFixture([
			{
				path: "/Register",
				name: "Register",
				files: {
					react: "src/pages/Register/index.page.tsx",
					view: "Views/Register/Index.cshtml",
				},
				access: "guest",
			},
		]);
		execInFixture(fixture, [
			"route",
			"update",
			"/Register",
			"--guest",
			"false",
		]);
		expect(
			fixture.routesJson().find((r) => r.path === "/Register")?.access,
		).toBe("protected");
	});

	it("does not destroy sibling access state on --guest false", () => {
		const fixture = makeFixture(starter);
		execInFixture(fixture, ["route", "update", "/Login", "--guest", "false"]);
		expect(fixture.routesJson().find((r) => r.path === "/Login")?.access).toBe(
			"public",
		);
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
			fixture.routesJson().find((r) => r.path === "/Dashboard")?.access,
		).toBe("public");
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

	it("rejects a non-boolean access value", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, [
			"route",
			"update",
			"/Dashboard",
			"--public",
			"maybe",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("true");
		expect(result.stderr).toContain("false");
	});

	it("rejects combining --public and --guest", () => {
		const fixture = makeFixture(starter);
		const result = execInFixture(fixture, [
			"route",
			"update",
			"/Dashboard",
			"--public",
			"true",
			"--guest",
			"true",
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("--public");
		expect(result.stderr).toContain("--guest");
	});
});
