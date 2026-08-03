import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { CLI_PATH, execInFixture, makeFixture } from "./helpers.js";

describe("poyo CLI entry", () => {
	it("prints the version with --version", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["--version"]);
		expect(result.status).toBe(0);
		expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("prints help with --help", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["--help"]);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("route");
	});

	it("fails with a clear error for an unknown command", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["bogus"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Unknown command: 'bogus'");
	});

	it("fails when run outside a Poyo project", () => {
		const result = spawnSync(
			process.execPath,
			[CLI_PATH, "route", "add", "/Foo"],
			{
				cwd: "/tmp",
				encoding: "utf-8",
			},
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("No routes.json found");
	});
});
