import { Command } from "commander";
import { getPaths } from "../config.js";
import { CliError } from "../error.js";
import { findRoute, readRoutes, writeRoutes } from "../registry.js";
import { applyAccessFlag, assertSingleAccessFlag } from "../routes.js";

function parseBooleanFlag(value: unknown, flag: string): boolean {
	if (value === "true") return true;
	if (value === "false") return false;
	throw new CliError(
		`--${flag} expects "true" or "false", got: ${String(value)}`,
	);
}

export function updateCommand(): Command {
	return new Command("update")
		.description("Update existing route properties")
		.argument("<path>", "URL path of the route to update")
		.option("-p, --public <boolean>", "Set public status (true/false)")
		.option("-g, --guest <boolean>", "Set guest only status (true/false)")
		.action((urlPath: string, options) => {
			assertSingleAccessFlag(options.public, options.guest);

			const paths = getPaths();
			const routes = readRoutes(paths);
			const route = findRoute(routes, urlPath);
			if (!route) {
				throw new CliError(`Route not found: ${urlPath}`);
			}

			const update =
				options.public !== undefined
					? {
							flag: "public" as const,
							on: parseBooleanFlag(options.public, "public"),
						}
					: options.guest !== undefined
						? {
								flag: "guest" as const,
								on: parseBooleanFlag(options.guest, "guest"),
							}
						: undefined;

			if (update) {
				const access = applyAccessFlag(route.access, update.flag, update.on);
				if (access !== route.access) {
					route.access = access;
					writeRoutes(paths, routes);
				}
			}
		});
}
