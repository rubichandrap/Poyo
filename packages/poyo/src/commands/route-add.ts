import { Command } from "commander";
import { getPaths } from "../config.js";
import { CliError } from "../error.js";
import { resolveRouteFiles, toRouteName, toRoutePath } from "../naming.js";
import { readRoutes, validateRoutes, writeRoutes } from "../registry.js";
import { writeRouteManifest } from "../route-manifest.js";
import { accessFromFlags, type Route } from "../routes.js";
import {
	assertCSharpIdentifier,
	controllerRouteName,
	ensureControllerAction,
	scaffoldRouteFiles,
} from "../scaffold.js";
import { defaultSeo } from "../templates.js";

export function addCommand(): Command {
	return new Command("add")
		.description("Add a new route and scaffold files")
		.argument("<path>", "URL path for the route (e.g. /Admin/Users)")
		.option("-p, --public", "Mark route as public (accessible without auth)")
		.option(
			"-g, --guest",
			"Mark route as guest only (only accessible without auth)",
		)
		.option(
			"-f, --flat",
			"Use flat file structure (e.g. detail.page.tsx) instead of folder (Detail/index.page.tsx)",
		)
		.option("-c, --controller <name>", "Specify custom controller class name")
		.option("-a, --action <name>", "Specify action method name")
		.option("--no-view", "Skip MVC View generation")
		.action((urlPath: string, options) => {
			const name = toRouteName(urlPath);
			const routePath = toRoutePath(name);
			const access = accessFromFlags(options.public, options.guest);

			const paths = getPaths();
			const routes = readRoutes(paths);
			if (
				routes.some((r) => r.path.toLowerCase() === routePath.toLowerCase())
			) {
				throw new CliError(`Route already exists: ${routePath}`);
			}

			if (options.controller && !options.action) {
				throw new CliError(
					"If --controller is specified, --action must also be specified.",
				);
			}

			if (options.action && !options.controller) {
				throw new CliError(
					"If --action is specified, --controller must also be specified.",
				);
			}

			// Both flags become a file name and C# source, so they are checked
			// before anything is written: an escaping value must not reach the
			// controller path, and an arbitrary string must not reach the class.
			let controller: string | undefined;
			if (options.controller) {
				assertCSharpIdentifier(options.controller, "controller");
				assertCSharpIdentifier(options.action, "action");
				controller = controllerRouteName(options.controller);
			}

			const files = resolveRouteFiles(name, options.flat);

			const route: Route = {
				path: routePath,
				name,
				files,
				access,
				...(controller && { controller, action: options.action }),
				seo: defaultSeo(name),
			};

			// The registry the command is about to write is validated whole
			// before any file is touched. A route refused here (a duplicate
			// name, say) used to leave an appended controller behind.
			const nextRoutes = [...routes, route];
			validateRoutes(nextRoutes);

			// Past this point a failure is not rolled back: the controller may
			// already be appended when a later write fails. The guarantee is
			// for a command that fails validation, which changes nothing.
			if (options.controller) {
				ensureControllerAction(paths, options.controller, options.action);
			}

			writeRoutes(paths, nextRoutes);
			writeRouteManifest(paths);

			scaffoldRouteFiles(paths, name, files, {
				noView: options.view === false,
			});
		});
}
