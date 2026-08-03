import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
	assertReleaseVersion,
	findLockstepMismatches,
} from "./assert-release-version.mjs";

const SCRIPT = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"assert-release-version.mjs",
);

const CURRENT_VERSION = JSON.parse(
	fs.readFileSync(
		path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
			"packages",
			"poyo",
			"package.json",
		),
		"utf-8",
	),
).version;

function tempPackageJson(version) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-version-"));
	const pkgJson = path.join(dir, "package.json");
	fs.writeFileSync(pkgJson, JSON.stringify({ name: "pkg", version }));
	return pkgJson;
}

test("returns no mismatches when all packages match", () => {
	const a = tempPackageJson("1.2.3");
	const b = tempPackageJson("1.2.3");
	assert.deepEqual(assertReleaseVersion("1.2.3", [a, b]), []);
});

test("reports mismatched package versions", () => {
	const a = tempPackageJson("1.2.3");
	const b = tempPackageJson("1.2.4");
	const mismatches = assertReleaseVersion("1.2.3", [a, b]);
	assert.equal(mismatches.length, 1);
	assert.match(mismatches[0], /1\.2\.4/);
});

test("reports all mismatched versions", () => {
	const a = tempPackageJson("1.0.0");
	const b = tempPackageJson("2.0.0");
	assert.equal(assertReleaseVersion("3.0.0", [a, b]).length, 2);
});

test("lockstep check reports nothing when all versions are equal", () => {
	const a = tempPackageJson("0.0.3");
	const b = tempPackageJson("0.0.3");
	assert.deepEqual(findLockstepMismatches([a, b]), []);
});

test("lockstep check reports packages that differ from the first", () => {
	const a = tempPackageJson("0.0.3");
	const b = tempPackageJson("0.0.4");
	const mismatches = findLockstepMismatches([a, b]);
	assert.equal(mismatches.length, 1);
	assert.match(mismatches[0], /0\.0\.4/);
});

test("exits 0 on match and 1 on mismatch", () => {
	const match = spawnSync(process.execPath, [SCRIPT, CURRENT_VERSION], {
		encoding: "utf-8",
	});
	assert.equal(match.status, 0);

	const mismatch = spawnSync(process.execPath, [SCRIPT, "9.9.9"], {
		encoding: "utf-8",
	});
	assert.equal(mismatch.status, 1);
	assert.match(mismatch.stderr, /Version mismatch/);
});

test("zero-arg lockstep check exits 0 when versions are equal", () => {
	const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf-8" });
	assert.equal(result.status, 0);
	assert.match(result.stdout, /lockstep/);
});
