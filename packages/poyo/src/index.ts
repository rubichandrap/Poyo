#!/usr/bin/env node
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { CliError } from "./error.js";

const HELP = `Poyo project CLI

Usage: poyo <command> [options]

Commands:
  route     Manage the routes registry (add, update, remove, sync)
  build     Sync the client bundle into the server's wwwroot
  generate  Generate TypeScript DTOs and Zod schemas from the OpenAPI snapshot
`;

async function runTopLevel(command: Command, args: string[]): Promise<void> {
	await command.parseAsync(args, { from: "user" });
}

async function main(): Promise<void> {
	// pnpm run forwards a literal "--" token before the script's args;
	// commander would treat it as end-of-options, so drop stray ones.
	const argv = process.argv.slice(2).filter((arg) => arg !== "--");
	const [command, ...rest] = argv;

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
		case "build": {
			const { buildCommand } = await import("./commands/build.js");
			await runTopLevel(buildCommand(), rest);
			return;
		}
		case "generate": {
			const { generateCommand } = await import("./commands/generate.js");
			await runTopLevel(generateCommand(), rest);
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
