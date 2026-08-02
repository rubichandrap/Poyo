import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkbox, confirm, select } from "@inquirer/prompts";
import { Command } from "commander";

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ROOT_DIR = path.resolve(__dirname, "..");
const CLIENT_DIR = path.join(ROOT_DIR, "poyo.client");
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

const TEMPLATE_CONTROLLER = (
	name,
	action,
	viewPath,
) => `using Microsoft.AspNetCore.Mvc;

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
		const parts = name.split("/");
		const leaf = parts.pop();
		const parent = parts.join("/");
		const basePath = parent ? `${parent}/` : "";

		return {
			react: `src/pages/${basePath}${leaf.toLowerCase()}.page.tsx`,
			view: `Views/${basePath}${leaf}.cshtml`,
		};
	}
	return {
		react: `src/pages/${name}/index.page.tsx`,
		view: `Views/${name}/Index.cshtml`,
	};
}

// Helper: Find Files Recursively
function findFiles(dir, predicate, fileList = [], rootDir = dir) {
	if (!fs.existsSync(dir)) return fileList;
	const files = fs.readdirSync(dir);
	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			findFiles(filePath, predicate, fileList, rootDir);
		} else if (predicate(filePath)) {
			fileList.push(path.relative(rootDir, filePath).replaceAll("\\", "/"));
		}
	}
	return fileList;
}

// Helper: Try Delete Empty Directories
function deleteEmptyParents(filePath, rootDir) {
	let dir = path.dirname(filePath);
	while (dir !== rootDir && path.relative(rootDir, dir).length > 0) {
		if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
			fs.rmdirSync(dir);
			console.log(
				`[CLEANUP] Removed empty directory: ${path.relative(ROOT_DIR, dir)}`,
			);
			dir = path.dirname(dir);
		} else {
			break;
		}
	}
}

// Helper: Ensure Controller and Action
function ensureControllerAction(controllerName, actionName, viewPath) {
	let safeControllerName = controllerName;
	if (!safeControllerName.endsWith("Controller")) {
		safeControllerName += "Controller";
	}

	const controllerPath = path.join(CONTROLLERS_DIR, `${safeControllerName}.cs`);

	if (!fs.existsSync(controllerPath)) {
		// Create new controller
		fs.writeFileSync(
			controllerPath,
			TEMPLATE_CONTROLLER(safeControllerName, actionName, viewPath),
		);
		console.log(`[CREATED] Controller: ${safeControllerName}.cs`);
	} else {
		// Inject action
		const content = fs.readFileSync(controllerPath, "utf-8");
		const actionRegex = new RegExp(
			`public\\s+(async\\s+Task<)?IActionResult(>)?\\s+${actionName}\\s*\\(`,
			"i",
		);
		if (actionRegex.test(content)) {
			console.error(
				`[ERROR] Action '${actionName}' already exists in ${safeControllerName}.cs`,
			);
			process.exit(1);
		}

		const lastBraceIndex = content.lastIndexOf("}");
		if (lastBraceIndex === -1) {
			console.error(
				`[ERROR] Could not parse class structure in ${safeControllerName}.cs`,
			);
			process.exit(1);
		}

		const newContent =
			content.slice(0, lastBraceIndex) +
			TEMPLATE_ACTION(actionName, viewPath) +
			content.slice(lastBraceIndex);
		fs.writeFileSync(controllerPath, newContent);
		console.log(
			`[UPDATED] Controller: ${safeControllerName}.cs (Injected action '${actionName}')`,
		);
	}

	return safeControllerName;
}

// Helper: Scaffold Files
function scaffoldRouteFiles(name, files, options, controllerInfo) {
	const pageFullPath = path.join(CLIENT_DIR, files.react);
	const viewFullPath = path.join(SERVER_DIR, files.view);

	// 1. React Page
	if (!fs.existsSync(pageFullPath)) {
		fs.mkdirSync(path.dirname(pageFullPath), { recursive: true });
		fs.writeFileSync(pageFullPath, TEMPLATE_PAGE(name));
		console.log(`[CREATED] React Page: ${files.react}`);
	} else {
		console.log(`[EXISTS] React Page: ${files.react}`);
	}

	// 2. MVC View
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
		ensureControllerAction(
			controllerInfo.controller,
			controllerInfo.action,
			files.view,
		);
	}
}

// Command Actions
const actions = {
	add: (urlPath, options) => {
		const parts = urlPath.split(/[\\/]/).filter(Boolean);
		const pascalPathParts = parts.map(
			(part) => part.charAt(0).toUpperCase() + part.slice(1),
		);
		const pascalPath = `/${pascalPathParts.join("/")}`;
		const name = pascalPathParts.join("/");

		const routes = readRoutes();
		if (routes.find((r) => r.path.toLowerCase() === pascalPath.toLowerCase())) {
			console.error(`[ERROR] Route already exists: ${pascalPath}`);
			process.exit(1);
		}

		const files = resolvePaths(name, options.flat);

		let controllerInfo = null;
		if (options.controller) {
			if (!options.action) {
				console.error(
					"[ERROR] If --controller is specified, --action must also be specified.",
				);
				process.exit(1);
			}
			controllerInfo = {
				controller: options.controller,
				action: options.action,
			};
		}

		const newRoute = {
			path: pascalPath,
			name: name,
			files: files,
			isPublic: options.public || false,
			isGuestOnly: options.guest || false,
			...(controllerInfo && {
				controller: controllerInfo.controller,
				action: controllerInfo.action,
			}),
			seo: {
				title: name,
				description: `Page for ${name}`,
			},
		};

		if (controllerInfo) {
			const finalControllerName = ensureControllerAction(
				controllerInfo.controller,
				controllerInfo.action,
				files.view,
			);
			newRoute.controller = finalControllerName;
		}

		routes.push(newRoute);
		writeRoutes(routes);
		scaffoldRouteFiles(name, files, options, null);
	},

	update: (urlPath, options) => {
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

		if (options.guest !== undefined) {
			const isGuestOnly = options.guest === "true" || options.guest === true;
			if (route.isGuestOnly !== isGuestOnly) {
				route.isGuestOnly = isGuestOnly;
				console.log(`[UPDATE] Set isGuestOnly to ${isGuestOnly}`);
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

		// Remove from routes.json logic
		const controller = routeToRemove.controller;
		let deleteController = false;

		if (controller) {
			deleteController = await confirm({
				message: `Route uses custom controller '${controller}'. Delete this controller file? (y/N)`,
				default: false,
			});
		}

		// NEW: Ask to remove related files
		const deleteFiles = await confirm({
			message: `Do you want to DELETE the physical files and folders related to this route? (y/N)`,
			default: false,
		});

		// Perform deletion
		// 1. Controller
		if (deleteController) {
			const controllerPath = path.join(CONTROLLERS_DIR, `${controller}.cs`);
			if (fs.existsSync(controllerPath)) {
				fs.unlinkSync(controllerPath);
				console.log(`[DELETED] Controller: ${controller}.cs`);
			}
		}

		// 2. React & View Files
		if (deleteFiles) {
			const reactPath = path.join(CLIENT_DIR, routeToRemove.files.react);
			const viewPath = path.join(SERVER_DIR, routeToRemove.files.view);

			if (fs.existsSync(reactPath)) {
				fs.unlinkSync(reactPath);
				console.log(`[DELETED] React Page: ${routeToRemove.files.react}`);
				deleteEmptyParents(reactPath, CLIENT_DIR);
			}
			if (fs.existsSync(viewPath)) {
				fs.unlinkSync(viewPath);
				console.log(`[DELETED] MVC View: ${routeToRemove.files.view}`);
				deleteEmptyParents(viewPath, SERVER_DIR);
			}
		}

		routes.splice(routeIndex, 1);
		writeRoutes(routes);

		console.log(
			`[REMOVED] Route '${routeToRemove.path}' removed from routes.json`,
		);

		if (!deleteFiles) {
			console.log(`[INFO] Orphaned files (not deleted):`);
			console.log(`  - poyo.client/${routeToRemove.files.react}`);
			console.log(`  - Poyo.Server/${routeToRemove.files.view}`);
		}
	},

	sync: async () => {
		console.log("Checking route consistency...");
		const routes = readRoutes();

		// 1. Forward Sync: Check for missing files
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

		// 2. Reverse Sync: Check for untracked files
		// Scan for React pages (*.page.tsx)
		const reactPages = findFiles(
			path.join(CLIENT_DIR, "src", "pages"),
			(file) => file.endsWith(".page.tsx"),
			[],
			path.join(CLIENT_DIR),
		);
		// Scan for Views (*.cshtml) - exclude Shared, _ViewStart, etc.
		const viewPages = findFiles(
			path.join(SERVER_DIR, "Views"),
			(file) => {
				const name = path.basename(file);
				return (
					file.endsWith(".cshtml") &&
					!file.includes("Shared") &&
					!name.startsWith("_")
				);
			},
			[],
			path.join(SERVER_DIR),
		);

		// Normalize existing route paths for comparison
		const trackedReactFiles = new Set(
			routes.map((r) => r.files.react.replaceAll("\\", "/")),
		);
		const trackedViewFiles = new Set(
			routes.map((r) => r.files.view.replaceAll("\\", "/")),
		);

		const untrackedReact = reactPages.filter((f) => !trackedReactFiles.has(f));
		// Only consider the view untracked if it's not associated with any route
		const untrackedViews = viewPages.filter((f) => !trackedViewFiles.has(f));

		const hasIssues =
			missingRoutes.length > 0 ||
			untrackedReact.length > 0 ||
			untrackedViews.length > 0;

		if (!hasIssues) {
			console.log(
				`[OK] All ${routes.length} routes indicate valid files, and no untracked files found.`,
			);
			return;
		}

		console.log(`[WARN] Discrepancies found:`);
		if (missingRoutes.length > 0) {
			console.log(`  - ${missingRoutes.length} routes have missing files.`);
		}
		if (untrackedReact.length > 0) {
			console.log(`  - ${untrackedReact.length} untracked React pages found.`);
		}
		if (untrackedViews.length > 0) {
			console.log(`  - ${untrackedViews.length} untracked MVC views found.`);
		}

		console.log("");
		const answer = await select({
			message: "How should we resolve these discrepancies?",
			choices: [
				...(missingRoutes.length > 0
					? [
							{
								name: "Rescaffold: Re-create missing files for broken routes",
								value: "rescaffold",
							},
							{
								name: "Prune: Remove broken routes from routes.json",
								value: "prune",
							},
						]
					: []),
				...(untrackedReact.length > 0 || untrackedViews.length > 0
					? [
							{
								name: "Add: Add untracked files to routes.json",
								value: "add_untracked",
							},
							{
								name: "Delete: Delete untracked files from disk",
								value: "delete_untracked",
							},
						]
					: []),
				{ name: "Ignore: Do nothing for now", value: "ignore" },
			],
		});

		if (answer === "rescaffold") {
			console.log("\nRe-scaffolding files...");
			missingRoutes.forEach((item) => {
				scaffoldRouteFiles(
					item.route.name,
					item.route.files,
					{ noView: false, flat: false },
					item.route.controller
						? { controller: item.route.controller, action: item.route.action }
						: null,
				);
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
		} else if (answer === "add_untracked") {
			// Logic to add untracked files
			console.log("\nAnalyzing untracked files...");

			const newRoutesToAdd = [];

			for (const reactFile of untrackedReact) {
				// Infer path from file: src/pages/About/index.page.tsx -> /About
				// src/pages/contact.page.tsx -> /Contact

				const relativePath = reactFile.replace(/^src\/pages\//, "");
				let routeName = "";
				let routePath = "";

				if (relativePath.endsWith("/index.page.tsx")) {
					routeName = relativePath.replace(/\/index\.page\.tsx$/, "");
				} else {
					routeName = relativePath.replace(/\.page\.tsx$/, "");
				}

				// Convert routeName to PascalCase path
				const parts = routeName.split(/[\\/]/);
				const pascalParts = parts.map(
					(p) => p.charAt(0).toUpperCase() + p.slice(1),
				);
				routeName = pascalParts.join("/");
				routePath = "/" + routeName;

				// Check if we have a matching view (simplistic check)
				// Start with standard folder view
				const viewCandidate = `Views/${routeName}/Index.cshtml`;
				// OR flat view
				const viewCandidateFlat = `Views/${routeName}.cshtml`;

				let finalView = viewCandidate;
				// See if any untracked view matches
				if (untrackedViews.includes(viewCandidate)) {
					finalView = viewCandidate;
				} else if (untrackedViews.includes(viewCandidateFlat)) {
					finalView = viewCandidateFlat;
				}

				newRoutesToAdd.push({
					path: routePath,
					name: routeName,
					files: {
						react: reactFile,
						view: finalView,
					},
					isPublic: false,
					seo: { title: routeName, description: `Page for ${routeName}` },
				});
			}

			if (newRoutesToAdd.length === 0 && untrackedViews.length > 0) {
				console.log(
					"[INFO] Found untracked Views but no corresponding React pages. Skipping automatic addition for these (manual intervention needed).",
				);
				untrackedViews.forEach((v) => console.log(`  - ${v}`));
			} else if (newRoutesToAdd.length > 0) {
				console.log(
					`Probe found ${newRoutesToAdd.length} potential new routes.`,
				);
				const confirmedRoutes = await checkbox({
					message: "Select routes to add:",
					choices: newRoutesToAdd.map((r) => ({
						name: `${r.path} (${r.files.react})`,
						value: r,
						checked: true,
					})),
				});

				if (confirmedRoutes.length > 0) {
					confirmedRoutes.forEach((r) => routes.push(r));
					writeRoutes(routes);
					// Also ensure files exist (scaffold view if missing?)
					console.log("Ensuring views exist for new routes...");
					confirmedRoutes.forEach((r) => {
						const viewPath = path.join(SERVER_DIR, r.files.view);
						if (!fs.existsSync(viewPath)) {
							console.log(
								`[Creating] Missing View for ${r.name}: ${r.files.view}`,
							);
							fs.mkdirSync(path.dirname(viewPath), { recursive: true });
							fs.writeFileSync(viewPath, TEMPLATE_VIEW(r.name));
						}
					});
				}
			}
		} else if (answer === "delete_untracked") {
			const filesToDelete = [...untrackedReact, ...untrackedViews].map((f) => {
				return f.startsWith("src")
					? path.join(CLIENT_DIR, f)
					: path.join(SERVER_DIR, f);
			});

			const confirmedFiles = await checkbox({
				message: "Select files to PERMANENTLY DELETE:",
				choices: filesToDelete.map((f) => ({
					name: path.relative(ROOT_DIR, f),
					value: f,
					checked: true,
				})),
			});

			if (confirmedFiles.length > 0) {
				confirmedFiles.forEach((f) => {
					if (fs.existsSync(f)) {
						fs.unlinkSync(f);
						console.log(`[DELETED] ${path.relative(ROOT_DIR, f)}`);
						// Determine root dir based on client/server
						const fileRoot = f.includes("poyo.client")
							? CLIENT_DIR
							: SERVER_DIR;
						deleteEmptyParents(f, fileRoot);
					}
				});
			}
		} else {
			console.log("[INFO] No changes made.");
		}
	},
};

// CLI Setup
const program = new Command();

const packageJson = JSON.parse(
	fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"),
);

program
	.name("route-manager")
	.description("CLI to manage routes.json and scaffold files")
	.version(packageJson.version);

program
	.command("add")
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
	.action(actions.add);

program
	.command("update")
	.description("Update existing route properties")
	.argument("<path>", "URL path of the route to update")
	.option("-p, --public <boolean>", "Set public status (true/false)")
	.option("-g, --guest <boolean>", "Set guest only status (true/false)")
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
