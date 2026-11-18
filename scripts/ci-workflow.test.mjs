import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/**
 * The workflow is the gate that catches a path-handling or Node-compatibility
 * regression, so the gate itself is checked: every suite that ships a CLI must
 * run where the platform and the runtime differ from the maintainer's machine.
 * A job quietly dropped from the matrix leaves the suites green and the
 * regression uncaught, which is the failure this test exists to make loud.
 *
 * The workflow is parsed, not scanned: a comment that names a runner, or a
 * step that mentions one without running it, is not coverage. The matrix entry
 * is the runner and the Node version CI actually selects.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = parse(
	fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf-8"),
);

/** The two suites the issue names, by the command CI runs for each. */
const SUITES = [
	"pnpm --filter @rubichandrap/poyo run test",
	"pnpm --filter @rubichandrap/create-poyo-app run test",
];

/** Every package that declares the Node range a release supports. */
const MANIFESTS = [
	"package.json",
	"packages/poyo/package.json",
	"packages/create-poyo-app/package.json",
	"packages/poyo-template/package.json",
];

function runCommands(job) {
	return (job.steps ?? [])
		.map((step) => step.run)
		.filter((run) => typeof run === "string")
		.join("\n");
}

/** Jobs whose steps run both suites. */
function suiteJobs() {
	return Object.entries(WORKFLOW.jobs)
		.map(([id, job]) => ({ id, job }))
		.filter(({ job }) =>
			SUITES.every((suite) => runCommands(job).includes(suite)),
		);
}

function matrixIncludes(job, predicate) {
	return (job.strategy?.matrix?.include ?? []).some(
		(entry) => entry && predicate(entry),
	);
}

/** The version `engines` refuses to run below, as a concrete version. */
function lowestEngineNode() {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
	);
	const lowerBound = /^>=\s*(\d+\.\d+\.\d+)$/.exec(manifest.engines.node);
	assert.ok(
		lowerBound,
		`root engines.node must be a single ">=x.y.z" lower bound, got '${manifest.engines.node}'`,
	);
	return lowerBound[1];
}

test("the workflow runs on every pull request", () => {
	assert.ok(
		WORKFLOW.on && Object.hasOwn(WORKFLOW.on, "pull_request"),
		"ci.yml does not run on pull_request",
	);
});

test("a matrix entry runs both suites on windows-latest", () => {
	const jobs = suiteJobs();
	assert.ok(jobs.length > 0, "no job runs both suites");

	const onWindows = jobs.filter(
		({ job }) =>
			job["runs-on"] === "${{ matrix.os }}" &&
			matrixIncludes(job, (entry) => entry.os === "windows-latest"),
	);
	assert.ok(
		onWindows.length > 0,
		`no job runs both suites on windows-latest (jobs: ${jobs
			.map(({ id }) => id)
			.join(", ")})`,
	);
});

test("a matrix entry runs both suites on the lowest Node engines allows", () => {
	const jobs = suiteJobs();
	const lowest = lowestEngineNode();

	const onLowest = jobs.filter(
		({ job }) =>
			matrixIncludes(job, (entry) => entry.node === lowest) &&
			(job.steps ?? []).some(
				(step) => step.with?.["node-version"] === "${{ matrix.node }}",
			),
	);
	assert.ok(
		onLowest.length > 0,
		`no job runs both suites on Node ${lowest} (jobs: ${jobs
			.map(({ id }) => id)
			.join(", ")})`,
	);
});

test("every package supports the same Node range", () => {
	const declared = new Map();
	for (const manifest of MANIFESTS) {
		const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, manifest), "utf-8"));
		assert.ok(pkg.engines?.node, `${manifest} declares no engines.node`);
		declared.set(manifest, pkg.engines.node);
	}
	assert.equal(
		new Set(declared.values()).size,
		1,
		`packages disagree on engines.node: ${[...declared]
			.map(([manifest, range]) => `${manifest} ${range}`)
			.join(", ")}`,
	);
});
