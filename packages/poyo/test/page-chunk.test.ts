/**
 * The page chunk seam of a dynamic navigation (ADR 0009, decision 7).
 *
 * The router resolves the descriptor, then loads the route's page module, and
 * only then commits the store and writes history. A module that cannot load —
 * a tab left open across a deploy, whose old chunk hash now 404s — must take
 * the same document-load floor as every other failure, and must never leave
 * the shell mounted over a blank screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getNavigationStore,
	resetNavigationStore,
} from "../src/runtime/navigation-store.js";
import { getActiveRouter, setActiveRouter } from "../src/runtime/router.js";
import {
	type AppRoute,
	clearActiveRouteTable,
} from "../src/runtime/route-table.js";
import { createRouterHarness } from "./router-test-helpers.js";

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

function route(
	path: string,
	pageName: string,
	overrides: Partial<AppRoute> = {},
): AppRoute {
	return {
		path,
		pageName,
		access: "public",
		component: () => null,
		preload: () => Promise.resolve(),
		...overrides,
	};
}

function descriptorFetch(name: string) {
	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		redirected: false,
		json: async () => ({ name, seo: null, pageData: { page: name } }),
	});
}

/** Resolves the microtasks a descriptor response and a preload run through. */
async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("Router — page chunk loading", () => {
	beforeEach(() => {
		clearActiveRouteTable();
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		clearActiveRouteTable();
		resetNavigationStore();
	});

	it("commits only after the page module has loaded", async () => {
		const page = deferred<void>();
		const dashboard = route("/dashboard", "Dashboard", {
			preload: () => page.promise,
		});
		const harness = createRouterHarness({
			routes: [dashboard],
			fetch: descriptorFetch("Dashboard") as unknown as typeof fetch,
		});

		const navigation = harness.router.push("/dashboard");
		await flush();

		// The descriptor arrived and the module is still loading: nothing of the
		// navigation may be visible yet.
		expect(getNavigationStore().getRoute()).toBeNull();
		expect(harness.history.pushState).not.toHaveBeenCalled();
		expect(harness.assign).not.toHaveBeenCalled();

		page.resolve();
		await navigation;

		expect(getNavigationStore().getRoute()).toBe(dashboard);
		expect(harness.history.pushState).toHaveBeenCalledTimes(1);
	});

	it("commits a route without a preload, as before", async () => {
		// `preload` is optional: a route built by hand — or by any route table
		// that has nothing to load — is treated as already loaded. Before the
		// router awaited the module, a missing method could not fail a
		// navigation, and it still cannot.
		const dashboard = route("/dashboard", "Dashboard", {
			preload: undefined,
		});
		const harness = createRouterHarness({
			routes: [dashboard],
			fetch: descriptorFetch("Dashboard") as unknown as typeof fetch,
		});

		await harness.router.push("/dashboard");

		expect(harness.assign).not.toHaveBeenCalled();
		expect(harness.replaceLocation).not.toHaveBeenCalled();
		expect(harness.history.pushState).toHaveBeenCalledTimes(1);
		expect(getNavigationStore().getRoute()).toBe(dashboard);
	});

	it("push whose page module fails falls back to a document load and writes nothing", async () => {
		const dashboard = route("/dashboard", "Dashboard", {
			preload: () =>
				Promise.reject(
					new Error("Failed to fetch dynamically imported module"),
				),
		});
		const harness = createRouterHarness({
			routes: [dashboard],
			fetch: descriptorFetch("Dashboard") as unknown as typeof fetch,
		});

		await harness.router.push("/dashboard");

		expect(harness.assign).toHaveBeenCalledWith("/dashboard");
		expect(harness.replaceLocation).not.toHaveBeenCalled();
		expect(harness.history.pushState).not.toHaveBeenCalled();
		expect(harness.history.replaceState).not.toHaveBeenCalled();
		expect(getNavigationStore().getRoute()).toBeNull();
	});

	it("replace whose page module fails falls back through location.replace", async () => {
		const dashboard = route("/dashboard", "Dashboard", {
			preload: () =>
				Promise.reject(
					new Error("Failed to fetch dynamically imported module"),
				),
		});
		const harness = createRouterHarness({
			routes: [dashboard],
			fetch: descriptorFetch("Dashboard") as unknown as typeof fetch,
		});

		await harness.router.replace("/dashboard");

		expect(harness.replaceLocation).toHaveBeenCalledWith("/dashboard");
		expect(harness.assign).not.toHaveBeenCalled();
		expect(harness.history.pushState).not.toHaveBeenCalled();
		expect(getNavigationStore().getRoute()).toBeNull();
	});

	it("a traversal whose page module fails falls back through location.replace", async () => {
		const home = route("/", "Home");
		const dashboard = route("/dashboard", "Dashboard", {
			preload: () =>
				Promise.reject(
					new Error("Failed to fetch dynamically imported module"),
				),
		});
		const harness = createRouterHarness({
			routes: [home, dashboard],
			fetch: descriptorFetch("Dashboard") as unknown as typeof fetch,
		});

		harness.location.pathname = "/dashboard";
		harness.location.href = "http://localhost:3000/dashboard";
		await harness.popstate({ someOtherLib: 123 });

		expect(harness.replaceLocation).toHaveBeenCalledWith("/dashboard");
		expect(harness.assign).not.toHaveBeenCalled();
		expect(harness.history.pushState).not.toHaveBeenCalled();
		// The screen still shows the page the document was loaded into; the
		// traversal never committed the destination.
		expect(getNavigationStore().getRoute()).toBe(home);
	});

	it("a superseded page module failure does not fall back", async () => {
		const slowPage = deferred<void>();
		const slow = route("/slow", "Slow", { preload: () => slowPage.promise });
		const fast = route("/fast", "Fast");
		const fetchMock = vi.fn(async (url: string) => ({
			ok: true,
			status: 200,
			redirected: false,
			json: async () => ({
				name: url === "/slow" ? "Slow" : "Fast",
				seo: null,
				pageData: null,
			}),
		}));
		const harness = createRouterHarness({
			routes: [slow, fast],
			fetch: fetchMock as unknown as typeof fetch,
		});

		const slowNavigation = harness.router.push("/slow");
		await flush();
		await harness.router.push("/fast");
		slowPage.reject(new Error("Failed to fetch dynamically imported module"));
		await slowNavigation;

		expect(harness.assign).not.toHaveBeenCalled();
		expect(harness.replaceLocation).not.toHaveBeenCalled();
		expect(getNavigationStore().getRoute()).toBe(fast);
		expect(harness.history.pushState).toHaveBeenCalledTimes(1);
	});
});
