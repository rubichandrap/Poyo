import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPaths } from "../src/config.js";
import { containedProjectPath } from "../src/file-paths.js";
import { makeFixture } from "./helpers.js";

/**
 * Whether this platform and account can create a symbolic link. Windows needs
 * developer mode or an elevated token, so the tests that need one skip rather
 * than fail there; the rule itself is exercised by every other case.
 */
const symlinksAvailable = (() => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-symlink-probe-"));
	try {
		fs.symlinkSync(dir, path.join(dir, "link"), "dir");
		return true;
	} catch {
		return false;
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
})();

describe("contained project file paths", () => {
	it.skipIf(!symlinksAvailable)(
		"refuses a path whose directory is a symbolic link out of the project",
		() => {
			const fixture = makeFixture();
			const paths = getPaths(fixture.dir);
			const outside = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-outside-"));
			const link = path.join(paths.clientDir, "src", "pages", "Linked");

			try {
				fs.symlinkSync(outside, link, "dir");

				expect(() =>
					containedProjectPath(
						paths.clientDir,
						"src/pages/Linked/victim.page.tsx",
					),
				).toThrow(/symbolic link/);

				expect(fs.existsSync(path.join(outside, "victim.page.tsx"))).toBe(
					false,
				);
			} finally {
				fs.rmSync(link, { force: true });
				fs.rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	it.skipIf(!symlinksAvailable)(
		"refuses a path that is itself a symbolic link out of the project",
		() => {
			const fixture = makeFixture();
			const paths = getPaths(fixture.dir);
			const outside = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-outside-"));
			const target = path.join(outside, "victim.cshtml");
			const link = path.join(paths.serverDir, "Views", "Linked.cshtml");
			fs.writeFileSync(target, "victim\n");

			try {
				fs.symlinkSync(target, link, "file");

				expect(() =>
					containedProjectPath(paths.serverDir, "Views/Linked.cshtml"),
				).toThrow(/symbolic link/);
			} finally {
				fs.rmSync(link, { force: true });
				fs.rmSync(outside, { recursive: true, force: true });
			}
		},
	);
});
