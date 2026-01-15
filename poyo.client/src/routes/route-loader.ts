import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import routeManifestData from "../../../routes.json" with { type: "json" };

// Define strict type for the route manifest
interface RouteEntry {
	path: string;
	name: string;
	files: {
		react: string;
		view: string;
	};
	isPublic: boolean;
}

const routeManifest = routeManifestData as RouteEntry[];

// 1. Dynamic Import of all Page components using Vite's glob feature
// We still need this to get the actual component loaders
// biome-ignore lint/suspicious/noExplicitAny: The props of the component are unknown
const pages = import.meta.glob<{ default: ComponentType<any> }>(
	"../pages/**/*.page.tsx",
);

// 2. Build the Route Map dynamically based on routes.json (Source of Truth)
export const routeMap: Record<
	string,
	// biome-ignore lint/suspicious/noExplicitAny: The props of the component are unknown
	LazyExoticComponent<ComponentType<any>>
> = {};

export interface AppRoute {
	path: string;
	// biome-ignore lint/suspicious/noExplicitAny: The props of the component are unknown
	component: LazyExoticComponent<ComponentType<any>>;
	pageName: string;
}

export const routes: AppRoute[] = [];

// Helper to normalized path for glob lookup
// routes.json: "src/pages/Dashboard/index.page.tsx"
// glob key: "../pages/Dashboard/index.page.tsx"
function getGlobKey(reactPath: string) {
	// Remove "src/pages/" and prepend "../pages/"
	return reactPath.replace("src/pages/", "../pages/");
}

routeManifest.forEach((route) => {
	const globKey = getGlobKey(route.files.react);
	const componentLoader = pages[globKey];

	if (componentLoader) {
		const Component = lazy(componentLoader);
		routeMap[route.name] = Component;

		routes.push({
			path: route.path,
			component: Component,
			pageName: route.name,
		});
	} else {
		console.warn(
			`[RouteLoader] Warning: Route defined in routes.json but file not found: ${route.files.react}`,
		);
	}
});

// Logging specifically for Ghost Routes (Files that exist but are not in routes.json)
if (import.meta.env.DEV) {
	const manifestFiles = new Set(
		routeManifest.map((r) => getGlobKey(r.files.react)),
	);
	for (const globKey in pages) {
		if (!manifestFiles.has(globKey)) {
			console.warn(
				`[RouteLoader] Ghost Route detected: ${globKey} exists but is not in routes.json. It will be ignored.`,
			);
		}
	}
}

/**
 * Find route by Server Page Name (O(1))
 * Usage: matches <div data-page-name="Dashboard">
 */
export function findRouteByName(name: string) {
	// Try exact match
	if (routeMap[name]) return routeMap[name];

	// Try case-insensitive lookup if needed (robustness)
	const lowerName = name.toLowerCase();
	const key = Object.keys(routeMap).find((k) => k.toLowerCase() === lowerName);
	return key ? routeMap[key] : undefined;
}

/**
 * Find route by URL (Backup/Dev Mode)
 * Usage: matches window.location.pathname
 */
export function findRouteGeneric(pathname: string) {
	const normalizedPath = pathname.replace(/\/+$/, "") || "/";
	const lowerPath = normalizedPath.toLowerCase();

	return routes.find((r) => {
		const rPath = r.path.toLowerCase();
		return rPath === lowerPath || (rPath === "/home" && lowerPath === "/");
	});
}
