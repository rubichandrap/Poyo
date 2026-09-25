import {
	type Mock,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	commitNavigation,
	getNavigationStore,
	resetNavigationStore,
} from "../src/runtime/navigation-store.js";
import {
	createRouter,
	getActiveRouter,
	setActiveRouter,
} from "../src/runtime/router.js";
import type { AppRoute } from "../src/runtime/route-table.js";

type PopStateCallback = (e: PopStateEvent) => void;
type ScrollCallback = () => void;
type EventCallback = PopStateCallback | ScrollCallback | EventListener;

interface MockLocation {
	href: string;
	pathname: string;
	search: string;
	hash: string;
	assign: Mock;
}

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
const routeTable = {
	routes,
	routeMap: new Map([
		["/", homeRoute],
		["/dashboard", dashboardRoute],
	]),
	findRouteByName: (name: string) => routes.find((r) => r.pageName === name),
	findRouteGeneric: (path: string) => routes.find((r) => r.path === path),
	detectGhostRoutes: () => [],
};

describe("Router Traversal — Slice 1: Cold entry traversal", () => {
	beforeEach(() => {
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		resetNavigationStore();
	});

	it("sets history.scrollRestoration to 'manual' on install", () => {
		const historyMock = {
			state: null,
			scrollRestoration: "auto",
			pushState: vi.fn(),
			replaceState: vi.fn(),
			back: vi.fn(),
			forward: vi.fn(),
		};

		const win = {
			history: historyMock,
			location: {
				href: "http://localhost:3000/",
				pathname: "/",
				search: "",
				hash: "",
				assign: vi.fn(),
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			window: win,
		});

		expect(historyMock.scrollRestoration).toBe("manual");
	});

	it("triggers an ordinary document load (assign) on cold-entry Back/Forward traversal", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn();

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const win = {
			history: {
				state: null, // Cold entry: never client-navigated
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
				back: vi.fn(),
				forward: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/",
				pathname: "/",
				search: "",
				hash: "",
				assign: assignMock,
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		expect(addEventListenerMock).toHaveBeenCalledWith(
			"popstate",
			expect.any(Function),
		);
		expect(popstateListener).toBeDefined();

		// Simulate user pressing browser Back to a cold entry (state is null)
		popstateListener!({
			state: null,
		} as PopStateEvent);

		// Must fall back to a document load of the target URL
		expect(assignMock).toHaveBeenCalledWith("/");
		// Must not fetch descriptor
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("triggers document load if popstate state is a non-Poyo object (e.g. third-party state)", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn();

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const win = {
			history: {
				state: { someOtherLib: 123 },
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/some-page",
				pathname: "/some-page",
				search: "",
				hash: "",
				assign: assignMock,
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		popstateListener!({
			state: { someOtherLib: 123 },
		} as unknown as PopStateEvent);

		expect(assignMock).toHaveBeenCalledWith("/some-page");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("Router Traversal — Slice 2: Client-navigated traversal swaps page via descriptor", () => {
	beforeEach(() => {
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		resetNavigationStore();
	});

	it("swaps page via descriptor on popstate when history state is client-navigated", async () => {
		const assignMock = vi.fn();
		const pushStateMock = vi.fn();
		const replaceStateMock = vi.fn();

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				seo: { title: "Dashboard Title" },
				pageData: { count: 42 },
			}),
		});

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

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

		const win = {
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: pushStateMock,
				replaceState: replaceStateMock,
			},
			location: {
				href: "http://localhost:3000/dashboard",
				pathname: "/dashboard",
				search: "",
				hash: "",
				assign: assignMock,
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
			document: docMock,
		});

		// Trigger traversal popstate
		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		// Verify fetch occurred with navigation header
		expect(fetchMock).toHaveBeenCalledWith("/dashboard", {
			credentials: "same-origin",
			headers: { "X-Poyo-Navigation": "1" },
		});

		// Store updated
		const store = getNavigationStore();
		expect(store.getRoute()).toEqual(dashboardRoute);
		expect(store.getPageData()).toEqual({ count: 42 });

		// No document load
		expect(assignMock).not.toHaveBeenCalled();

		// Browser history not pushed or replaced during popstate
		expect(pushStateMock).not.toHaveBeenCalled();
		expect(replaceStateMock).not.toHaveBeenCalled();
	});
});

describe("Router Traversal — Slice 3: Scroll position saving and restoration", () => {
	beforeEach(() => {
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		resetNavigationStore();
	});

	it("resets scroll to (0, 0) and records initial scroll (0, 0) in pushState on fresh push", async () => {
		const scrollToMock = vi.fn();
		const pushStateMock = vi.fn();
		const replaceStateMock = vi.fn();

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				pageData: {},
			}),
		});

		const win = {
			scrollX: 0,
			scrollY: 100,
			scrollTo: scrollToMock,
			history: {
				state: null,
				scrollRestoration: "auto",
				pushState: pushStateMock,
				replaceState: replaceStateMock,
			},
			location: {
				href: "http://localhost:3000/",
				pathname: "/",
				search: "",
				hash: "",
				assign: vi.fn(),
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		} as unknown as Window;

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		await router.push("/dashboard");

		expect(scrollToMock).toHaveBeenCalledWith(0, 0);
		expect(pushStateMock).toHaveBeenCalledWith(
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
		const scrollToMock = vi.fn();
		const pushStateMock = vi.fn();
		const replaceStateMock = vi.fn();

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

		const win = {
			scrollX: 0,
			scrollY: 350,
			scrollTo: scrollToMock,
			history: {
				state: initialPoyoState,
				scrollRestoration: "auto",
				pushState: pushStateMock,
				replaceState: replaceStateMock,
			},
			location: {
				href: "http://localhost:3000/",
				pathname: "/",
				search: "",
				hash: "",
				assign: vi.fn(),
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		} as unknown as Window;

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		await router.push("/dashboard");

		// replaceState should have been called on the leaving entry with scroll (0, 350)
		expect(replaceStateMock).toHaveBeenCalledWith(
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
		const scrollToMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				pageData: {},
			}),
		});

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoStateWithScroll = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 520 },
			},
		};

		const win = {
			scrollTo: scrollToMock,
			history: {
				state: poyoStateWithScroll,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/dashboard",
				pathname: "/dashboard",
				search: "",
				hash: "",
				assign: vi.fn(),
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		await popstateListener!({
			state: poyoStateWithScroll,
		} as unknown as PopStateEvent);

		expect(scrollToMock).toHaveBeenCalledWith(0, 520);
	});

	it("restores the previous scrollRestoration value on destroy", () => {
		const historyMock = {
			state: null,
			scrollRestoration: "auto",
			pushState: vi.fn(),
			replaceState: vi.fn(),
		};

		const win = {
			history: historyMock,
			location: {
				href: "http://localhost:3000/",
				pathname: "/",
				search: "",
				hash: "",
				assign: vi.fn(),
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		} as unknown as Window;

		const router = createRouter({
			routeTable,
			window: win,
		});
		expect(historyMock.scrollRestoration).toBe("manual");

		router.destroy?.();

		expect(historyMock.scrollRestoration).toBe("auto");
	});

	it("defers the traversal scroll restore to the next frame when rAF is available", async () => {
		const scrollToMock = vi.fn();
		let frameCallback: (() => void) | undefined;
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				pageData: {},
			}),
		});

		let popstateListener: PopStateCallback | undefined;
		const poyoStateWithScroll = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 520 },
			},
		};

		const win = {
			scrollTo: scrollToMock,
			requestAnimationFrame: (callback: () => void) => {
				frameCallback = callback;
				return 1;
			},
			cancelAnimationFrame: vi.fn(),
			history: {
				state: poyoStateWithScroll,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/dashboard",
				pathname: "/dashboard",
				search: "",
				hash: "",
				assign: vi.fn(),
			},
			addEventListener: (event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		await popstateListener!({
			state: poyoStateWithScroll,
		} as unknown as PopStateEvent);

		// Not restored against the outgoing document: the frame comes first.
		expect(scrollToMock).not.toHaveBeenCalled();

		frameCallback?.();

		expect(scrollToMock).toHaveBeenCalledWith(0, 520);
	});

	it("updates current history state when window scroll event fires", () => {
		const replaceStateMock = vi.fn();
		let scrollListener: ScrollCallback | undefined;

		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "scroll") {
					scrollListener = listener as ScrollCallback;
				}
			},
		);

		const currentState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const win = {
			scrollX: 0,
			scrollY: 240,
			history: {
				state: currentState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: replaceStateMock,
			},
			location: {
				href: "http://localhost:3000/dashboard",
				pathname: "/dashboard",
				search: "",
				hash: "",
				assign: vi.fn(),
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			window: win,
		});

		expect(scrollListener).toBeDefined();

		// Trigger scroll event
		scrollListener!();

		expect(replaceStateMock).toHaveBeenCalledWith(
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
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		resetNavigationStore();
	});

	it("bypasses machinery when popstate occurs for a hash-only change on the same page", async () => {
		const fetchMock = vi.fn();
		const assignMock = vi.fn();
		const scrollToMock = vi.fn();

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const locationMock: MockLocation = {
			href: "http://localhost:3000/dashboard",
			pathname: "/dashboard",
			search: "",
			hash: "",
			assign: assignMock,
		};

		const win = {
			scrollTo: scrollToMock,
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: locationMock as unknown as Location,
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		// Commit initial route
		commitNavigation({
			route: dashboardRoute,
			pageData: { initial: true },
		});

		// Simulate hash change: location becomes /dashboard#team
		locationMock.href = "http://localhost:3000/dashboard#team";
		locationMock.hash = "#team";

		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		// Must NOT fetch descriptor
		expect(fetchMock).not.toHaveBeenCalled();
		// Must NOT trigger fallback
		expect(assignMock).not.toHaveBeenCalled();
		// Must NOT touch scroll (browser owns anchor scrolling)
		expect(scrollToMock).not.toHaveBeenCalled();
		// Page state remains unchanged
		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ initial: true });
	});

	it("bypasses machinery when hash is removed on the same page (/dashboard#team -> /dashboard)", async () => {
		const fetchMock = vi.fn();
		const assignMock = vi.fn();
		const scrollToMock = vi.fn();

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const locationMock: MockLocation = {
			href: "http://localhost:3000/dashboard#team",
			pathname: "/dashboard",
			search: "",
			hash: "#team",
			assign: assignMock,
		};

		const win = {
			scrollTo: scrollToMock,
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: locationMock as unknown as Location,
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		// Popstate to /dashboard (hash removed)
		locationMock.href = "http://localhost:3000/dashboard";
		locationMock.hash = "";

		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(assignMock).not.toHaveBeenCalled();
		expect(scrollToMock).not.toHaveBeenCalled();
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
		const assignMock = vi.fn();

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const locationMock: MockLocation = {
			href: "http://localhost:3000/dashboard#team",
			pathname: "/dashboard",
			search: "",
			hash: "#team",
			assign: assignMock,
		};

		const win = {
			scrollTo: vi.fn(),
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: locationMock as unknown as Location,
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		// Navigate to /#team (pathname changed!)
		locationMock.href = "http://localhost:3000/#team";
		locationMock.pathname = "/";

		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		// Pathname changed, so must fetch descriptor!
		expect(fetchMock).toHaveBeenCalledWith("/", {
			credentials: "same-origin",
			headers: { "X-Poyo-Navigation": "1" },
		});
		expect(getNavigationStore().getRoute()).toEqual(homeRoute);
	});
});

describe("Router Traversal — Slice 5: Failed and superseded traversal handling", () => {
	beforeEach(() => {
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		resetNavigationStore();
	});

	it("degrades to document load on non-2xx descriptor response during traversal", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		});

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const win = {
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/dashboard",
				pathname: "/dashboard",
				search: "",
				hash: "",
				assign: assignMock,
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		expect(assignMock).toHaveBeenCalledWith("/dashboard");
	});

	it("degrades to document load on invalid descriptor format during traversal", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ invalid: true }), // Missing name
		});

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const win = {
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/dashboard",
				pathname: "/dashboard",
				search: "",
				hash: "",
				assign: assignMock,
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		expect(assignMock).toHaveBeenCalledWith("/dashboard");
	});

	it("degrades to document load when descriptor name is unknown in route table", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ name: "UnknownPage" }),
		});

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const win = {
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/unknown",
				pathname: "/unknown",
				search: "",
				hash: "",
				assign: assignMock,
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		expect(assignMock).toHaveBeenCalledWith("/unknown");
	});

	it("degrades to document load on network failure during traversal", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockRejectedValue(new Error("Network offline"));

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const win = {
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/dashboard",
				pathname: "/dashboard",
				search: "",
				hash: "",
				assign: assignMock,
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		expect(assignMock).toHaveBeenCalledWith("/dashboard");
	});

	it("ensures rapid successive traversals are last-write-wins (supersede token)", async () => {
		let resolveSlowFetch: ((val: unknown) => void) | undefined;
		const slowPromise = new Promise((resolve) => {
			resolveSlowFetch = resolve;
		});

		const assignMock = vi.fn();
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

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const locationMock: MockLocation = {
			href: "http://localhost:3000/slow",
			pathname: "/slow",
			search: "",
			hash: "",
			assign: assignMock,
		};

		const win = {
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: locationMock as unknown as Location,
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		// 1. Popstate to /slow starts
		const slowTraversal = popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		// 2. Popstate to /dashboard starts and completes
		locationMock.pathname = "/dashboard";
		locationMock.href = "http://localhost:3000/dashboard";
		await popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ fast: true });

		// 3. Slow fetch resolves with Home route
		resolveSlowFetch!({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Home",
				pageData: { slow: true },
			}),
		});
		await slowTraversal;

		// Store must STILL have Dashboard!
		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ fast: true });
		// Fallback must NOT have been called for slow
		expect(assignMock).not.toHaveBeenCalled();
	});

	it("drops superseded traversal when a push navigation arrives before traversal completes", async () => {
		let resolveSlowFetch: ((val: unknown) => void) | undefined;
		const slowPromise = new Promise((resolve) => {
			resolveSlowFetch = resolve;
		});

		const assignMock = vi.fn();
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

		let popstateListener: PopStateCallback | undefined;
		const addEventListenerMock = vi.fn(
			(event: string, listener: EventCallback) => {
				if (event === "popstate") {
					popstateListener = listener as PopStateCallback;
				}
			},
		);

		const poyoState = {
			__poyo: {
				clientNavigated: true,
				scroll: { x: 0, y: 0 },
			},
		};

		const win = {
			history: {
				state: poyoState,
				scrollRestoration: "auto",
				pushState: vi.fn(),
				replaceState: vi.fn(),
			},
			location: {
				href: "http://localhost:3000/slow",
				pathname: "/slow",
				search: "",
				hash: "",
				assign: assignMock,
			},
			addEventListener: addEventListenerMock,
			removeEventListener: vi.fn(),
		} as unknown as Window;

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			window: win,
		});

		// 1. Slow traversal starts
		const slowTraversal = popstateListener!({
			state: poyoState,
		} as unknown as PopStateEvent);

		// 2. router.push arrives and finishes
		await router.push("/dashboard");
		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ pushed: true });

		// 3. Slow traversal resolves
		resolveSlowFetch!({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Home",
				pageData: { slow: true },
			}),
		});
		await slowTraversal;

		// Store must still have Dashboard
		expect(getNavigationStore().getRoute()).toEqual(dashboardRoute);
		expect(getNavigationStore().getPageData()).toEqual({ pushed: true });
		expect(assignMock).not.toHaveBeenCalled();
	});
});
