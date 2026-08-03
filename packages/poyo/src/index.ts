#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { CliError } from "./error.js";

const HELP = `Poyo project CLI

Usage: poyo <command> [options]

Commands:
  route   Manage the routes registry (add, update, remove, sync)
`;

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);

	if (!command || command === "--help" || command === "-h") {
		process.stdout.write(HELP);
		return;
	}
	if (command === "--version" || command === "-V") {
		const pkg = JSON.parse(
			readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
		) as { version: string };
		process.stdout.write(`${pkg.version}\n`);
		return;
	}

	switch (command) {
		case "route": {
			const { run } = await import("./commands/route.js");
			await run(rest);
			return;
		}
		default:
			throw new CliError(`Unknown command: '${command}'. Run 'poyo --help'.`);
	}
}

main().catch((error: unknown) => {
	if (error instanceof CliError) {
		process.stderr.write(`[ERROR] ${error.message}\n`);
	} else {
		process.stderr.write(
			`[ERROR] ${error instanceof Error ? error.message : String(error)}\n`,
		);
	}
	process.exit(1);
});
