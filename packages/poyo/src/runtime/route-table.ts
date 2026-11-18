import { createElement, type ComponentType, type ReactElement } from "react";

export type RouteAccess = "public" | "guest" | "protected";

/**
 * Registry interface for compile-time route verification.
 * Augmented by the generated routes manifest (`routes.generated.ts`).
 * Defaults to empty; unaugmented projects fall back to `string` for route names/paths.
 */
export interface PoyoRouteRegistry {}

export type RouteName = [PoyoRouteRegistry] extends [
	{ names: infer TNames extends string },
]
	? TNames
	: string;

export type RoutePath = [PoyoRouteRegistry] extends [
	{ paths: infer TPaths extends string },
]
	? TPaths
	: string;

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
	dynamic?: boolean;
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
 * a component that loads its page module on first render. Lookups return
 * `AppRoute`, never a bare component, so app code never hardcodes path values
 * or access levels.
 */
export interface AppRoute {
	path: string;
	// biome-ignore lint/suspicious/noExplicitAny: page props are unknown and vary per page; any keeps the component and JSX permissive.
	component: ComponentType<any>;
	pageName: string;
	access: RouteAccess;
	/**
	 * Loads the page module, once per document. Optional: a route built by
	 * hand without one is treated as already loaded and commits as before.
	 * The router awaits it between resolving the descriptor and committing
	 * the navigation, so a chunk that cannot load becomes a document load
	 * instead of a blank screen; only a rejecting preload takes that floor.
	 * A failed load is remembered for this document: the fallback document
	 * load builds a fresh route table (ADR 0009).
	 */
	preload?(): Promise<void>;
	/**
	 * Whether the registry lets this route swap without a document load
	 * (`dynamic: false` opts out). Optional: a route built by hand without
	 * one is dynamic, as every route was before the registry carried the
	 * flag. The router and `Link` hand a non-dynamic target to the browser
	 * without a descriptor request (ADR 0009).
	 */
	dynamic?: boolean;
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
	basePath: string;
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

interface PageModule {
	// biome-ignore lint/suspicious/noExplicitAny: page props are unknown and vary per page; any keeps the component permissive.
	default: ComponentType<any>;
}

/**
 * Binds a page loader to the component and the preload the router awaits.
 *
 * The component renders the module synchronously once it is loaded and
 * suspends on the loader before that. `React.lazy` would work for the cold
 * case, but it always suspends on first render even when its module is
 * already in memory: the router's preload would then still commit a Suspense
 * fallback for a microtask. Reading the loaded module directly removes that
 * flash from every navigation (ADR 0009).
 *
 * A load failure is remembered: React cannot retry the same import, and the
 * router's fallback document load builds a new route table. The promise is
 * shared, so two navigations to the same page before it arrives await one
 * request.
 */
function createPage(loader: PageLoader): {
	component: AppRoute["component"];
	preload: NonNullable<AppRoute["preload"]>;
} {
	let loaded: PageModule | undefined;
	let pending: Promise<PageModule> | undefined;
	let failure: { error: unknown } | undefined;

	const load = (): Promise<PageModule> => {
		if (loaded) return Promise.resolve(loaded);
		if (failure) return Promise.reject(failure.error);
		if (!pending) {
			pending = loader().then(
				(module) => {
					loaded = module;
					pending = undefined;
					return module;
				},
				(error: unknown) => {
					failure = { error };
					pending = undefined;
					throw error;
				},
			);
		}
		return pending;
	};

	// Props a caller passes reach the page unchanged, as they did through
	// `React.lazy`: the route's component is the page's own component.
	function Page(props: Record<string, unknown>): ReactElement {
		if (loaded) return createElement(loaded.default, props);
		if (failure) throw failure.error;
		// Suspense retries once the module arrives, then renders Page again
		// with `loaded` set, so the fallback is never shown for a preloaded
		// navigation.
		throw load();
	}

	return {
		component: Page,
		preload: () => load().then(() => undefined),
	};
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

		const page = createPage(loader);
		const route: AppRoute = {
			path: entry.path,
			component: page.component,
			pageName: entry.name,
			access: entry.access ?? "protected",
			preload: page.preload,
			dynamic: entry.dynamic !== false,
		};
		routes.push(route);
		routeMap[entry.name] = page.component;
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
		if (isUnderBasePath(relativePath, basePath)) {
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

	const table: RouteTable = {
		basePath,
		routes,
		routeMap,
		findRouteByName,
		findRouteGeneric,
		detectGhostRoutes,
	};

	registerRouteTable(table);

	return table;
}

let activeRouteTable: RouteTable | undefined;

/**
 * Registers the active route table for `routePath` resolution.
 * Called automatically when `createRouteTable` runs (e.g. on route-loader import).
 */
export function registerRouteTable(table: RouteTable | undefined): void {
	activeRouteTable = table;
}

/**
 * Clears the active route table registration.
 */
export function clearActiveRouteTable(): void {
	activeRouteTable = undefined;
}

/**
 * Returns the active registered route table, if any.
 */
export function getActiveRouteTable(): RouteTable | undefined {
	return activeRouteTable;
}

/**
 * Returns the canonical URL path for a registered route name.
 *
 * Resolved from the active route table registered by the route loader.
 * Throws a clear initialization error if called before the route table is initialized.
 */
export function routePath(name: RouteName): RoutePath {
	if (!activeRouteTable) {
		throw new Error(
			"[RouteTable] Route table not initialized — import your route-loader",
		);
	}
	const route = activeRouteTable.routes.find((r) => r.pageName === name);
	if (!route) {
		throw new Error(`[RouteTable] Unknown route "${String(name)}".`);
	}
	return route.path as RoutePath;
}

/**
 * Whether a pathname lies under the base path, on a segment boundary: under
 * base "/app", "/app" and "/app/x" do, "/apple" does not. Case-insensitive,
 * like every other path comparison in the runtime. The root base contains
 * every path.
 */
export function isUnderBasePath(pathname: string, basePath: string): boolean {
	if (basePath === "/") return true;
	const path = pathname.toLowerCase();
	const base = basePath.toLowerCase();
	return path === base || path.startsWith(`${base}/`);
}

/**
 * Resolves an app-relative href against the app base path, the way Next.js
 * treats `basePath`: registry paths and `routePath()` results are
 * app-relative ("/Dashboard"), and the URL the browser sees carries the base
 * ("/Poyo/Dashboard"). Left untouched: the root base, absolute URLs
 * ("https://…", "//host/…") and hrefs that are not root-relative ("#x", "?q",
 * "docs").
 *
 * Every root-relative href is prefixed, including one that already starts
 * with the base's text: under base "/app", the app path "/App/settings" is a
 * route of its own and resolves to "/app/App/settings". Resolve once, at the
 * boundary where an app path becomes a browser URL; an href that is already a
 * browser URL is not an input.
 */
export function withBasePath(
	href: string,
	basePath: string | undefined = activeRouteTable?.basePath,
): string {
	if (!basePath || basePath === "/") return href;
	if (!href.startsWith("/") || href.startsWith("//")) return href;
	return href === "/" ? basePath : `${basePath}${href}`;
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
