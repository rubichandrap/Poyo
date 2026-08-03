import { Command } from "commander";
import { getPaths } from "../config.js";
import { CliError } from "../error.js";
import { findRoute } from "../registry.js";
import { readRoutes, writeRoutes } from "../registry.js";

export function updateCommand(): Command {
	return new Command("update")
		.description("Update existing route properties")
		.argument("<path>", "URL path of the route to update")
		.option("-p, --public <boolean>", "Set public status (true/false)")
		.option("-g, --guest <boolean>", "Set guest only status (true/false)")
		.action((urlPath: string, options) => {
			const paths = getPaths();
			const routes = readRoutes(paths);
			const route = findRoute(routes, urlPath);
			if (!route) {
				throw new CliError(`Route not found: ${urlPath}`);
			}

			let updated = false;

			if (options.public !== undefined) {
				const isPublic = options.public === "true" || options.public === true;
				if (route.isPublic !== isPublic) {
					route.isPublic = isPublic;
					updated = true;
				}
			}

			if (options.guest !== undefined) {
				const isGuestOnly = options.guest === "true" || options.guest === true;
				if (route.isGuestOnly !== isGuestOnly) {
					route.isGuestOnly = isGuestOnly;
					updated = true;
				}
			}

			if (updated) {
				writeRoutes(paths, routes);
			}
		});
}
