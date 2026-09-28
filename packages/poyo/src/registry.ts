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
	"dynamic",
]);

const KNOWN_FILE_FIELDS = new Set(["react", "view"]);

/**
 * A declared value is one the registry names, whether or not it says
 * something: `"controller": ""` is a declaration the server cannot act on, so
 * it fails here too rather than reading as "not declared". Blank means blank,
 * not merely empty — the server's rule, kept so the two never disagree about
 * which registries exist.
 */
function expectNonEmptyString(
	label: string,
	pathLabel: string,
	field: string,
	value: unknown,
): void {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new CliError(
			`${label} ("${pathLabel}"): "${field}" must be a non-empty string`,
		);
	}
}

/**
 * A route's identity is one thing, defined once: the registry is authored, so
 * it is held to a canonical form, and the server enforces the same rules at
 * boot. This module is the route manager's half of that contract — it exists
 * so an invalid registry is rejected when it is authored rather than when it
 * is deployed, not so the two runtimes can disagree. Both refuse the same
 * registries; each picks the offending route in its own pass order, so the
 * wording here deliberately mirrors the server's rather than repeating it.
 */
export function validateRoutes(routes: unknown): asserts routes is Route[] {
	if (!Array.isArray(routes)) {
		throw new CliError("routes.json must contain an array of route objects");
	}

	routes.forEach((route, index) => validateRouteIdentity(route, index));
	assertUniqueIdentities(routes);
}

function validateRouteIdentity(route: unknown, index: number): void {
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

	if (routePath.length > 1 && routePath.endsWith("/")) {
		throw new CliError(
			`${label} ("${routePath}"): "path" declares a trailing slash — declare ` +
				`"${canonicalPath(routePath)}" instead (a declared path is the URL the client links ` +
				"to and the server matches, so it is stored exactly as written)",
		);
	}

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
	if (hasController && !hasAction) {
		throw new CliError(
			`${label} ("${routePath}"): "controller" is specified without "action" — declare ` +
				"both or neither: a route names the action that serves it",
		);
	}
	if (hasAction && !hasController) {
		throw new CliError(
			`${label} ("${routePath}"): "action" is specified without "controller" — declare ` +
				"both or neither: a route names the action that serves it",
		);
	}
	if (hasController) {
		expectNonEmptyString(label, routePath, "controller", entry.controller);
	}
	if (hasAction) {
		expectNonEmptyString(label, routePath, "action", entry.action);
	}

	if (
		entry.seo !== undefined &&
		(typeof entry.seo !== "object" || entry.seo === null)
	) {
		throw new CliError(`${label} ("${routePath}"): "seo" must be an object`);
	}

	if (entry.dynamic !== undefined && typeof entry.dynamic !== "boolean") {
		throw new CliError(
			`${label} ("${routePath}"): "dynamic" must be a boolean`,
		);
	}
}

/**
 * Asserts that a path and a name each claim exactly one route, ignoring case.
 * The name is how the client binds a navigation and an initial page, so two
 * routes claiming one would resolve to different pages depending on the case
 * of the string used to ask for it. Case is the only difference a key needs
 * to absorb: a trailing slash is refused above, so a canonical path is exactly
 * its own lower-cased form.
 */
function assertUniqueIdentities(routes: Route[]): void {
	const seenPaths = new Map<string, number>();
	const seenNames = new Map<string, number>();

	routes.forEach((route, index) => {
		const lowerPath = route.path.toLowerCase();
		const pathOwner = seenPaths.get(lowerPath);
		if (pathOwner !== undefined) {
			throw new CliError(
				`Duplicate route path: ${route.path} (case-insensitive match with ` +
					`routes[${pathOwner}] "${routes[pathOwner].path}")`,
			);
		}
		seenPaths.set(lowerPath, index);

		const lowerName = route.name.toLowerCase();
		const nameOwner = seenNames.get(lowerName);
		if (nameOwner !== undefined) {
			throw new CliError(
				`Duplicate route name: ${route.name} on "${route.path}" (case-insensitive ` +
					`match with routes[${nameOwner}] "${routes[nameOwner].path}")`,
			);
		}
		seenNames.set(lowerName, index);
	});
}

/**
 * A declared path is stored exactly as the client links to it and the server
 * matches it, so the canonical form of one that ends in a slash is that path
 * without it. Reached only after the path is known to be rooted and non-empty,
 * so trimming the trailing run is the whole job.
 */
function canonicalPath(routePath: string): string {
	return routePath.replace(/\/+$/, "") || "/";
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
