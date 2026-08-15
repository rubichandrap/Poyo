import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type RouteAccess = "public" | "guest" | "protected";

/**
 * One entry of the routes registry (routes.json), mirroring its shape for
 * the route table and the typed manifest. The registry is validated by the
 * server's RoutePolicy at boot and by the `poyo` CLI on every read; the
 * runtime trusts the producer. The table binds name/path/access; the rest of
 * the shape rides along so the generated manifest stays faithful.
 */
export interface RouteEntry {
	path: string;
	name: string;
	files: {
		react: string;
		view: string;
	};
	access?: RouteAccess;
	controller?: string;
	action?: string;
	seo?: Record<string, unknown>;
}

/**
 * A page loader: the lazy import function produced by Vite's
 * `import.meta.glob`. Keys are registry-space paths ("src/pages/...") — the
 * generated project's adapter re-keys its glob result into that space.
 */
// biome-ignore lint/suspicious/noExplicitAny: page props are unknown and vary per page; any keeps lazy() and JSX permissive.
export type PageLoader = () => Promise<{ default: ComponentType<any> }>;

export type PageLoaders = Record<string, PageLoader>;

/**
 * A resolved route: canonical path, page name, access from the registry, and
 * a lazy-wrapped component. Lookups return `AppRoute`, never a bare
 * component, so app code never hardcodes path values or access levels.
 */
export interface AppRoute {
	path: string;
	// biome-ignore lint/suspicious/noExplicitAny: page props are unknown and vary per page; any keeps lazy() and JSX permissive.
	component: LazyExoticComponent<ComponentType<any>>;
	pageName: string;
	access: RouteAccess;
}

export interface RouteTableOptions {
	/**
	 * The app base path — a path ("/", "/Poyo") or a full URL
	 * ("https://host/Poyo"). Injected from the server (`data-base-path`,
	 * `Url.Content("~/")`); `VITE_BASE_URL` is the standalone-dev fallback.
	 */
	baseUrl: string;
	/** Enable dev diagnostics: ghost detection and unknown-page errors. */
	dev?: boolean;
	/** Warning channel (missing page files, ghost routes); defaults to console.warn. */
	onWarn?: (message: string) => void;
	/**
	 * Error channel (unknown server-declared page names in dev); defaults to
	 * console.error.
	 */
	onError?: (message: string) => void;
}

export interface RouteTable {
	routes: AppRoute[];
	routeMap: Record<string, AppRoute["component"]>;
	/**
	 * Finds a route by its registry page name — exact, with a
	 * case-insensitive fallback. In dev mode a miss reports through onError:
	 * an unknown server-declared name is deploy skew and should be loud.
	 */
	findRouteByName(name: string): AppRoute | undefined;
	/**
	 * Finds a route by URL pathname, stripping the app base path first.
	 * Used as the standalone-dev fallback (no server-declared page name).
	 */
	findRouteGeneric(pathname: string): AppRoute | undefined;
	/**
	 * Reports page files that exist on disk but are not in the registry.
	 * Runs automatically at construction in dev; callable to re-check.
	 */
	detectGhostRoutes(): void;
}

/**
 * Builds the client-side route table (ADR 0006): a stateless, per-page-load
 * resolver that binds a server-declared page name to its React component.
 * The server routes; the client binds. No provider, no state, no router.
 *
 * The generated project keeps only a thin Vite-boundary adapter that globs
 * its pages, imports the generated typed manifest, resolves the base path,
 * and calls this factory.
 */
export function createRouteTable(
	manifest: readonly RouteEntry[],
	loaders: PageLoaders,
	options: RouteTableOptions,
): RouteTable {
	const warn = options.onWarn ?? ((message: string) => console.warn(message));
	const error =
		options.onError ?? ((message: string) => console.error(message));
	const dev = options.dev === true;
	const basePath = normalizeBasePath(options.baseUrl);

	const routes: AppRoute[] = [];
	const routeMap: Record<string, AppRoute["component"]> = {};
	// Exact-name map first; a lowercase map only as the case-insensitive
	// fallback, preserving exact-match priority when names collide by case.
	const byName = new Map<string, AppRoute>();
	const byNameLower = new Map<string, AppRoute>();

	for (const entry of manifest) {
		const loader = loaders[entry.files.react];
		if (!loader) {
			// One bad entry must not disable the whole bundle: warn and skip
			// only this route (the server's RoutePolicy stays the loud
			// validator for the registry itself).
			warn(
				`[RouteTable] Route "${entry.name}" (${entry.path}) is defined in routes.json but its page file is missing (${entry.files.react}). Skipping this route.`,
			);
			continue;
		}

		const Component = lazy(loader);
		const route: AppRoute = {
			path: entry.path,
			component: Component,
			pageName: entry.name,
			access: entry.access ?? "protected",
		};
		routes.push(route);
		routeMap[entry.name] = Component;
		byName.set(entry.name, route);
		// First-inserted wins in the fallback map, matching the historical
		// exact-then-case-insensitive lookup order.
		const lowerName = entry.name.toLowerCase();
		if (!byNameLower.has(lowerName)) {
			byNameLower.set(lowerName, route);
		}
	}

	const findRouteByName = (name: string): AppRoute | undefined => {
		const exact = byName.get(name);
		if (exact) return exact;
		const route = byNameLower.get(name.toLowerCase());
		if (route) return route;
		if (dev) {
			error(
				`[RouteTable] Server declared unknown page "${name}". Rendering the "Page not found" fallback.`,
			);
		}
		return undefined;
	};

	const findRouteGeneric = (pathname: string): AppRoute | undefined => {
		let relativePath = pathname;
		if (
			basePath !== "/" &&
			relativePath.toLowerCase().startsWith(basePath.toLowerCase())
		) {
			relativePath = relativePath.slice(basePath.length);
		}
		if (!relativePath.startsWith("/")) {
			relativePath = `/${relativePath}`;
		}

		const normalizedPath = relativePath.replace(/\/+$/, "") || "/";
		const lowerPath = normalizedPath.toLowerCase();
		return routes.find((route) => route.path.toLowerCase() === lowerPath);
	};

	const detectGhostRoutes = (): void => {
		if (!dev) return;
		const tracked = new Set(manifest.map((entry) => entry.files.react));
		for (const key of Object.keys(loaders)) {
			if (!tracked.has(key)) {
				warn(
					`[RouteTable] Ghost route: ${key} exists on disk but is not in routes.json. It will be ignored.`,
				);
			}
		}
	};

	if (dev) detectGhostRoutes();

	return {
		routes,
		routeMap,
		findRouteByName,
		findRouteGeneric,
		detectGhostRoutes,
	};
}

function normalizeBasePath(rawBaseUrl: string): string {
	let base = rawBaseUrl;
	try {
		if (/^https?:\/\//i.test(base)) {
			base = new URL(base).pathname;
		}
	} catch {
		// Not a parseable URL — treat the value as a path.
	}
	if (base !== "/" && base.endsWith("/")) {
		base = base.slice(0, -1);
	}
	if (!base.startsWith("/")) {
		base = `/${base}`;
	}
	return base;
}
