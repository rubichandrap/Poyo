import fs from "node:fs";
import { Command } from "commander";
import { getPaths } from "../config.js";
import { CliError } from "../error.js";
import { findRoute } from "../registry.js";
import { readRoutes, writeRoutes } from "../registry.js";
import { writeRouteManifest } from "../route-manifest.js";
import { deleteEmptyParents } from "../scaffold.js";

export function removeCommand(): Command {
	return new Command("remove")
		.description("Remove a route from routes.json")
		.argument("<path>", "URL path of the route to remove")
		.option(
			"-y, --yes",
			"Skip confirmation and delete related files automatically",
		)
		.option(
			"--keep-files",
			"Remove the route from routes.json but keep its files on disk",
		)
		.action(async (urlPath: string, options) => {
			const paths = getPaths();
			const routes = readRoutes(paths);
			const route = findRoute(routes, urlPath);
			if (!route) {
				throw new CliError(`Route not found: ${urlPath}`);
			}

			const hasController = route.controller !== undefined;

			let deleteController = false;
			let deleteFiles = false;

			if (options.yes) {
				deleteController = hasController;
				deleteFiles = true;
			} else if (options.keepFiles) {
				deleteController = false;
				deleteFiles = false;
			} else {
				const { confirm } = await import("@inquirer/prompts");
				if (hasController) {
					deleteController = await confirm({
						message: `Route uses custom controller '${route.controller}'. Delete this controller file?`,
						default: false,
					});
				}
				deleteFiles = await confirm({
					message:
						"Do you want to DELETE the physical files and folders related to this route?",
					default: false,
				});
			}

			if (deleteController && route.controller) {
				const controllerPath = `${paths.controllersDir}/${route.controller}.cs`;
				if (fs.existsSync(controllerPath)) {
					fs.unlinkSync(controllerPath);
				}
			}

			if (deleteFiles) {
				const reactPath = `${paths.clientDir}/${route.files.react}`;
				const viewPath = `${paths.serverDir}/${route.files.view}`;
				if (fs.existsSync(reactPath)) {
					fs.unlinkSync(reactPath);
					deleteEmptyParents(reactPath, paths.clientDir);
				}
				if (fs.existsSync(viewPath)) {
					fs.unlinkSync(viewPath);
					deleteEmptyParents(viewPath, paths.serverDir);
				}
			}

			const index = routes.findIndex((r) => r.path === route.path);
			routes.splice(index, 1);
			writeRoutes(paths, routes);
			writeRouteManifest(paths);

			if (!deleteFiles) {
				process.stdout.write(
					`Orphaned files kept (use 'poyo route remove ${route.path} --yes' to delete them):\n`,
				);
				process.stdout.write(
					`  - ${paths.toProjectPath("client", route.files.react)}\n`,
				);
				process.stdout.write(
					`  - ${paths.toProjectPath("server", route.files.view)}\n`,
				);
				if (deleteController === false && route.controller) {
					process.stdout.write(
						`  - ${paths.toProjectPath("server", `Controllers/${route.controller}.cs`)}\n`,
					);
				}
			}
		});
}
