import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../dist/index.js",
);

export interface RunResult {
	status: number;
	stdout: string;
	stderr: string;
}

export function runCli(
	args: string[],
	options: { cwd: string; env?: Record<string, string> },
): RunResult {
	const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
		cwd: options.cwd,
		encoding: "utf-8",
		env: { ...process.env, ...options.env },
	});
	return {
		status: result.status ?? -1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

export interface Fixture {
	dir: string;
	routesJson: () => Route[];
}

export interface Route {
	path: string;
	name: string;
	files: { react: string; view: string };
	isPublic?: boolean;
	isGuestOnly?: boolean;
	controller?: string;
	action?: string;
	seo?: { title?: string; description?: string; meta?: Record<string, string> };
}

export function makeFixture(
	starterRoutes: Route[] = [],
	layout: { clientDir?: string; serverDir?: string } = {},
): Fixture {
	const clientDir = layout.clientDir ?? "poyo.client";
	const serverDir = layout.serverDir ?? "Poyo.Server";
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-test-"));
	mkdirs(dir, `${clientDir}/src/pages`);
	mkdirs(dir, `${serverDir}/Views`);
	mkdirs(dir, `${serverDir}/Controllers`);
	fs.writeFileSync(
		path.join(dir, "routes.json"),
		`${JSON.stringify(starterRoutes, null, 2)}\n`,
	);
	return {
		dir,
		routesJson: () =>
			JSON.parse(
				fs.readFileSync(path.join(dir, "routes.json"), "utf-8"),
			) as Route[],
	};
}

export function mkdirs(root: string, relative: string): void {
	fs.mkdirSync(path.join(root, relative), { recursive: true });
}

export function writeFixtureFile(
	fixture: Fixture,
	relative: string,
	content: string,
): void {
	const full = path.join(fixture.dir, relative);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content);
}

export function readFixtureFile(fixture: Fixture, relative: string): string {
	return fs.readFileSync(path.join(fixture.dir, relative), "utf-8");
}

export function existsFixtureFile(fixture: Fixture, relative: string): boolean {
	return fs.existsSync(path.join(fixture.dir, relative));
}

export function execInFixture(
	fixture: Fixture,
	args: string[],
	env?: Record<string, string>,
): RunResult {
	return runCli(args, { cwd: fixture.dir, env });
}
