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

	/**
	 * Windows readers hold a file open — an editor, antivirus — and the
	 * replacement then fails with a share violation a plain rewrite never hit.
	 * The rename retries those codes briefly, the way `graceful-fs` does, so a
	 * route command does not fail on the one platform where the atomic step
	 * takes a lock.
	 */
	it("retries the replacement when Windows holds routes.json open", () => {
		const fixture = makeFixture(starter);
		const renameSync = fs.renameSync;
		let attempts = 0;
		vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
			attempts += 1;
			if (attempts <= 2) {
				throw Object.assign(new Error("resource busy or locked"), {
					code: "EBUSY",
				});
			}
			renameSync(from, to);
		});

		withPlatform("win32", () =>
			writeRoutes(getPaths(fixture.dir), [...starter, added]),
		);

		expect(attempts).toBe(3);
		const written = JSON.parse(readFixtureFile(fixture, "routes.json")) as {
			path: string;
		}[];
		expect(written.map((route) => route.path)).toEqual(["/About", "/Home"]);
	});

	it("gives up on a rename that stays blocked and leaves the registry intact", () => {
		const fixture = makeFixture(starter);
		const before = readFixtureFile(fixture, "routes.json");
		let attempts = 0;
		vi.spyOn(fs, "renameSync").mockImplementation(() => {
			attempts += 1;
			throw Object.assign(new Error("permission denied"), {
				code: "EPERM",
			});
		});

		expect(() =>
			withPlatform("win32", () =>
				writeRoutes(getPaths(fixture.dir), [...starter, added]),
			),
		).toThrow("permission denied");

		expect(attempts).toBeGreaterThan(1);
		expect(readFixtureFile(fixture, "routes.json")).toBe(before);
		expect(
			fs.readdirSync(fixture.dir).filter((entry) => entry.endsWith(".tmp")),
		).toEqual([]);
	});

	it("does not retry a blocked rename off Windows", () => {
		const fixture = makeFixture(starter);
		let attempts = 0;
		vi.spyOn(fs, "renameSync").mockImplementation(() => {
			attempts += 1;
			throw Object.assign(new Error("permission denied"), {
				code: "EPERM",
			});
		});

		withPlatform("linux", () => {
			expect(() =>
				writeRoutes(getPaths(fixture.dir), [...starter, added]),
			).toThrow("permission denied");
		});

		expect(attempts).toBe(1);
	});
});

/**
 * Runs `run` as another platform. `process.platform` is a configurable value
 * property, so it is redefined and put back rather than spied on.
 */
function withPlatform(platform: NodeJS.Platform, run: () => void): void {
	const original = process.platform;
	Object.defineProperty(process, "platform", {
		value: platform,
		configurable: true,
	});
	try {
		run();
	} finally {
		Object.defineProperty(process, "platform", {
			value: original,
			configurable: true,
		});
	}
}
