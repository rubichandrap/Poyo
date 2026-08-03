#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PACKAGE_JSONS = [
	path.join(ROOT, "packages", "poyo-template", "package.json"),
	path.join(ROOT, "packages", "poyo", "package.json"),
	path.join(ROOT, "packages", "create-poyo-app", "package.json"),
];

function readVersion(pkgJson) {
	return JSON.parse(fs.readFileSync(pkgJson, "utf-8")).version;
}

export function assertReleaseVersion(version, packageJsons = PACKAGE_JSONS) {
	const mismatches = [];
	for (const pkgJson of packageJsons) {
		const pkgVersion = readVersion(pkgJson);
		if (pkgVersion !== version) {
			mismatches.push(`${pkgJson}: ${pkgVersion} (expected ${version})`);
		}
	}
	return mismatches;
}

export function findLockstepMismatches(packageJsons = PACKAGE_JSONS) {
	const versions = packageJsons.map(readVersion);
	const [first] = versions;
	const mismatches = [];
	for (let i = 0; i < packageJsons.length; i++) {
		if (versions[i] !== first) {
			mismatches.push(`${packageJsons[i]}: ${versions[i]} (expected ${first})`);
		}
	}
	return mismatches;
}

const isDirectRun =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	const version = process.argv[2];
	const mismatches = version
		? assertReleaseVersion(version)
		: findLockstepMismatches();
	if (mismatches.length > 0) {
		process.stderr.write(
			`[ERROR] Version ${version ? `mismatch for tag ${version}` : "lockstep check failed"}:\n`,
		);
		for (const m of mismatches) {
			process.stderr.write(`  - ${m}\n`);
		}
		process.exit(1);
	}
	process.stdout.write(
		`[OK] All packages at ${version ?? "the same lockstep version"}\n`,
	);
}
