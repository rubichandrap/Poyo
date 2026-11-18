import { describe, expect, it } from "vitest";
import { stripPnpmSeparator } from "../src/argv.js";

describe("argument normalization", () => {
	it("drops the '--' pnpm forwards before the user's arguments", () => {
		expect(
			stripPnpmSeparator(["route", "add", "--", "/GuestPage", "--guest"]),
		).toEqual(["route", "add", "/GuestPage", "--guest"]);
	});

	it("leaves an argument list without a separator untouched", () => {
		expect(stripPnpmSeparator(["build"])).toEqual(["build"]);
		expect(stripPnpmSeparator(["route", "add", "/About", "--guest"])).toEqual([
			"route",
			"add",
			"/About",
			"--guest",
		]);
	});

	it("drops one separator only: a later '--' belongs to the command", () => {
		expect(
			stripPnpmSeparator(["route", "add", "--", "/About", "--", "--guest"]),
		).toEqual(["route", "add", "/About", "--", "--guest"]);
	});
});
