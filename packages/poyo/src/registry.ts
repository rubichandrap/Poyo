import fs from "node:fs";
import type { ProjectPaths } from "./config.js";
import { CliError } from "./error.js";
import { isRouteAccess, type Route } from "./routes.js";

const KNOWN_FIELDS = new Set([
	"path",
	"name",
	"files",
	"access",
	"controller",
	"action",
	"seo",
]);

const KNOWN_FILE_FIELDS = new Set(["react", "view"]);

function expectNonEmptyString(
	label: string,
	pathLabel: string,
	field: string,
	value: unknown,
): void {
	if (typeof value !== "string" || value.length === 0) {
		throw new CliError(
			`${label} ("${pathLabel}"): "${field}" must be a non-empty string`,
		);
	}
}

export function validateRoutes(routes: unknown): asserts routes is Route[] {
	if (!Array.isArray(routes)) {
		throw new CliError("routes.json must contain an array of route objects");
	}

	const seenPaths = new Map<string, number>();
	routes.forEach((route, index) => {
		const label = `routes[${index}]`;
		if (typeof route !== "object" || route === null) {
			throw new CliError(`${label} must be an object`);
		}

		const entry = route as Record<string, unknown>;
		for (const key of Object.keys(entry)) {
			if (!KNOWN_FIELDS.has(key)) {
				throw new CliError(
					`${label}: unknown field "${key}" (not a supported route field)`,
				);
			}
		}

		const routePath = entry.path;
		if (
			typeof routePath !== "string" ||
			routePath.length === 0 ||
			!routePath.startsWith("/")
		) {
			throw new CliError(
				`${label}: "path" must be a non-empty string starting with "/"`,
			);
		}

		const lowerPath = routePath.toLowerCase();
		const existing = seenPaths.get(lowerPath);
		if (existing !== undefined) {
			throw new CliError(
				`Duplicate route path: ${routePath} (case-insensitive match with routes[${existing}])`,
			);
		}
		seenPaths.set(lowerPath, index);

		expectNonEmptyString(label, routePath, "name", entry.name);
		if (
			typeof entry.name === "string" &&
			(entry.name.startsWith("/") || entry.name.endsWith("/"))
		) {
			throw new CliError(
				`${label} ("${routePath}"): "name" must not start or end with "/"`,
			);
		}

		const files = entry.files;
		if (typeof files !== "object" || files === null) {
			throw new CliError(
				`${label} ("${routePath}"): "files" must be an object with "react" and "view" paths`,
			);
		}
		const fileEntries = files as Record<string, unknown>;
		for (const key of Object.keys(fileEntries)) {
			if (!KNOWN_FILE_FIELDS.has(key)) {
				throw new CliError(
					`${label} ("${routePath}"): unknown field "files.${key}"`,
				);
			}
		}
		expectNonEmptyString(label, routePath, "files.react", fileEntries.react);
		expectNonEmptyString(label, routePath, "files.view", fileEntries.view);

		if (!isRouteAccess(entry.access)) {
			throw new CliError(
				`${label} ("${routePath}"): "access" must be one of: public, guest, protected`,
			);
		}

		const hasController = entry.controller !== undefined;
		const hasAction = entry.action !== undefined;
		if (hasController) {
			expectNonEmptyString(label, routePath, "controller", entry.controller);
		}
		if (hasAction) {
			expectNonEmptyString(label, routePath, "action", entry.action);
		}
		if (hasController !== hasAction) {
			throw new CliError(
				`${label} ("${routePath}"): "controller" and "action" must be specified together`,
			);
		}

		if (
			entry.seo !== undefined &&
			(typeof entry.seo !== "object" || entry.seo === null)
		) {
			throw new CliError(`${label} ("${routePath}"): "seo" must be an object`);
		}
	});
}

export function readRoutes(paths: ProjectPaths): Route[] {
	if (!fs.existsSync(paths.routesJsonPath)) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(paths.routesJsonPath, "utf-8"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliError(`Error reading routes.json: ${message}`);
	}
	validateRoutes(parsed);
	return parsed;
}

export function writeRoutes(paths: ProjectPaths, routes: Route[]): void {
	validateRoutes(routes);
	const sorted = [...routes].sort((a, b) => a.path.localeCompare(b.path));
	fs.writeFileSync(
		paths.routesJsonPath,
		`${JSON.stringify(sorted, null, 2)}\n`,
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
