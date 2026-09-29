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
	field: string,
	value: unknown,
): void {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new CliError(`${label}: "${field}" must be a non-empty string`);
	}
}

/**
 * A file field is not part of a route's identity, and the server never checks
 * one: a blank view path boots and fails when the route is requested. This is
 * the route manager's own earlier guard, so it stays as it was rather than
 * borrowing the identity rule's notion of blank.
 */
function expectFileString(label: string, field: string, value: unknown): void {
	if (typeof value !== "string" || value.length === 0) {
		throw new CliError(`${label}: "files.${field}" must be a non-empty string`);
	}
}

/**
 * Names a route in a failure message by whichever half of its identity is
 * still readable, so a message is useful even when the other half is what is
 * wrong — a mis-cased `path`, a blank `name`. The server's `RouteIdentity`
 * describes a route the same way, and the registry corpus asserts that both
 * name the route a case is about.
 */
function routeLabel(index: number, entry: Record<string, unknown>): string {
	const path = typeof entry.path === "string" ? entry.path.trim() : "";
	if (path.length > 0) {
		return `routes[${index}] ("${entry.path}")`;
	}

	const name = typeof entry.name === "string" ? entry.name.trim() : "";

	return name.length > 0
		? `routes[${index}] (name "${entry.name}")`
		: `routes[${index}]`;
}

/**
 * A route's identity is one thing, defined once: the registry is authored, so
 * it is held to a canonical form, and the server enforces the same rules at
 * boot. This module is the route manager's half of that contract — it exists
 * so an invalid registry is rejected when it is authored rather than when it
 * is deployed, not so the two runtimes can disagree.
 *
 * Both runtimes read the same corpus of registries at `fixtures/registry/`
 * and are held to the same verdicts, so "both refuse the same registries" is
 * enforced rather than asserted: a rule added here and not to the server, or
 * the other way round, turns that corpus red. Each side still picks the
 * offending route in its own pass order, so the wording here mirrors the
 * server's rather than repeating it, and the corpus pins the fragments the
 * two messages must share.
 */
export function validateRoutes(routes: unknown): asserts routes is Route[] {
	if (!Array.isArray(routes)) {
		throw new CliError("routes.json must contain an array of route objects");
	}

	routes.forEach((route, index) => validateRouteIdentity(route, index));
	assertUniqueIdentities(routes);
}

function validateRouteIdentity(route: unknown, index: number): void {
	if (typeof route !== "object" || route === null) {
		throw new CliError(`routes[${index}] must be an object`);
	}

	const entry = route as Record<string, unknown>;
	const label = routeLabel(index, entry);
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
		routePath.trim().length === 0 ||
		!routePath.startsWith("/")
	) {
		throw new CliError(
			`${label}: "path" must begin with "/" — declare "${canonicalPath(routePath)}" instead`,
		);
	}

	if (routePath.length > 1 && routePath.endsWith("/")) {
		throw new CliError(
			`${label}: "path" declares a trailing slash — declare ` +
				`"${canonicalPath(routePath)}" instead (a declared path is the URL the client links ` +
				"to and the server matches, so it is stored exactly as written)",
		);
	}

	if (typeof entry.name === "string" && entry.name.trim().length > 0) {
		if (entry.name.startsWith("/") || entry.name.endsWith("/")) {
			throw new CliError(
				`${label}: declares the name "${entry.name}". A name must not begin ` +
					`or end with "/": it is an identifier, not a path.`,
			);
		}
	} else {
		throw new CliError(
			`${label}: "name" is missing or blank. A route's name is its identity on ` +
				"the server and in the client's route table.",
		);
	}

	const files = entry.files;
	if (typeof files !== "object" || files === null || Array.isArray(files)) {
		throw new CliError(
			`${label}: "files" must be an object with "react" and "view" paths`,
		);
	}
	const fileEntries = files as Record<string, unknown>;
	for (const key of Object.keys(fileEntries)) {
		if (!KNOWN_FILE_FIELDS.has(key)) {
			throw new CliError(`${label}: unknown field "files.${key}"`);
		}
	}
	expectFileString(label, "react", fileEntries.react);
	expectFileString(label, "view", fileEntries.view);

	// `access` is optional and defaults to protected, which is the server's own
	// default for an absent field. Refusing an absent one would make this side
	// reject a registry the server serves.
	if (entry.access !== undefined && !isRouteAccess(entry.access)) {
		throw new CliError(
			`${label}: "access" must be one of: public, guest, protected`,
		);
	}

	// JSON null means undeclared, the same reading the server's deserializer
	// gives it: `route.Controller is not null` is false for a null field.
	const hasController = entry.controller != null;
	const hasAction = entry.action != null;
	if (hasController && !hasAction) {
		throw new CliError(
			`${label}: "controller" is specified without "action" — declare ` +
				"both or neither: a route names the action that serves it",
		);
	}
	if (hasAction && !hasController) {
		throw new CliError(
			`${label}: "action" is specified without "controller" — declare ` +
				"both or neither: a route names the action that serves it",
		);
	}
	if (hasController) {
		expectNonEmptyString(label, "controller", entry.controller);
	}
	if (hasAction) {
		expectNonEmptyString(label, "action", entry.action);
	}

	// JSON null means undeclared here too, by the reading ADR 0015 pinned for
	// `controller`: the server's `SeoModel?` is null for it, and an authored
	// null declares "no SEO" rather than one nothing can act on.
	if (entry.seo != null && (typeof entry.seo !== "object" || Array.isArray(entry.seo))) {
		throw new CliError(`${label}: "seo" must be an object`);
	}

	if (entry.dynamic !== undefined && typeof entry.dynamic !== "boolean") {
		throw new CliError(`${label}: "dynamic" must be a boolean`);
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
 * The canonical form of a declared path: stored exactly as the client links to
 * it and the server matches it, so the form of one that ends in a slash is that
 * path without it. A value that is not a rooted string is rooted first, which is
 * what makes the message for an unrooted path name the form to declare instead.
 */
function canonicalPath(routePath: unknown): string {
	const declared = typeof routePath === "string" ? routePath.trim() : "";
	const rooted = declared === "" ? "" : `/${declared.replace(/^\/+/, "")}`;

	return rooted.replace(/\/+$/, "") || "/";
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
