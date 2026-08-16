import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType } from "react";
import {
	createRouteTable,
	type PageLoaders,
	type RouteEntry,
} from "../src/runtime/index.js";

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

	it("wraps components in lazy()", () => {
		const table = makeTable();
		expect(typeof table.routes[0].component).toBe("object");
		expect(table.routes[0].component).toHaveProperty("$$typeof");
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
