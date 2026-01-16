import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { select, confirm, input } from "@inquirer/prompts";
import { Command } from "commander";

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ROOT_DIR = path.resolve(__dirname, "..");
const CLIENT_DIR = path.join(ROOT_DIR, "Poyo.client");
const SERVER_DIR = path.join(ROOT_DIR, "Poyo.Server");
const CONTROLLERS_DIR = path.join(SERVER_DIR, "Controllers");
const ROUTES_JSON_PATH = path.join(ROOT_DIR, "routes.json");

// Templates
const TEMPLATE_PAGE = (name) => `import type React from 'react';

const ${name.split("/").pop()}: React.FC = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">${name}</h1>
    </div>
  );
}

export default ${name.split("/").pop()};
`;

const TEMPLATE_VIEW = (name) => `@{
    ViewBag.Title = "${name}";
}

<div id="react-root" data-page-name="${name}"></div>
`;

const TEMPLATE_CONTROLLER = (name, action, viewPath) => `using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public class ${name} : Controller
{
    public IActionResult ${action}()
    {
        return View("~/${viewPath}");
    }
}
`;

const TEMPLATE_ACTION = (action, viewPath) => `
    public IActionResult ${action}()
    {
        return View("~/${viewPath}");
    }
`;

// Helper: Read Routes
function readRoutes() {
	if (!fs.existsSync(ROUTES_JSON_PATH)) return [];
	try {
		return JSON.parse(fs.readFileSync(ROUTES_JSON_PATH, "utf-8"));
	} catch (e) {
		console.error("Error reading routes.json:", e.message);
		process.exit(1);
	}
}

// Helper: Write Routes
function writeRoutes(routes) {
	// Sort by path for consistency
	routes.sort((a, b) => a.path.localeCompare(b.path));
	fs.writeFileSync(ROUTES_JSON_PATH, JSON.stringify(routes, null, 2) + "\n");
	console.log(`[SUCCESS] Updated routes.json with ${routes.length} routes.`);
}

// Helper: Resolve Paths
function resolvePaths(name, isFlat = false) {
	if (isFlat) {
		const parts = name.split('/');
		const leaf = parts.pop();
		const parent = parts.join('/');
		const basePath = parent ? `${parent}/` : '';

		return {
			react: `src/pages/${basePath}${leaf.toLowerCase()}.page.tsx`,
			view: `Views/${basePath}${leaf}.cshtml`
		};
	}
	return {
		react: `src/pages/${name}/index.page.tsx`,
		view: `Views/${name}/Index.cshtml`,
	};
}

// Helper: Ensure Controller and Action
function ensureControllerAction(controllerName, actionName, viewPath) {
	const controllerFileName = `${controllerName}.cs`;
	// If user provided "Controller" suffix (e.g. MyController), allow it. 
	// If not (e.g. "My"), append "Controller" for filename and classname if convention dictates,
	// BUT user might have provided exact name. 
	// Standard convention: Class Name = [Name]Controller. File Name = [Name]Controller.cs.
	// Let's assume input 'controllerName' IS the class name (User is responsible, or we append).
	// Let's append 'Controller' if not present, to be safe/standard.

	let safeControllerName = controllerName;
	if (!safeControllerName.endsWith("Controller")) {
		safeControllerName += "Controller";
	}

	const controllerPath = path.join(CONTROLLERS_DIR, `${safeControllerName}.cs`);

	if (!fs.existsSync(controllerPath)) {
		// Create new controller
		fs.writeFileSync(controllerPath, TEMPLATE_CONTROLLER(safeControllerName, actionName, viewPath));
		console.log(`[CREATED] Controller: ${safeControllerName}.cs`);
	} else {
		// Inject action
		let content = fs.readFileSync(controllerPath, "utf-8");

		// Simple check if action exists
		// Regex looks for "public IActionResult [ActionName](" or "public async Task<IActionResult> [ActionName]("
		const actionRegex = new RegExp(`public\\s+(async\\s+Task<)?IActionResult(>)?\\s+${actionName}\\s*\\(`, "i");
		if (actionRegex.test(content)) {
			console.error(`[ERROR] Action '${actionName}' already exists in ${safeControllerName}.cs`);
			process.exit(1);
		}

		// Find last closing brace of the class
		const lastBraceIndex = content.lastIndexOf("}");
		if (lastBraceIndex === -1) {
			console.error(`[ERROR] Could not parse class structure in ${safeControllerName}.cs`);
			process.exit(1);
		}

		const newContent = content.slice(0, lastBraceIndex) + TEMPLATE_ACTION(actionName, viewPath) + content.slice(lastBraceIndex);
		fs.writeFileSync(controllerPath, newContent);
		console.log(`[UPDATED] Controller: ${safeControllerName}.cs (Injected action '${actionName}')`);
	}

	return safeControllerName; // Return the actual class name used
}

// Helper: Scaffold Files
function scaffoldRouteFiles(name, files, options, controllerInfo) {
	const pageFullPath = path.join(CLIENT_DIR, files.react);
	const viewFullPath = path.join(SERVER_DIR, files.view);

	// 1. React Page (Always unless --no-react, but we don't have --no-react flag yet, plan said "always scaffold react")
	if (!fs.existsSync(pageFullPath)) {
		fs.mkdirSync(path.dirname(pageFullPath), { recursive: true });
		fs.writeFileSync(pageFullPath, TEMPLATE_PAGE(name));
		console.log(`[CREATED] React Page: ${files.react}`);
	} else {
		console.log(`[EXISTS] React Page: ${files.react}`);
	}

	// 2. MVC View (Skip if --no-view)
	if (options.view !== false) {
		if (!fs.existsSync(viewFullPath)) {
			fs.mkdirSync(path.dirname(viewFullPath), { recursive: true });
			fs.writeFileSync(viewFullPath, TEMPLATE_VIEW(name));
			console.log(`[CREATED] MVC View: ${files.view}`);
		} else {
			console.log(`[EXISTS] MVC View: ${files.view}`);
		}
	} else {
		console.log(`[SKIP] MVC View generation skipped (--no-view)`);
	}

	// 3. Controller Injection
	if (controllerInfo) {
		ensureControllerAction(controllerInfo.controller, controllerInfo.action, files.view);
	}
}

// Command Actions
const actions = {
	add: (urlPath, options) => {
		// Normalize path
		const parts = urlPath.split(/[\\/]/).filter(Boolean);
		const pascalPathParts = parts.map(
			(part) => part.charAt(0).toUpperCase() + part.slice(1),
		);
		const pascalPath = `/${pascalPathParts.join("/")}`;
		const name = pascalPathParts.join("/");

		// Check if exists
		const routes = readRoutes();
		if (routes.find((r) => r.path.toLowerCase() === pascalPath.toLowerCase())) {
			console.error(`[ERROR] Route already exists: ${pascalPath}`);
			process.exit(1);
		}

		const files = resolvePaths(name, options.flat);

		// Handle Custom Controller
		let controllerInfo = null;
		if (options.controller) {
			if (!options.action) {
				console.error("[ERROR] If --controller is specified, --action must also be specified.");
				process.exit(1);
			}
			controllerInfo = {
				controller: options.controller, // Will be normalized in ensureControllerAction, but stored as is or normalized? 
				// Better store strict input, but we might want to store the "Real" class name.
				// Let's rely on ensureControllerAction returning the safe name.
				action: options.action
			};
		}

		// Create Entry
		const newRoute = {
			path: pascalPath,
			name: name,
			files: files,
			isPublic: options.public || false,
			// Add Controller/Action if present
			...(controllerInfo && { controller: controllerInfo.controller, action: controllerInfo.action }),
			// Add SEO stub
			seo: {
				title: name,
				description: `Page for ${name}`
			}
		};

		// If we are about to inject controller, let's do it first to ensure it adheres to rules
		if (controllerInfo) {
			const finalControllerName = ensureControllerAction(controllerInfo.controller, controllerInfo.action, files.view);
			newRoute.controller = finalControllerName; // Store the official class name
		}

		routes.push(newRoute);
		writeRoutes(routes);
		scaffoldRouteFiles(name, files, options, null); // We already handled controller injection above
	},

	update: (urlPath, options) => {
		// Existing update logic...
		const lowerPath = urlPath.toLowerCase();
		const routes = readRoutes();
		const route = routes.find(
			(r) =>
				r.path.toLowerCase() === lowerPath ||
				r.path.toLowerCase() === "/" + lowerPath.replace(/^\//, ""),
		);

		if (!route) {
			console.error(`[ERROR] Route not found: ${urlPath}`);
			process.exit(1);
		}

		let updated = false;

		if (options.public !== undefined) {
			const isPublic = options.public === "true" || options.public === true;
			if (route.isPublic !== isPublic) {
				route.isPublic = isPublic;
				console.log(`[UPDATE] Set isPublic to ${isPublic}`);
				updated = true;
			}
		}

		if (updated) {
			writeRoutes(routes);
		} else {
			console.log("[INFO] No changes made.");
		}
	},

	remove: async (urlPath) => {
		const lowerPath = urlPath.toLowerCase();
		const routes = readRoutes();
		const routeIndex = routes.findIndex(
			(r) =>
				r.path.toLowerCase() === lowerPath ||
				r.path.toLowerCase() === "/" + lowerPath.replace(/^\//, ""),
		);

		if (routeIndex === -1) {
			console.error(`[ERROR] Route not found in routes.json: ${urlPath}`);
			process.exit(1);
		}

		const routeToRemove = routes[routeIndex];

		// Ask about controller deletion if it exists
		if (routeToRemove.controller) {
			const answer = await confirm({ message: `Route uses custom controller '${routeToRemove.controller}'. Delete this controller file? (y/N)`, default: false });
			if (answer) {
				const controllerPath = path.join(CONTROLLERS_DIR, `${routeToRemove.controller}.cs`);
				if (fs.existsSync(controllerPath)) {
					fs.unlinkSync(controllerPath);
					console.log(`[DELETED] Controller: ${routeToRemove.controller}.cs`);
				} else {
					console.warn(`[WARN] Controller file not found: ${controllerPath}`);
				}
			} else {
				console.log(`[INFO] Custom controller override preserved.`);
			}
		}

		routes.splice(routeIndex, 1);
		writeRoutes(routes);

		console.log(
			`[REMOVED] Route entry for ${routeToRemove.path} removed from routes.json`,
		);
		console.log(
			`[INFO] The following files are now orphaned (please delete manually if desired):`,
		);
		console.log(`  - Poyo.client/${routeToRemove.files.react}`);
		console.log(`  - Poyo.Server/${routeToRemove.files.view}`);
	},

	sync: async () => {
		// Sync logic remains mostly same but respects custom controllers?
		// Actually sync should just check file existence.
		// It should NOT try to re-scaffold View if a custom controller is used and View is missing, UNLESS we know for sure.
		// But for now, let's keep it simple: It checks for 'files.react' and 'files.view'.
		// If View is missing for a custom controller route, it flags it. This is probably correct because even custom controllers usually need a view.

		console.log("Checking route consistency...");
		const routes = readRoutes();
		const missingRoutes = [];

		routes.forEach((route) => {
			const reactFullPath = path.join(CLIENT_DIR, route.files.react);
			const serverFullPath = path.join(SERVER_DIR, route.files.view);
			const missingFiles = [];

			if (!fs.existsSync(reactFullPath)) missingFiles.push("React Page");
			if (!fs.existsSync(serverFullPath)) missingFiles.push("MVC View");

			if (missingFiles.length > 0) {
				missingRoutes.push({ route, missingFiles });
			}
		});

		if (missingRoutes.length === 0) {
			console.log(`[OK] All ${routes.length} routes indicate valid files.`);
			return;
		}

		console.log(
			`[WARN] Found ${missingRoutes.length} routes with missing files:`,
		);
		missingRoutes.forEach((item) => {
			console.log(
				`  - ${item.route.path} (Missing: ${item.missingFiles.join(", ")})`,
			);
		});

		console.log("");
		const answer = await select({
			message: "How should we resolve these discrepancies?",
			choices: [
				{
					name: "Rescaffold: Re-create missing files for all broken routes",
					value: "rescaffold",
				},
				{
					name: "Prune: Remove these routes from routes.json",
					value: "prune",
				},
				{
					name: "Ignore: Do nothing for now",
					value: "ignore",
				},
			],
		});

		if (answer === "rescaffold") {
			console.log("\nRe-scaffolding files...");
			missingRoutes.forEach((item) => {
				// Pass default options for rescaffold
				scaffoldRouteFiles(item.route.name, item.route.files, { noView: false, flat: false }, item.route.controller ? { controller: item.route.controller, action: item.route.action } : null);
			});
			console.log("[DONE] All files restored.");
		} else if (answer === "prune") {
			console.log("\nPruning routes from JSON...");
			const pathsToRemove = new Set(missingRoutes.map((m) => m.route.path));
			const newRoutes = routes.filter((r) => !pathsToRemove.has(r.path));
			writeRoutes(newRoutes);
			console.log(
				`[DONE] Removed ${missingRoutes.length} routes from routes.json.`,
			);
		} else {
			console.log("[INFO] No changes made.");
		}
	},
};

// CLI Setup
const program = new Command();

program
	.name("route-manager")
	.description("CLI to manage routes.json and scaffold files")
	.version("1.0.0");

program
	.command("add")
	.description("Add a new route and scaffold files")
	.argument("<path>", "URL path for the route (e.g. /Admin/Users)")
	.option("-p, --public", "Mark route as public (accessible without auth)")
	.option("-f, --flat", "Use flat file structure (e.g. detail.page.tsx) instead of folder (Detail/index.page.tsx)")
	.option("-c, --controller <name>", "Specify custom controller class name")
	.option("-a, --action <name>", "Specify action method name")
	.option("--no-view", "Skip MVC View generation")
	.action(actions.add);

program
	.command("update")
	.description("Update existing route properties")
	.argument("<path>", "URL path of the route to update")
	.option("-p, --public <boolean>", "Set public status (true/false)")
	.action(actions.update);

program
	.command("remove")
	.description("Remove a route from routes.json")
	.argument("<path>", "URL path of the route to remove")
	.action(actions.remove);

program
	.command("sync")
	.description("Verify consistency between routes.json and file system")
	.action(actions.sync);

program.parse();

