import { describe, expect, it } from "vitest";
import { getPaths } from "../src/config.js";
import { makeFixture, mkdirs } from "./helpers.js";

describe("project path detection", () => {
	it("finds the client and server dirs by layout, not by name", () => {
		const fixture = makeFixture();
		mkdirs(fixture.dir, "myapp.client/src/pages");
		mkdirs(fixture.dir, "MyApp.Server/Views");
		mkdirs(fixture.dir, "MyApp.Server/Controllers");

		const paths = getPaths(fixture.dir);
		expect(paths.clientDir.endsWith("myapp.client")).toBe(true);
		expect(paths.serverDir.endsWith("MyApp.Server")).toBe(true);
		expect(paths.controllersDir.endsWith("MyApp.Server/Controllers")).toBe(true);
	});

	it("falls back to the legacy poyo names", () => {
		const fixture = makeFixture();
		const paths = getPaths(fixture.dir);
		expect(paths.clientDir.endsWith("poyo.client")).toBe(true);
		expect(paths.serverDir.endsWith("Poyo.Server")).toBe(true);
	});
});
