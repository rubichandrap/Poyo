import { describe, expect, it } from "vitest";
import {
	resolveRouteFiles,
	toComponentName,
	toRouteName,
	toRoutePath,
} from "../src/naming.js";
import { findRoute } from "../src/registry.js";

describe("naming helpers", () => {
	it("converts a url path to a route name", () => {
		expect(toRouteName("/admin/users")).toBe("Admin/Users");
		expect(toRouteName("admin/users")).toBe("Admin/Users");
		expect(toRouteName("/about")).toBe("About");
		expect(toRouteName("/")).toBe("");
	});

	it("derives the route path from the name", () => {
		expect(toRoutePath("Admin/Users")).toBe("/Admin/Users");
		expect(toRoutePath("Home")).toBe("/Home");
	});

	it("derives a component identifier a page can declare", () => {
		expect(toComponentName("Admin/Users")).toBe("Users");
		expect(toComponentName("User-profile")).toBe("UserProfile");
		expect(toComponentName("123")).toBe("Page123");
		expect(toComponentName("A-b/C")).toBe("C");
		expect(toComponentName("A b")).toBe("AB");
		expect(toComponentName("")).toBe("Page");
	});

	it("refuses dot segments, including the percent-encoded spellings a browser reads as dots", () => {
		// %2e is a dot to the URL parser, so `.%2e`, `%2e.` and `%2e%2e` are
		// `..` and `%2e` is `.` before the page is ever requested.
		for (const spelling of [
			".",
			"..",
			".%2e",
			"%2e.",
			"%2e%2e",
			"%2E%2e",
			"%2e",
		]) {
			expect(() => toRouteName(`/Admin/${spelling}/Users`)).toThrow(
				`"${spelling}" segment`,
			);
		}
	});

	it("refuses an empty segment", () => {
		expect(() => toRouteName("/Home//Second")).toThrow("empty segment");
	});

	it("resolves folder-based file paths", () => {
		expect(resolveRouteFiles("Admin/Users", false)).toEqual({
			react: "src/pages/Admin/Users/index.page.tsx",
			view: "Views/Admin/Users/Index.cshtml",
		});
	});

	it("resolves flat file paths", () => {
		expect(resolveRouteFiles("Contact", true)).toEqual({
			react: "src/pages/contact.page.tsx",
			view: "Views/Contact.cshtml",
		});
		expect(resolveRouteFiles("Admin/Users", true)).toEqual({
			react: "src/pages/Admin/users.page.tsx",
			view: "Views/Admin/Users.cshtml",
		});
	});
});

describe("registry findRoute", () => {
	it("finds a route case-insensitively, with or without a leading slash", () => {
		const routes = [{ path: "/Dashboard" }, { path: "/Login" }];
		expect(findRoute(routes, "/dashboard")?.path).toBe("/Dashboard");
		expect(findRoute(routes, "login")?.path).toBe("/Login");
		expect(findRoute(routes, "/Nope")).toBeUndefined();
	});
});
