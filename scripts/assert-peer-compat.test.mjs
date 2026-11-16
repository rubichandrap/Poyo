import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findPeerMismatches } from "./assert-peer-compat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPENAPI_TYPESCRIPT = path.join(
	ROOT,
	"packages",
	"poyo",
	"node_modules",
	"openapi-typescript",
);

/**
 * The gate must be able to fail. This drives the real wiring — a real
 * dependency manifest and its real peer range — and fakes only the resolution
 * seam, so the reported mismatch is the gate's own verdict rather than a
 * restatement of the model.
 */
test("reports a real peer mismatch when the resolved version is outside the range", () => {
	assert.ok(
		fs.existsSync(OPENAPI_TYPESCRIPT),
		"openapi-typescript must be installed for this gate test",
	);

	const manifest = JSON.parse(
		fs.readFileSync(path.join(OPENAPI_TYPESCRIPT, "package.json"), "utf-8"),
	);
	assert.equal(manifest.peerDependencies.typescript, "^5.x");

	const listing = new Map([
		["openapi-typescript", { version: "7.13.0", path: OPENAPI_TYPESCRIPT }],
		// The version the pre-fix repo pinned, which the gate must refuse.
		["typescript", { version: "6.0.3" }],
	]);

	const mismatches = findPeerMismatches([OPENAPI_TYPESCRIPT], () => listing);
	assert.deepEqual(
		mismatches.map((mismatch) => ({
			peer: mismatch.peer,
			range: mismatch.range,
			version: mismatch.version,
		})),
		[{ peer: "typescript", range: "^5.x", version: "6.0.3" }],
	);
});

test("accepts a version inside the real declared range", () => {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(OPENAPI_TYPESCRIPT, "package.json"), "utf-8"),
	);
	const listing = new Map([
		["openapi-typescript", { version: "7.13.0", path: OPENAPI_TYPESCRIPT }],
		["typescript", { version: "5.9.3" }],
	]);
	assert.ok(
		findPeerMismatches([OPENAPI_TYPESCRIPT], () => listing).every(
			(mismatch) => mismatch.peer !== "typescript",
		),
		`typescript@5.9.3 must satisfy ${manifest.peerDependencies.typescript}`,
	);
});
