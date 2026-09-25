import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	commitNavigation,
	getNavigationStore,
	resetNavigationStore,
} from "../src/runtime/navigation-store.js";
import { getActiveRouter, setActiveRouter } from "../src/runtime/router.js";
import {
	clearActiveRouteTable,
	type AppRoute,
} from "../src/runtime/route-table.js";
import { createRouterHarness } from "./router-test-helpers.js";

const homeRoute: AppRoute = {
	path: "/",
	pageName: "Home",
	access: "public",
	component: () => null,
};

const dashboardRoute: AppRoute = {
	path: "/dashboard",
	pageName: "Dashboard",
	access: "protected",
	component: () => null,
};

const routes: AppRoute[] = [homeRoute, dashboardRoute];

describe("Router Traversal — Slice 1: Cold entry traversal", () => {
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

	it("sets history.scrollRestoration to 'manual' on install", () => {
		const harness = createRouterHarness();

		expect(harness.history.scrollRestoration).toBe("manual");
	});

	it("triggers an ordinary document load (assign) on cold-entry Back/Forward traversal", async () => {
		const fetchMock = vi.fn();
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
		});

		expect(harness.addEventListener).toHaveBeenCalledWith(
			"popstate",
			expect.any(Function),
		);

		await harness.popstate(null);

		expect(harness.assign).toHaveBeenCalledWith("/");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("triggers document load if popstate state is a non-Poyo object (e.g. third-party state)", async () => {
		const fetchMock = vi.fn();
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: { someOtherLib: 123 },
			location: {
				pathname: "/some-page",
				href: "http://localhost:3000/some-page",
			},
		});

		await harness.popstate({ someOtherLib: 123 });

		expect(harness.assign).toHaveBeenCalledWith("/some-page");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("Router Traversal — Slice 2: Client-navigated traversal swaps page via descriptor", () => {
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

	it("swaps page via descriptor on popstate when history state is client-navigated", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				seo: { title: "Dashboard Title" },
				pageData: { count: 42 },
			}),
		});

		const docMock = {
			title: "Old Title",
			querySelector: vi.fn().mockReturnValue(null),
			getElementById: vi.fn().mockReturnValue(null),
			createElement: vi.fn().mockImplementation((tag: string) => ({
				tagName: tag,
				setAttribute: vi.fn(),
				id: "",
			})),
			head: { appendChild: vi.fn() },
			body: { appendChild: vi.fn() },
		} as unknown as Document;

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
				url: "/dashboard",
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
			document: docMock,
		});

		await harness.popstate(poyoState);

		expect(fetchMock).toHaveBeenCalledWith("/dashboard", {
			credentials: "same-origin",
			headers: { "X-Poyo-Navigation": "1" },
		});

		const store = getNavigationStore();
		expect(store.getRoute()).toEqual(dashboardRoute);
		expect(store.getPageData()).toEqual({ count: 42 });
		expect(harness.assign).not.toHaveBeenCalled();
		expect(harness.history.pushState).not.toHaveBeenCalled();
		expect(harness.history.replaceState).not.toHaveBeenCalled();
	});
});

describe("Router Traversal — Slice 3: Scroll position saving and restoration", () => {
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

	it("resets scroll to (0, 0) and records initial scroll (0, 0) in pushState on fresh push", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				pageData: {},
			}),
		});
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			scrollY: 100,
		});

		await harness.router.push("/dashboard");

		expect(harness.scrollTo).toHaveBeenCalledWith(0, 0);
		expect(harness.history.pushState).toHaveBeenCalledWith(
			expect.objectContaining({
				__poyo: expect.objectContaining({
					clientNavigated: true,
					scroll: { x: 0, y: 0 },
				}),
			}),
			"",
			"/dashboard",
		);
	});

	it("saves current scroll position to leaving entry before pushing new entry", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				pageData: {},
			}),
		});
		const initialPoyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: initialPoyoState,
			scrollY: 350,
		});

		await harness.router.push("/dashboard");

		expect(harness.history.replaceState).toHaveBeenCalledWith(
			expect.objectContaining({
				__poyo: expect.objectContaining({
					clientNavigated: true,
					scroll: { x: 0, y: 350 },
				}),
			}),
			"",
			"http://localhost:3000/",
		);
	});

	it("restores scroll position on popstate traversal", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				pageData: {},
			}),
		});
		const poyoStateWithScroll = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 520 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoStateWithScroll,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
		});

		await harness.popstate(poyoStateWithScroll);

		expect(harness.scrollTo).toHaveBeenCalledWith(0, 520);
	});

	it("restores the previous scrollRestoration value on destroy", () => {
		const harness = createRouterHarness({ routes });

		expect(harness.history.scrollRestoration).toBe("manual");

		harness.router.destroy?.();

		expect(harness.history.scrollRestoration).toBe("auto");
	});

	it("defers the traversal scroll restore to the next frame when rAF is available", async () => {
		let frameCallback: FrameRequestCallback | undefined;
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				pageData: {},
			}),
		});
		const poyoStateWithScroll = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 520 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoStateWithScroll,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
			requestAnimationFrame: (callback) => {
				frameCallback = callback;
				return 1;
			},
			cancelAnimationFrame: vi.fn(),
		});

		await harness.popstate(poyoStateWithScroll);

		expect(harness.scrollTo).not.toHaveBeenCalled();

		frameCallback?.(0);

		expect(harness.scrollTo).toHaveBeenCalledWith(0, 520);
	});

	it("updates current history state when window scroll event fires", () => {
		const currentState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			historyState: currentState,
			scrollY: 240,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
		});

		harness.scroll();

		expect(harness.history.replaceState).toHaveBeenCalledWith(
			expect.objectContaining({
				__poyo: expect.objectContaining({
					clientNavigated: true,
					scroll: { x: 0, y: 240 },
				}),
			}),
			"",
			"http://localhost:3000/dashboard",
		);
	});
});

describe("Router Traversal — Slice 4: Hash-only changes keep native anchor behavior", () => {
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

	it("bypasses machinery when popstate occurs for a hash-only change on the same page", async () => {
		const fetchMock = vi.fn();
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
		});

		commitNavigation({
			route: dashboardRoute,
			pageData: { initial: true },
		});

		harness.location.href = "http://localhost:3000/dashboard#team";
		harness.location.hash = "#team";

		await harness.popstate(poyoState);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(harness.assign).not.toHaveBeenCalled();
		expect(harness.scrollTo).not.toHaveBeenCalled();
		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ initial: true });
	});

	it("bypasses machinery when hash is removed on the same page (/dashboard#team -> /dashboard)", async () => {
		const fetchMock = vi.fn();
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard#team",
				hash: "#team",
			},
		});

		harness.location.href = "http://localhost:3000/dashboard";
		harness.location.hash = "";

		await harness.popstate(poyoState);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(harness.assign).not.toHaveBeenCalled();
		expect(harness.scrollTo).not.toHaveBeenCalled();
	});

	it("does not bypass machinery when pathname changes even if hash is present", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Home",
				pageData: { home: true },
			}),
		});
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard#team",
				hash: "#team",
			},
		});

		harness.location.href = "http://localhost:3000/#team";
		harness.location.pathname = "/";

		await harness.popstate(poyoState);

		expect(fetchMock).toHaveBeenCalledWith("/", {
			credentials: "same-origin",
			headers: { "X-Poyo-Navigation": "1" },
		});
		expect(getNavigationStore().getRoute()).toEqual(homeRoute);
	});
});

describe("Router Traversal — Slice 5: Failed and superseded traversal handling", () => {
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

	it("degrades to document load on non-2xx descriptor response during traversal", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		});
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
		});

		await harness.popstate(poyoState);

		expect(harness.assign).toHaveBeenCalledWith("/dashboard");
	});

	it("degrades to document load on invalid descriptor format during traversal", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ invalid: true }),
		});
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
		});

		await harness.popstate(poyoState);

		expect(harness.assign).toHaveBeenCalledWith("/dashboard");
	});

	it("degrades to document load when descriptor name is unknown in route table", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ name: "UnknownPage" }),
		});
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/unknown",
				href: "http://localhost:3000/unknown",
			},
		});

		await harness.popstate(poyoState);

		expect(harness.assign).toHaveBeenCalledWith("/unknown");
	});

	it("degrades to document load on network failure during traversal", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("Network offline"));
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
		});

		await harness.popstate(poyoState);

		expect(harness.assign).toHaveBeenCalledWith("/dashboard");
	});

	it("ensures rapid successive traversals are last-write-wins (supersede token)", async () => {
		let resolveSlowFetch: ((val: unknown) => void) | undefined;
		const slowPromise = new Promise((resolve) => {
			resolveSlowFetch = resolve;
		});
		const fetchMock = vi.fn().mockImplementation((url: string) => {
			if (url === "/slow") {
				return slowPromise;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => ({
					name: "Dashboard",
					pageData: { fast: true },
				}),
			});
		});
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/slow",
				href: "http://localhost:3000/slow",
			},
		});

		const slowTraversal = harness.popstate(poyoState);
		harness.location.pathname = "/dashboard";
		harness.location.href = "http://localhost:3000/dashboard";
		await harness.popstate(poyoState);

		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ fast: true });

		resolveSlowFetch!({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Home",
				pageData: { slow: true },
			}),
		});
		await slowTraversal;

		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ fast: true });
		expect(harness.assign).not.toHaveBeenCalled();
	});

	it("drops superseded traversal when a push navigation arrives before traversal completes", async () => {
		let resolveSlowFetch: ((val: unknown) => void) | undefined;
		const slowPromise = new Promise((resolve) => {
			resolveSlowFetch = resolve;
		});
		const fetchMock = vi.fn().mockImplementation((url: string) => {
			if (url === "/slow") {
				return slowPromise;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => ({
					name: "Dashboard",
					pageData: { pushed: true },
				}),
			});
		});
		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: poyoState,
			location: {
				pathname: "/slow",
				href: "http://localhost:3000/slow",
			},
		});

		const slowTraversal = harness.popstate(poyoState);
		await harness.router.push("/dashboard");
		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ pushed: true });

		resolveSlowFetch!({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Home",
				pageData: { slow: true },
			}),
		});
		await slowTraversal;

		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ pushed: true });
		expect(harness.assign).not.toHaveBeenCalled();
	});
});
