import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The clean-checkout lifecycle, as a state machine walked against a real
 * clone. Each transition is one documented command; each target state names
 * the artifacts that must exist once it completes.
 *
 * The rule the machine encodes: a documented command may only assume the
 * artifacts a previous documented command produced. `packages/poyo/dist` is
 * gitignored, so before the fix the `clean -> installed` transition left the
 * `poyo` binary missing and every later state was unreachable — invisible in a
 * developer's workspace, where `dist` happens to exist.
 */
const LIFECYCLE = [
	{
		state: "clean",
		command: null,
		artifacts: [],
		forbidden: [
			"node_modules",
			"packages/poyo/dist/index.js",
			"packages/create-poyo-app/dist/index.js",
			"packages/poyo-template/poyo.client/src/schemas/dtos.generated.ts",
		],
	},
	{
		state: "installed",
		command: [
			"pnpm",
			["install", "--frozen-lockfile", "--strict-peer-dependencies"],
		],
		artifacts: [
			"packages/poyo/dist/index.js",
			"packages/create-poyo-app/dist/index.js",
			// The binary is linked where its consumer is: the template declares
			// the CLI, the repo root does not.
			"packages/poyo-template/node_modules/.bin/poyo",
		],
		forbidden: [],
	},
	{
		state: "cli",
		command: [
			path.join("packages", "poyo-template", "node_modules", ".bin", "poyo"),
			["--version"],
		],
		artifacts: [],
		forbidden: [],
	},
	{
		state: "generated",
		command: [
			"pnpm",
			["--filter", "@rubichandrap/poyo-template", "run", "client:generate"],
		],
		artifacts: [
			"packages/poyo-template/poyo.client/src/schemas/dtos.generated.ts",
			"packages/poyo-template/poyo.client/src/schemas/validations.generated.ts",
			"packages/poyo-template/poyo.client/routes.generated.ts",
		],
		forbidden: [],
	},
];

function run(command, args, cwd) {
	const [bin, binArgs] = command;
	const result = spawnSync(bin, binArgs, {
		cwd,
		encoding: "utf-8",
		env: { ...process.env, CI: "1" },
	});
	if (result.status !== 0) {
		throw new Error(
			`'${command.join(" ")}' failed in the clean checkout (exit ${result.status}):\n${result.stdout}\n${result.stderr}`,
		);
	}
	return result;
}

test(
	"a clean clone reaches every documented state, in order, from tracked files alone",
	{ timeout: 900_000 },
	() => {
		const workDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "poyo-clean-checkout-"),
		);
		const cloneDir = path.join(workDir, "clone");
		let keepForEvidence = true;
		try {
			// `git clone` is the definition of a clean checkout here: it copies
			// tracked files only, so nothing gitignored can leak in and prop up
			// a step that would fail for a contributor.
			const clone = spawnSync(
				"git",
				["clone", "--depth", "1", `file://${ROOT}`, cloneDir],
				{ encoding: "utf-8" },
			);
			assert.equal(clone.status, 0, `git clone failed: ${clone.stderr}`);

			for (const step of LIFECYCLE) {
				if (step.command) {
					run(step.command, null, cloneDir);
				}
				for (const artifact of step.artifacts) {
					assert.ok(
						fs.existsSync(path.join(cloneDir, artifact)),
						`state '${step.state}' must produce ${artifact}`,
					);
				}
				for (const artifact of step.forbidden) {
					assert.ok(
						!fs.existsSync(path.join(cloneDir, artifact)),
						`state '${step.state}' must not have ${artifact}`,
					);
				}
			}

			// The installed CLI is the version this commit declares, not some
			// stale binary left in a developer's tree.
			const version = JSON.parse(
				fs.readFileSync(
					path.join(ROOT, "packages", "poyo", "package.json"),
					"utf-8",
				),
			).version;
			const built = JSON.parse(
				fs.readFileSync(
					path.join(cloneDir, "packages", "poyo", "package.json"),
					"utf-8",
				),
			).version;
			assert.equal(built, version);
			keepForEvidence = false;
		} finally {
			if (keepForEvidence) {
				process.stderr.write(`clean-checkout evidence kept at ${cloneDir}\n`);
			} else {
				fs.rmSync(workDir, { recursive: true, force: true });
			}
		}
	},
);
