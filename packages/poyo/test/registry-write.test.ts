import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaths } from "../src/config.js";
import { writeRoutes } from "../src/registry.js";
import type { Route } from "../src/routes.js";
import { makeFixture, readFixtureFile } from "./helpers.js";

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

const added: Route = {
	path: "/About",
	name: "About",
	files: {
		react: "src/pages/About/index.page.tsx",
		view: "Views/About/Index.cshtml",
	},
	access: "protected",
};

/**
 * The registry is the deployment artifact the server boots on (ADR 0014), so a
 * write that stops halfway must not be able to leave the project holding half
 * a file: `routes.json` is opened for writing only after the new text exists
 * somewhere else, and the replacement is the rename.
 */
describe("poyo registry write", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("leaves the current routes.json byte-identical when the write is interrupted", () => {
		const fixture = makeFixture(starter);
		const before = readFixtureFile(fixture, "routes.json");
		const writeFileSync = fs.writeFileSync;

		// A process killed between open and close leaves a truncated file. The
		// interrupted write is simulated on the path the registry write opens,
		// not on routes.json itself, so the assertion is about what the
		// project is left holding.
		vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
			if (typeof file === "string" && file.endsWith(".tmp")) {
				writeFileSync(file, String(data).slice(0, 12));
				throw new Error("simulated interrupt");
			}
			return writeFileSync(file, data, options);
		});

		expect(() =>
			writeRoutes(getPaths(fixture.dir), [...starter, added]),
		).toThrow("simulated interrupt");

		expect(readFixtureFile(fixture, "routes.json")).toBe(before);
		expect(
			fs.readdirSync(fixture.dir).filter((entry) => entry.endsWith(".tmp")),
		).toEqual([]);
	});

	it("writes the sorted registry and leaves no part file behind", () => {
		const fixture = makeFixture(starter);
		const paths = getPaths(fixture.dir);

		writeRoutes(paths, [added, ...starter]);

		const written = JSON.parse(readFixtureFile(fixture, "routes.json")) as {
			path: string;
		}[];
		expect(written.map((route) => route.path)).toEqual(["/About", "/Home"]);
		expect(
			fs.readdirSync(fixture.dir).filter((entry) => entry.endsWith(".tmp")),
		).toEqual([]);
	});
});
