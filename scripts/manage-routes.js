import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { select } from "@inquirer/prompts";
import { Command } from "commander";

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ROOT_DIR = path.resolve(__dirname, "..");
const CLIENT_DIR = path.join(ROOT_DIR, "Poyo.client");
const SERVER_DIR = path.join(ROOT_DIR, "Poyo.Server");
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

// Helper: Scaffold Files
function scaffoldRouteFiles(name, files) {
	const pageFullPath = path.join(CLIENT_DIR, files.react);
	const viewFullPath = path.join(SERVER_DIR, files.view);

	if (!fs.existsSync(pageFullPath)) {
		fs.mkdirSync(path.dirname(pageFullPath), { recursive: true });
		fs.writeFileSync(pageFullPath, TEMPLATE_PAGE(name));
		console.log(`[CREATED] React Page: ${files.react}`);
	} else {
		console.log(`[EXISTS] React Page: ${files.react}`);
	}

	if (!fs.existsSync(viewFullPath)) {
		fs.mkdirSync(path.dirname(viewFullPath), { recursive: true });
		fs.writeFileSync(viewFullPath, TEMPLATE_VIEW(name));
		console.log(`[CREATED] MVC View: ${files.view}`);
	} else {
		console.log(`[EXISTS] MVC View: ${files.view}`);
	}
}

// Command Actions
const actions = {
	add: (urlPath, options) => {
		// Normalize path: Ensure leading slash, PascalCase segments
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

		// Create Entry
		const newRoute = {
			path: pascalPath,
			name: name,
			files: files,
			isPublic: options.public || false,
		};

		routes.push(newRoute);
		writeRoutes(routes);
		scaffoldRouteFiles(name, files);
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

		// Update Public Status
		if (options.public !== undefined) {
			const isPublic = options.public === "true" || options.public === true;
			if (route.isPublic !== isPublic) {
				route.isPublic = isPublic;
				console.log(`[UPDATE] Set isPublic to ${isPublic}`);
				updated = true;
			}
		}

		// Future: Add more properties here (e.g. name, title)

		if (updated) {
			writeRoutes(routes);
		} else {
			console.log("[INFO] No changes made.");
		}
	},

	remove: (urlPath) => {
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
				scaffoldRouteFiles(item.route.name, item.route.files);
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

