import fs from "node:fs";
import type { ProjectPaths } from "./config.js";
import type { Route } from "./routes.js";

export function readRoutes(paths: ProjectPaths): Route[] {
	if (!fs.existsSync(paths.routesJsonPath)) return [];
	try {
		return JSON.parse(
			fs.readFileSync(paths.routesJsonPath, "utf-8"),
		) as Route[];
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Error reading routes.json: ${message}`);
	}
}

export function writeRoutes(paths: ProjectPaths, routes: Route[]): void {
	routes.sort((a, b) => a.path.localeCompare(b.path));
	fs.writeFileSync(
		paths.routesJsonPath,
		`${JSON.stringify(routes, null, 2)}\n`,
	);
}

export function findRoute<T extends { path: string }>(
	routes: T[],
	rawPath: string,
): T | undefined {
	const lower = rawPath.toLowerCase();
	return routes.find(
		(r) =>
			r.path.toLowerCase() === lower ||
			r.path.toLowerCase() === `/${lower.replace(/^\//, "")}`,
	);
}
