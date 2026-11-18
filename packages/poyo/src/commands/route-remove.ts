import fs from "node:fs";
import { Command } from "commander";
import { getPaths } from "../config.js";
import { CliError } from "../error.js";
import { findRoute, readRoutes, writeRoutes } from "../registry.js";
import { writeRouteManifest } from "../route-manifest.js";
import type { Route } from "../routes.js";
import {
	controllerFilePath,
	controllerClassName,
	deleteRouteFiles,
	isScaffoldedController,
} from "../scaffold.js";

/**
 * Whether another route is served by the same controller. MVC matches a
 * controller by its bare name ignoring case, and the registry stores that
 * name, so two routes share the file when their declarations do.
 */
function usesController(route: Route, controller: string): boolean {
	return route.controller?.toLowerCase() === controller.toLowerCase();
}

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

			const controller = route.controller;
			const remaining = routes.filter((r) => r.path !== route.path);
			const sharedBy =
				controller === undefined
					? []
					: remaining.filter((r) => usesController(r, controller));
			// A controller the command may delete is one no other route
			// references and one the CLI wrote in full: a hand-written
			// controller, or a scaffolded one a human has since edited, is the
			// operator's file, not the route manager's.
			const deletableController =
				controller !== undefined &&
				sharedBy.length === 0 &&
				isScaffoldedController(paths, controller);
			const controllerFile =
				controller === undefined
					? undefined
					: controllerFilePath(paths, controller);
			const controllerExists =
				controllerFile !== undefined && fs.existsSync(controllerFile);

			let deleteController = false;
			let deleteFiles = false;

			if (options.yes) {
				deleteController = deletableController;
				deleteFiles = true;
			} else if (options.keepFiles) {
				deleteController = false;
				deleteFiles = false;
			} else {
				const { confirm } = await import("@inquirer/prompts");
				if (deletableController) {
					deleteController = await confirm({
						message: `Route uses custom controller '${controller}'. Delete this controller file?`,
						default: false,
					});
				}
				deleteFiles = await confirm({
					message:
						"Do you want to DELETE the physical files and folders related to this route?",
					default: false,
				});
			}

			if (deleteController || deleteFiles) {
				deleteRouteFiles(paths, route.files, {
					files: deleteFiles,
					controller: deleteController ? controller : undefined,
				});
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
			}

			if (controller === undefined || !controllerExists) {
				return;
			}

			const controllerPath = paths.toProjectPath(
				"server",
				`Controllers/${controllerClassName(controller)}.cs`,
			);
			if (deleteController) {
				process.stdout.write(`Deleted controller: ${controllerPath}\n`);
				return;
			}

			const notes = [];
			if (sharedBy.length > 0) {
				notes.push(`still used by ${sharedBy.map((r) => r.path).join(", ")}`);
				if (route.action !== undefined) {
					notes.push(`its ${route.action} action is left in place`);
				}
			} else if (!deletableController) {
				notes.push("it holds actions the CLI did not scaffold");
			}
			process.stdout.write(
				`Kept controller: ${controllerPath}${
					notes.length > 0 ? ` (${notes.join("; ")})` : ""
				}\n`,
			);
		});
}
