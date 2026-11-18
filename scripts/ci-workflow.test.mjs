import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The workflow is the gate that catches a path-handling or Node-compatibility
 * regression, so the gate itself is checked: every suite that ships a CLI must
 * run where the platform and the runtime differ from the maintainer's machine.
 * A job quietly dropped from the matrix leaves the suites green and the
 * regression uncaught, which is the failure this test exists to make loud.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = fs.readFileSync(
	path.join(ROOT, ".github", "workflows", "ci.yml"),
	"utf-8",
);

/** The two suites the issue names, by the command CI runs for each. */
const SUITES = [
	"pnpm --filter @rubichandrap/poyo run test",
	"pnpm --filter @rubichandrap/create-poyo-app run test",
];

/**
 * The text of each job, keyed by job id. Job ids sit at two spaces; every
 * deeper line — a property, a matrix entry, a step — belongs to that job.
 */
function jobBlocks(source) {
	const blocks = new Map();
	let current = null;
	for (const line of source.split("\n")) {
		const job = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
		if (job) {
			current = job[1];
			blocks.set(current, "");
			continue;
		}
		if (current) {
			blocks.set(current, `${blocks.get(current)}${line}\n`);
		}
	}
	return blocks;
}

function jobsRunningEverything(source) {
	return [...jobBlocks(source)]
		.filter(([, block]) => SUITES.every((suite) => block.includes(suite)))
		.map(([id]) => id);
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
	assert.match(WORKFLOW, /^on:\n(?: {2}.*\n)*? {2}pull_request:/m);
});

test("the framework and scaffolder suites run on windows-latest", () => {
	const jobs = jobsRunningEverything(WORKFLOW);
	assert.ok(jobs.length > 0, "no job runs both suites");
	const onWindows = jobs.filter((id) =>
		jobBlocks(WORKFLOW).get(id).includes("windows-latest"),
	);
	assert.ok(
		onWindows.length > 0,
		`no job runs both suites on windows-latest (jobs: ${jobs.join(", ")})`,
	);
});

test("the framework and scaffolder suites run on the lowest Node engines allows", () => {
	const jobs = jobsRunningEverything(WORKFLOW);
	const lowest = lowestEngineNode();
	const onLowest = jobs.filter((id) =>
		jobBlocks(WORKFLOW).get(id).includes(`"${lowest}"`),
	);
	assert.ok(
		onLowest.length > 0,
		`no job runs both suites on Node ${lowest} (jobs: ${jobs.join(", ")})`,
	);
});
