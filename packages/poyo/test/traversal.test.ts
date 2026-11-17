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
import { createRouterHarness, stubComponent } from "./router-test-helpers.js";

const homeRoute: AppRoute = {
	path: "/",
	pageName: "Home",
	access: "public",
	component: stubComponent(),
};

const dashboardRoute: AppRoute = {
	path: "/dashboard",
	pageName: "Dashboard",
	access: "protected",
	component: stubComponent(),
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

	// popstate fires only for entries of the current document: an entry of
	// another document is a document load the browser performs itself. So
	// every entry that reaches the handler is this document's own, and none of
	// them is answered with a reload.
	it("adopts the landing entry so Back to it is a same-document traversal", () => {
		const harness = createRouterHarness({ routes });

		expect(harness.history.state).toEqual({
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
				url: "http://localhost:3000/",
				key: expect.any(String),
			},
		});
	});

	it("keeps another library's keys when adopting the landing entry", () => {
		const harness = createRouterHarness({
			routes,
			historyState: { someOtherLib: 123 },
		});

		expect(harness.history.state).toEqual(
			expect.objectContaining({
				someOtherLib: 123,
				__poyo: expect.objectContaining({ clientNavigated: true }),
			}),
		);
	});

	it("traverses an entry without router state through the descriptor instead of reloading", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ name: "Dashboard", seo: null, pageData: null }),
		});
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			scrollY: 640,
		});

		// Back to an entry another library pushed at a different path.
		harness.location.pathname = "/dashboard";
		harness.location.href = "http://localhost:3000/dashboard";
		harness.history.state = { someOtherLib: 123 };
		await harness.popstate({ someOtherLib: 123 });

		expect(harness.replaceLocation).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(getNavigationStore().getRoute()).toBe(dashboardRoute);
		// No scroll record: the page is shown from the top, not at the
		// outgoing page's offset, and the entry gains a record.
		expect(harness.scrollTo).toHaveBeenLastCalledWith(0, 0);
		expect(harness.history.state).toEqual(
			expect.objectContaining({
				someOtherLib: 123,
				__poyo: expect.objectContaining({ scroll: { x: 0, y: 0 } }),
			}),
		);
	});

	it("leaves a same-URL entry another library pushed to that library", async () => {
		const fetchMock = vi.fn();
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
		});

		// e.g. a modal library's history.pushState({ modal: true }, "", sameUrl)
		await harness.popstate({ modal: true });

		expect(fetchMock).not.toHaveBeenCalled();
		expect(harness.replaceLocation).not.toHaveBeenCalled();
		expect(harness.assign).not.toHaveBeenCalled();
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
			redirect: "manual",
		});

		const store = getNavigationStore();
		expect(store.getRoute()).toEqual(dashboardRoute);
		expect(store.getPageData()).toEqual({ count: 42 });
		expect(harness.assign).not.toHaveBeenCalled();
		expect(harness.replaceLocation).not.toHaveBeenCalled();
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
		expect(harness.replaceLocation).not.toHaveBeenCalled();
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
		expect(harness.replaceLocation).not.toHaveBeenCalled();
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
			redirect: "manual",
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

		expect(harness.replaceLocation).toHaveBeenCalledWith("/dashboard");
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

		expect(harness.replaceLocation).toHaveBeenCalledWith("/dashboard");
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

		expect(harness.replaceLocation).toHaveBeenCalledWith("/unknown");
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

		expect(harness.replaceLocation).toHaveBeenCalledWith("/dashboard");
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
		expect(harness.replaceLocation).not.toHaveBeenCalled();
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
		expect(harness.replaceLocation).not.toHaveBeenCalled();
	});
});

describe("Router Traversal — entries the model checker found", () => {
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

	it("does not copy the entry being left into a pushed entry", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ name: "Dashboard", seo: null, pageData: null }),
		});
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			historyState: { modal: { open: true } },
		});

		await harness.router.push("/dashboard");

		const pushed = harness.history.pushState.mock.calls[0][0];
		expect(pushed).not.toHaveProperty("modal");
		expect(pushed).toEqual({
			__poyo: expect.objectContaining({ clientNavigated: true }),
		});
	});

	it("does not record the outgoing page's scroll into the entry a traversal is moving to", async () => {
		let answer: (value: unknown) => void = () => undefined;
		const fetchMock = vi.fn(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		const destination = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 120 },
				url: "/dashboard",
			},
		};
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
		});

		// Back: the browser now points at /dashboard; "/" is still on screen.
		harness.location.pathname = "/dashboard";
		harness.location.href = "http://localhost:3000/dashboard";
		harness.history.state = destination;
		const traversal = harness.popstate(destination);

		// The user scrolls the outgoing page before the descriptor arrives.
		(window as unknown as { scrollY: number }).scrollY = 900;
		harness.scroll();

		expect(harness.history.replaceState).not.toHaveBeenCalledWith(
			expect.objectContaining({
				__poyo: expect.objectContaining({ scroll: { x: 0, y: 900 } }),
			}),
			"",
			expect.anything(),
		);

		answer({
			ok: true,
			status: 200,
			json: async () => ({ name: "Dashboard", seo: null, pageData: null }),
		});
		await traversal;

		expect(harness.scrollTo).toHaveBeenLastCalledWith(0, 120);
	});
});

describe("Router Traversal — replace keeps screen and scroll record in step", () => {
	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		clearActiveRouteTable();
		resetNavigationStore();
	});

	it("shows a replaced page from the top, matching the entry's fresh scroll record", async () => {
		clearActiveRouteTable();
		resetNavigationStore();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ name: "Dashboard", seo: null, pageData: null }),
		});
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			scrollY: 480,
		});

		await harness.router.replace("/dashboard");

		expect(harness.history.state).toEqual(
			expect.objectContaining({
				__poyo: expect.objectContaining({ scroll: { x: 0, y: 0 } }),
			}),
		);
		expect(harness.scrollTo).toHaveBeenLastCalledWith(0, 0);
	});
});

describe("Router Traversal — a restore frame belongs to its own navigation", () => {
	beforeEach(() => {
		clearActiveRouteTable();
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
	});

	// Found by the TLA+ check of the router with a frame queue, and by the
	// model check at depth 7 (trace: lib → back → ok → push → ok → frame).
	it("does not scroll a page pushed before the Back restore frame ran", async () => {
		const frames: FrameRequestCallback[] = [];
		const fetchMock = vi.fn(async (url: string) => ({
			ok: true,
			status: 200,
			redirected: false,
			json: async () => ({
				name: url.includes("dashboard") ? "Dashboard" : "Home",
				pageData: null,
			}),
		}));
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
			requestAnimationFrame: (callback) => frames.push(callback),
			cancelAnimationFrame: vi.fn(),
		});

		// Back to Home, whose entry recorded 500.
		Object.assign(harness.location, {
			href: "http://localhost:3000/",
			pathname: "/",
		});
		await harness.popstate({
			__poyo: { clientNavigated: true, scroll: { x: 0, y: 500 }, url: "/" },
		});
		expect(frames).toHaveLength(1);

		// A Link click whose descriptor answers before the next frame.
		await harness.router.push("/dashboard");
		expect(getNavigationStore().getRoute()?.pageName).toBe("Dashboard");
		expect(harness.scrollTo).toHaveBeenLastCalledWith(0, 0);

		for (const frame of frames.splice(0)) frame(0);

		expect(harness.scrollTo).toHaveBeenLastCalledWith(0, 0);
		expect(harness.scrollTo).not.toHaveBeenCalledWith(0, 500);
	});

	it("still restores when no navigation follows", async () => {
		const frames: FrameRequestCallback[] = [];
		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			redirected: false,
			json: async () => ({ name: "Home", pageData: null }),
		}));
		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			location: { pathname: "/", href: "http://localhost:3000/" },
			requestAnimationFrame: (callback) => frames.push(callback),
			cancelAnimationFrame: vi.fn(),
		});
		await harness.popstate({
			__poyo: { clientNavigated: true, scroll: { x: 0, y: 500 }, url: "/" },
		});
		for (const frame of frames.splice(0)) frame(0);
		expect(harness.scrollTo).toHaveBeenLastCalledWith(0, 500);
	});
});

describe("Router Traversal — scroll memory and the in-place floor", () => {
	beforeEach(() => {
		clearActiveRouteTable();
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
	});

	const okFetch = () =>
		vi.fn(async (url: string) => ({
			ok: true,
			status: 200,
			redirected: false,
			json: async () => ({
				name: url.includes("dashboard") ? "Dashboard" : "Home",
				pageData: null,
			}),
		}));

	// 0.5.1 recorded scroll into history state on a frame, so an entry left
	// before that frame came back at the position before the last scroll —
	// documented then as a known limit (ADR 0019).
	it("returns to the position an entry was left at, even within a frame of the last scroll", async () => {
		const frames: FrameRequestCallback[] = [];
		const harness = createRouterHarness({
			routes,
			fetch: okFetch() as unknown as typeof fetch,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
			requestAnimationFrame: (callback) => frames.push(callback),
			cancelAnimationFrame: vi.fn(),
		});
		const landingState = harness.history.state;

		await harness.router.push("/");
		const homeState = harness.history.state;
		const scrolled = window as unknown as { scrollY: number };

		// The user scrolls Home to 700 and presses Back before the frame that
		// would write the record into history state.
		scrolled.scrollY = 700;
		harness.scroll();
		Object.assign(harness.location, {
			href: "http://localhost:3000/dashboard",
			pathname: "/dashboard",
		});
		harness.history.state = landingState;
		await harness.popstate(landingState);
		frames.splice(0).forEach((frame) => frame(0));

		// Forward to Home: its history record still says 0.
		expect(homeState).toMatchObject({ __poyo: { scroll: { y: 0 } } });
		Object.assign(harness.location, {
			href: "http://localhost:3000/",
			pathname: "/",
		});
		harness.history.state = homeState;
		await harness.popstate(homeState);
		frames.splice(0).forEach((frame) => frame(0));

		expect(harness.scrollTo).toHaveBeenLastCalledWith(0, 700);
	});

	it("reloads in place when a traversal to a fragment entry cannot be answered", async () => {
		const harness = createRouterHarness({
			routes,
			fetch: vi.fn(async () => ({
				ok: false,
				status: 500,
				redirected: false,
			})) as unknown as typeof fetch,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
		});

		// Back to "/#team": the browser is already on that entry. replace()
		// with the same URL and a fragment would be a fragment navigation —
		// no document load — leaving Dashboard on screen at "/#team".
		Object.assign(harness.location, {
			href: "http://localhost:3000/#team",
			pathname: "/",
			hash: "#team",
		});
		await harness.popstate({
			__poyo: { clientNavigated: true, scroll: { x: 0, y: 0 }, url: "/#team" },
		});

		expect(harness.location.reload).toHaveBeenCalledTimes(1);
		expect(harness.replaceLocation).not.toHaveBeenCalled();
		expect(harness.assign).not.toHaveBeenCalled();
	});
});
