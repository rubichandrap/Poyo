import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType } from "react";
import {
	createRouteTable,
	routePath,
	withBasePath,
	type PageLoaders,
	type RouteEntry,
	type RouteName,
	type RoutePath,
} from "../src/runtime/index.js";
import {
	clearActiveRouteTable,
	registerRouteTable,
} from "../src/runtime/route-table.js";
// Page fixtures: plain components built without JSX so the test file needs
// no JSX transform configuration.
const DashboardPage: ComponentType = () =>
	createElement("div", null, "Dashboard");
const ServerDataPage: ComponentType = () =>
	createElement("div", null, "ServerData");
const AboutPage: ComponentType = () => createElement("div", null, "About");

const dashboardEntry: RouteEntry = {
	path: "/Dashboard",
	name: "Dashboard",
	files: {
		react: "src/pages/Dashboard/index.page.tsx",
		view: "Views/Dashboard/Index.cshtml",
	},
	access: "protected",
};

const serverDataEntry: RouteEntry = {
	path: "/ServerData",
	name: "ServerData",
	files: {
		react: "src/pages/ServerData/index.page.tsx",
		view: "Views/ServerData/Index.cshtml",
	},
	access: "public",
};

// A route whose page file is missing from the loaders (warn + skip case).
const missingEntry: RouteEntry = {
	path: "/Broken",
	name: "Broken",
	files: {
		react: "src/pages/Broken/index.page.tsx",
		view: "Views/Broken/Index.cshtml",
	},
	access: "protected",
};

// Loaders carrying a page that exists on disk but not in the manifest.
const ghostLoaders: PageLoaders = {
	"src/pages/Orphan/index.page.tsx": async () => ({ default: DashboardPage }),
};

const fixturePages: Record<string, ComponentType> = {
	Dashboard: DashboardPage,
	ServerData: ServerDataPage,
	About: AboutPage,
};

function loadersFor(...entries: RouteEntry[]): PageLoaders {
	const loaders: PageLoaders = {};
	for (const entry of entries) {
		const page = fixturePages[entry.name];
		if (!page) {
			throw new Error(`No fixture page registered for "${entry.name}".`);
		}
		loaders[entry.files.react] = async () => ({ default: page });
	}
	return loaders;
}

/**
 * Hand-rolled rather than `Promise.withResolvers`, which is ES2024: this package
 * supports Node 20 (`engines`), where the builtin does not exist.
 */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

function makeTable(
	options: {
		manifest?: readonly RouteEntry[];
		loaders?: PageLoaders;
		baseUrl?: string;
		dev?: boolean;
		onWarn?: (message: string) => void;
		onError?: (message: string) => void;
	} = {},
) {
	const manifest = options.manifest ?? [dashboardEntry, serverDataEntry];
	const loaders = options.loaders ?? loadersFor(...manifest);
	return createRouteTable(manifest, loaders, {
		baseUrl: options.baseUrl ?? "/",
		dev: options.dev ?? false,
		onWarn: options.onWarn,
		onError: options.onError,
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	clearActiveRouteTable();
});
describe("createRouteTable", () => {
	it("builds the route table from the manifest", () => {
		const table = makeTable();

		expect(table.routes).toHaveLength(2);
		expect(table.routes[0]).toMatchObject({
			path: "/Dashboard",
			pageName: "Dashboard",
			access: "protected",
		});
		expect(table.routes[1]).toMatchObject({
			path: "/ServerData",
			pageName: "ServerData",
			access: "public",
		});
		expect(table.routeMap["Dashboard"]).toBe(table.routes[0].component);
		expect(table.routeMap["ServerData"]).toBe(table.routes[1].component);
	});

	describe("createPage — page module loading", () => {
		it("suspends until the module is preloaded, then renders it synchronously", async () => {
			const { promise, resolve } = deferred<{ default: ComponentType }>();
			const table = createRouteTable(
				[dashboardEntry],
				{ [dashboardEntry.files.react]: () => promise },
				{ baseUrl: "/" },
			);
			const route = table.routes[0];
			const render = route.component as unknown as () => unknown;

			// Before the module is in memory the component suspends: it throws the
			// loader's thenable, which is what a Suspense boundary catches.
			let suspended: unknown;
			try {
				render();
			} catch (thrown) {
				suspended = thrown;
			}
			expect(suspended).toBeInstanceOf(Promise);

			resolve({ default: DashboardPage });
			await route.preload();

			// A preloaded route renders without suspending again — the property the
			// router relies on to commit without a fallback.
			expect(render()).toMatchObject({ type: DashboardPage });
		});

		it("loads a page module at most once", async () => {
			const loader = vi.fn(async () => ({ default: DashboardPage }));
			const table = createRouteTable(
				[dashboardEntry],
				{ [dashboardEntry.files.react]: loader },
				{ baseUrl: "/" },
			);
			const route = table.routes[0];

			await Promise.all([route.preload(), route.preload()]);
			await route.preload();

			expect(loader).toHaveBeenCalledTimes(1);
		});

		it("remembers a failed load, so the component reports the error instead of retrying", async () => {
			const loader = vi.fn(async () => {
				throw new Error("Failed to fetch dynamically imported module");
			});
			const table = createRouteTable(
				[dashboardEntry],
				{ [dashboardEntry.files.react]: loader },
				{ baseUrl: "/" },
			);
			const route = table.routes[0];

			await expect(route.preload()).rejects.toThrow(
				"Failed to fetch dynamically imported module",
			);
			await expect(route.preload()).rejects.toThrow(
				"Failed to fetch dynamically imported module",
			);
			expect(loader).toHaveBeenCalledTimes(1);
			// A rejected import is surfaced to the error boundary; suspending
			// again would make React retry a module that cannot arrive.
			expect(() => (route.component as unknown as () => unknown)()).toThrow(
				"Failed to fetch dynamically imported module",
			);
		});
	});

	it("defaults access to protected when the registry omits it", () => {
		const entry: RouteEntry = {
			path: "/About",
			name: "About",
			files: {
				react: "src/pages/About/index.page.tsx",
				view: "Views/About/Index.cshtml",
			},
		};
		const table = makeTable({
			manifest: [entry],
			loaders: loadersFor(entry),
		});
		expect(table.routes[0].access).toBe("protected");
	});

	it("returns the full AppRoute from findRouteByName", () => {
		const table = makeTable();
		const route = table.findRouteByName("Dashboard");
		expect(route).toBeDefined();
		expect(route).toMatchObject({
			path: "/Dashboard",
			pageName: "Dashboard",
			access: "protected",
		});
		expect(route?.component).toBe(table.routeMap["Dashboard"]);
	});

	it("matches route names case-insensitively", () => {
		const table = makeTable();
		expect(table.findRouteByName("dashboard")?.path).toBe("/Dashboard");
		expect(table.findRouteByName("SERVERDATA")?.path).toBe("/ServerData");
	});

	it("prefers an exact name match over the case-insensitive fallback", () => {
		const lowerEntry: RouteEntry = {
			path: "/lowercase",
			name: "dashboard",
			files: {
				react: "src/pages/lowercase/index.page.tsx",
				view: "Views/Lowercase/Index.cshtml",
			},
			access: "public",
		};
		const table = makeTable({
			manifest: [dashboardEntry, lowerEntry],
			loaders: {
				...loadersFor(dashboardEntry),
				"src/pages/lowercase/index.page.tsx": async () => ({
					default: ServerDataPage,
				}),
			},
		});
		// Exact name wins over the colliding lowercase entry.
		expect(table.findRouteByName("Dashboard")?.path).toBe("/Dashboard");
		// The fallback still resolves the other casing (first-inserted wins,
		// matching the historical exact-then-case-insensitive lookup order).
		expect(table.findRouteByName("DASHBOARD")?.path).toBe("/Dashboard");
		expect(table.findRouteByName("dashboard")?.path).toBe("/lowercase");
	});

	it("returns undefined for unknown names without reporting in prod", () => {
		const onError = vi.fn();
		const table = makeTable({ onError });
		expect(table.findRouteByName("Nope")).toBeUndefined();
		expect(onError).not.toHaveBeenCalled();
	});

	it("reports unknown server-declared pages through onError in dev", () => {
		const onError = vi.fn();
		const table = makeTable({ dev: true, onError });
		expect(table.findRouteByName("Nope")).toBeUndefined();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toContain("Nope");
	});

	it("strips a path base in findRouteGeneric", () => {
		const table = makeTable({ baseUrl: "/Poyo" });
		expect(table.findRouteGeneric("/Poyo/Dashboard")?.pageName).toBe(
			"Dashboard",
		);
	});

	it("strips a full-URL base in findRouteGeneric", () => {
		const table = makeTable({ baseUrl: "https://host/Poyo" });
		expect(table.findRouteGeneric("/Poyo/ServerData")?.pageName).toBe(
			"ServerData",
		);
	});

	it("handles trailing slashes on the base and the pathname", () => {
		const table = makeTable({ baseUrl: "/Poyo/" });
		expect(table.findRouteGeneric("/Poyo/Dashboard/")?.pageName).toBe(
			"Dashboard",
		);
	});

	it("matches without stripping when the base is the root", () => {
		const table = makeTable({ baseUrl: "/" });
		expect(table.findRouteGeneric("/Dashboard")?.pageName).toBe("Dashboard");
		expect(table.findRouteGeneric("/ServerData")?.pageName).toBe("ServerData");
	});

	it("matches paths case-insensitively", () => {
		const table = makeTable({ baseUrl: "/Poyo" });
		expect(table.findRouteGeneric("/poyo/dashboard")?.pageName).toBe(
			"Dashboard",
		);
	});

	it("returns undefined for unmatched pathnames", () => {
		const table = makeTable();
		expect(table.findRouteGeneric("/Nope")).toBeUndefined();
	});

	it("warns and skips routes whose page file is missing", () => {
		const onWarn = vi.fn();
		const table = makeTable({
			manifest: [dashboardEntry, missingEntry, serverDataEntry],
			loaders: loadersFor(dashboardEntry, serverDataEntry),
			onWarn,
		});

		expect(onWarn).toHaveBeenCalledTimes(1);
		expect(onWarn.mock.calls[0][0]).toContain(
			"src/pages/Broken/index.page.tsx",
		);
		expect(table.routes.map((r) => r.pageName)).toEqual([
			"Dashboard",
			"ServerData",
		]);
		expect(table.routeMap["Broken"]).toBeUndefined();
		// The surviving routes still resolve.
		expect(table.findRouteByName("ServerData")).toBeDefined();
	});

	it("reports ghost routes in dev at construction", () => {
		const onWarn = vi.fn();
		const table = makeTable({
			loaders: {
				...loadersFor(dashboardEntry, serverDataEntry),
				...ghostLoaders,
			},
			dev: true,
			onWarn,
		});

		expect(onWarn).toHaveBeenCalledTimes(1);
		expect(onWarn.mock.calls[0][0]).toContain("Ghost");
		expect(onWarn.mock.calls[0][0]).toContain(
			"src/pages/Orphan/index.page.tsx",
		);
		expect(table.routes.map((r) => r.pageName)).toEqual([
			"Dashboard",
			"ServerData",
		]);
	});

	it("does not report ghosts when dev is off", () => {
		const onWarn = vi.fn();
		makeTable({
			loaders: {
				...loadersFor(dashboardEntry, serverDataEntry),
				...ghostLoaders,
			},
			dev: false,
			onWarn,
		});
		expect(onWarn).not.toHaveBeenCalled();
	});

	it("detectGhostRoutes can be called explicitly", () => {
		const onWarn = vi.fn();
		const table = makeTable({
			loaders: {
				...loadersFor(dashboardEntry, serverDataEntry),
				...ghostLoaders,
			},
			dev: true,
			onWarn,
		});
		table.detectGhostRoutes();
		// Once from the automatic dev run, once from the explicit call.
		expect(onWarn).toHaveBeenCalledTimes(2);
	});

	it("routes warnings through onWarn instead of console.warn", () => {
		const consoleWarn = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		const onWarn = vi.fn();
		makeTable({
			manifest: [dashboardEntry, missingEntry],
			loaders: loadersFor(dashboardEntry),
			onWarn,
		});

		expect(onWarn).toHaveBeenCalledTimes(1);
		expect(consoleWarn).not.toHaveBeenCalled();
	});

	it("defaults to console.warn when no onWarn is given", () => {
		const consoleWarn = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		makeTable({
			manifest: [dashboardEntry, missingEntry],
			loaders: loadersFor(dashboardEntry),
		});

		expect(consoleWarn).toHaveBeenCalledTimes(1);
	});

	it("accepts an empty manifest", () => {
		const table = makeTable({ manifest: [], loaders: {} });

		expect(table.routes).toEqual([]);
		expect(table.routeMap).toEqual({});
		expect(table.findRouteByName("Anything")).toBeUndefined();
		expect(table.findRouteGeneric("/Anything")).toBeUndefined();
	});

	it("treats every loader as a ghost when the manifest is empty and dev is on", () => {
		const onWarn = vi.fn();
		makeTable({
			manifest: [],
			loaders: loadersFor(dashboardEntry, serverDataEntry),
			dev: true,
			onWarn,
		});
		expect(onWarn).toHaveBeenCalledTimes(2);
	});
});

describe("routePath and active route table registration", () => {
	it("throws a clear initialization error when called before registration", () => {
		clearActiveRouteTable();
		expect(() => routePath("Dashboard")).toThrowError(
			/route table not initialized.*route-loader/i,
		);
	});

	it("resolves route path once route table is created", () => {
		makeTable({
			manifest: [dashboardEntry, serverDataEntry],
			loaders: loadersFor(dashboardEntry, serverDataEntry),
		});

		expect(routePath("Dashboard")).toBe("/Dashboard");
		expect(routePath("ServerData")).toBe("/ServerData");
	});

	it("throws for an unknown route name when route table is initialized", () => {
		makeTable({
			manifest: [dashboardEntry],
			loaders: loadersFor(dashboardEntry),
		});

		expect(() => routePath("NonExistent")).toThrowError(
			/unknown route.*NonExistent/i,
		);
	});

	it("can explicitly register and clear the active route table", () => {
		const table = makeTable({
			manifest: [dashboardEntry],
			loaders: loadersFor(dashboardEntry),
		});

		expect(routePath("Dashboard")).toBe("/Dashboard");

		registerRouteTable(undefined);
		expect(() => routePath("Dashboard")).toThrowError(
			/route table not initialized/i,
		);

		registerRouteTable(table);
		expect(routePath("Dashboard")).toBe("/Dashboard");
	});

	it("derives typed RouteName and RoutePath defaulting to string pre-augmentation", () => {
		const name: RouteName = "ArbitraryName";
		const path: RoutePath = "/arbitrary/path";
		expect(typeof name).toBe("string");
		expect(typeof path).toBe("string");
	});
});

describe("base path resolution", () => {
	it("matches the base path on a segment boundary only", async () => {
		const { isUnderBasePath } = await import("../src/runtime/route-table.js");

		expect(isUnderBasePath("/app", "/app")).toBe(true);
		expect(isUnderBasePath("/APP/x", "/app")).toBe(true);
		expect(isUnderBasePath("/apple", "/app")).toBe(false);
		expect(isUnderBasePath("/anything", "/")).toBe(true);
	});

	it("does not strip a base path that is only a prefix of the first segment", () => {
		const about: RouteEntry = {
			path: "/le",
			name: "About",
			files: {
				react: "src/pages/About/index.page.tsx",
				view: "Views/About/Index.cshtml",
			},
		};
		const table = createRouteTable([about], loadersFor(about), {
			baseUrl: "/app",
		});

		// Under base "/app", "/apple" used to be stripped to "/le".
		expect(table.findRouteGeneric("/apple")).toBeUndefined();
		expect(table.findRouteGeneric("/app/le")?.pageName).toBe("About");
	});

	it("prefixes app-relative paths and leaves everything else alone", () => {
		expect(withBasePath("/Dashboard", "/Poyo")).toBe("/Poyo/Dashboard");
		expect(withBasePath("/", "/Poyo")).toBe("/Poyo");
		expect(withBasePath("/Dashboard?tab=1#team", "/Poyo")).toBe(
			"/Poyo/Dashboard?tab=1#team",
		);
		// An app path that starts with the base's text is still an app path:
		// leaving it alone would drop a segment once the server strips the base.
		expect(withBasePath("/poyo/Dashboard", "/Poyo")).toBe(
			"/Poyo/poyo/Dashboard",
		);
		expect(withBasePath("/Poyo", "/Poyo")).toBe("/Poyo/Poyo");
		// Root base, absolute and non-root-relative hrefs.
		expect(withBasePath("/Dashboard", "/")).toBe("/Dashboard");
		expect(withBasePath("https://example.com/x", "/Poyo")).toBe(
			"https://example.com/x",
		);
		expect(withBasePath("//cdn.example.com/x", "/Poyo")).toBe(
			"//cdn.example.com/x",
		);
		expect(withBasePath("#team", "/Poyo")).toBe("#team");
		expect(withBasePath("?tab=1", "/Poyo")).toBe("?tab=1");
	});

	it("turns a routePath() result into the URL the browser needs under a base path", () => {
		createRouteTable([dashboardEntry], loadersFor(dashboardEntry), {
			baseUrl: "https://host/Poyo/",
		});

		expect(withBasePath(routePath("Dashboard" as RouteName))).toBe(
			"/Poyo/Dashboard",
		);
	});
});
