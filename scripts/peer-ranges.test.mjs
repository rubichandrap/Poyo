import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRange, satisfiesRange } from "./peer-ranges.mjs";

const MAJORS = [3, 4, 5, 6, 7];
const MINORS = [0, 8, 9, 10, 20];
const PATCHES = [0, 2, 3, 99];

/** Every version in the sampled grid — the finite domain the model is checked on. */
const VERSIONS = MAJORS.flatMap((major) =>
	MINORS.flatMap((minor) =>
		PATCHES.map((patch) => `${major}.${minor}.${patch}`),
	),
);

/**
 * Independent readings of the same ranges, written as predicates over the
 * version parts rather than as intervals. If both encodings agree on every
 * point of the grid, the interval model is not merely self-consistent.
 */
const ORACLE = [
	["^5.x", ([major]) => major === 5],
	["5", ([major]) => major === 5],
	["5.x", ([major]) => major === 5],
	["5.9", ([major, minor]) => major === 5 && minor === 9],
	[
		"^5.9.3",
		([major, minor, patch]) =>
			major === 5 && (minor > 9 || (minor === 9 && patch >= 3)),
	],
	[
		"~5.9.3",
		([major, minor, patch]) => major === 5 && minor === 9 && patch >= 3,
	],
	[">=5 <7", ([major]) => major >= 5 && major < 7],
	[
		">=5.9.3 <5.10.0",
		([major, minor, patch]) => major === 5 && minor === 9 && patch >= 3,
	],
	["*", () => true],
	[
		"5.9.3",
		([major, minor, patch]) => major === 5 && minor === 9 && patch === 3,
	],
	["<5", ([major]) => major < 5],
	[">=5", ([major]) => major >= 5],
	[
		"^18 || ^20 || >=22",
		([major]) => major === 18 || major === 20 || major >= 22,
	],
];

test("the interval model agrees with an independent predicate on every sampled version", () => {
	for (const [range, predicate] of ORACLE) {
		for (const version of VERSIONS) {
			const parts = version.split(".").map(Number);
			assert.equal(
				satisfiesRange(version, range),
				predicate(parts),
				`${range} vs ${version}`,
			);
		}
	}
});

test("the grid covers both sides of every boundary the ranges encode", () => {
	// A model check is only as good as its domain: prove the sampled versions
	// straddle each decision point instead of all landing on one side.
	assert.equal(satisfiesRange("4.99.99", "^5.x"), false);
	assert.equal(satisfiesRange("5.0.0", "^5.x"), true);
	assert.equal(satisfiesRange("5.99.99", "^5.x"), true);
	assert.equal(satisfiesRange("6.0.0", "^5.x"), false);
	assert.equal(satisfiesRange("5.9.2", "^5.9.3"), false);
	assert.equal(satisfiesRange("5.10.0", "~5.9.3"), false);
	assert.equal(satisfiesRange("6.0.0", ">=5 <7"), true);
	assert.equal(satisfiesRange("7.0.0", ">=5 <7"), false);
});

test("a range the model does not understand throws instead of passing", () => {
	for (const range of ["workspace:*", "latest", ">=a", "^5.9.3 ||", ""]) {
		assert.throws(() => parseRange(range), /Unsupported|Empty/);
	}
});

test("a caret on a zero major behaves like npm's", () => {
	assert.equal(satisfiesRange("0.2.5", "^0.2.3"), true);
	assert.equal(satisfiesRange("0.3.0", "^0.2.3"), false);
	// npm: ^0.0.3 := >=0.0.3 <0.0.4 — the left-most non-zero position is the
	// patch, so even a patch bump leaves the range.
	assert.equal(satisfiesRange("0.0.3", "^0.0.3"), true);
	assert.equal(satisfiesRange("0.0.4", "^0.0.3"), false);
});
