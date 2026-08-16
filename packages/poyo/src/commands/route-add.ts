import { Command } from "commander";
import { getPaths } from "../config.js";
import { CliError } from "../error.js";
import { toRouteName, toRoutePath } from "../naming.js";
import { readRoutes, writeRoutes } from "../registry.js";
import { writeRouteManifest } from "../route-manifest.js";
import { accessFromFlags, type Route } from "../routes.js";
import { ensureControllerAction, scaffoldRouteFiles } from "../scaffold.js";
import { defaultSeo } from "../templates.js";
import { resolveRouteFiles } from "../naming.js";

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

			const files = resolveRouteFiles(name, options.flat);

			const controller = options.controller
				? ensureControllerAction(
						paths,
						options.controller,
						options.action,
						files.view,
					)
				: undefined;

			const route: Route = {
				path: routePath,
				name,
				files,
				access,
				...(controller && { controller, action: options.action }),
				seo: defaultSeo(name),
			};

			routes.push(route);
			writeRoutes(paths, routes);
			writeRouteManifest(paths);

			scaffoldRouteFiles(paths, name, files, {
				noView: options.view === false,
			});
		});
}
