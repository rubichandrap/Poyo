import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../dist/index.js",
);

export const OWN_VERSION = (
	JSON.parse(
		fs.readFileSync(
			path.resolve(
				path.dirname(fileURLToPath(import.meta.url)),
				"../package.json",
			),
			"utf-8",
		),
	) as { version: string }
).version;

export function runCli(
	args: string[],
	options: { cwd: string },
): { status: number; stdout: string; stderr: string } {
	const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
		cwd: options.cwd,
		encoding: "utf-8",
	});
	return {
		status: result.status ?? -1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

export function makeTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "cpa-test-"));
}

export function readJson(dir: string, relative: string): unknown {
	return JSON.parse(fs.readFileSync(path.join(dir, relative), "utf-8"));
}

export function exists(dir: string, relative: string): boolean {
	return fs.existsSync(path.join(dir, relative));
}

export function readFile(dir: string, relative: string): string {
	return fs.readFileSync(path.join(dir, relative), "utf-8");
}
