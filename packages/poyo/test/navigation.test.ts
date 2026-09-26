import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePage } from "../src/runtime/use-page.js";
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

const dummyRoute: AppRoute = {
	path: "/dashboard",
	pageName: "Dashboard",
	access: "protected",
	component: () => null,
};

describe("Navigation Store & usePage", () => {
	beforeEach(() => {
		clearActiveRouteTable();
		resetNavigationStore();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearActiveRouteTable();
		resetNavigationStore();
	});

	it("seeds pageData from window.SERVER_DATA on initial load", () => {
		const initialData = { user: "alice", role: "admin" };
		vi.stubGlobal("window", { SERVER_DATA: initialData });

		expect(usePage<{ user: string; role: string }>()).toEqual(initialData);
	});

	it("updates usePage when navigation store commits new page data", () => {
		const initialData = { user: "alice", role: "admin" };
		vi.stubGlobal("window", { SERVER_DATA: initialData });

		expect(usePage<{ user: string }>()?.user).toBe("alice");

		const newData = { user: "bob", role: "user" };
		commitNavigation({
			route: dummyRoute,
			pageData: newData,
		});

		expect(usePage<{ user: string }>()?.user).toBe("bob");
		expect(getNavigationStore().getRoute()).toEqual(dummyRoute);
	});

	it("returns null when committed pageData is a non-object primitive or array", () => {
		vi.stubGlobal("window", { SERVER_DATA: { valid: true } });
		expect(usePage()).toEqual({ valid: true });

		commitNavigation({
			route: dummyRoute,
			pageData: "not an object",
		});
		expect(usePage()).toBeNull();

		commitNavigation({
			route: dummyRoute,
			pageData: [1, 2, 3],
		});
		expect(usePage()).toBeNull();
	});
});

describe("Router push, replace, and fallbacks", () => {
	beforeEach(() => {
		clearActiveRouteTable();
		resetNavigationStore();
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		clearActiveRouteTable();
		resetNavigationStore();
	});

	it("swaps route and pageData on successful descriptor response via push", async () => {
		const dashboardRoute: AppRoute = {
			path: "/dashboard",
			pageName: "Dashboard",
			access: "protected",
			component: () => null,
		};

		const routes: AppRoute[] = [dashboardRoute];

		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					name: "Dashboard",
					seo: { title: "Dashboard Overview" },
					pageData: { stats: 100 },
				}),
				{
					status: 200,
					headers: { "Cache-Control": "private, no-store" },
				},
			),
		);

		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		await router.push("/dashboard");

		expect(fetchMock).toHaveBeenCalledWith(
			"/dashboard",
			expect.objectContaining({
				credentials: "same-origin",
				headers: expect.objectContaining({
					"X-Poyo-Navigation": "1",
				}),
			}),
		);
		expect(router.route).toEqual(dashboardRoute);
		expect(usePage<{ stats: number }>()?.stats).toBe(100);
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
		expect(harness.assign).not.toHaveBeenCalled();
	});

	it("swaps route and calls replaceState on replace", async () => {
		const loginRoute: AppRoute = {
			path: "/login",
			pageName: "Login",
			access: "public",
			component: () => null,
		};

		const routes: AppRoute[] = [loginRoute];

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Login",
				seo: { title: "Login" },
				pageData: null,
			}),
		});

		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		await router.replace("/login");

		expect(router.route).toEqual(loginRoute);
		expect(harness.history.replaceState).toHaveBeenCalledWith(
			expect.objectContaining({
				__poyo: expect.objectContaining({
					clientNavigated: true,
					scroll: { x: 0, y: 0 },
				}),
			}),
			"",
			"/login",
		);
	});

	it("carries third-party history state keys into the new entry", async () => {
		const loginRoute: AppRoute = {
			path: "/login",
			pageName: "Login",
			access: "public",
			component: () => null,
		};

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Login",
				seo: { title: "Login" },
				pageData: null,
			}),
		});

		// An entry the router did not create, carrying another library's keys.
		const harness = createRouterHarness({
			routes: [loginRoute],
			fetch: fetchMock as unknown as typeof fetch,
			historyState: { someOtherLibrary: { tab: "billing" } },
		});

		await harness.router.replace("/login");

		expect(harness.history.replaceState).toHaveBeenCalledWith(
			expect.objectContaining({
				someOtherLibrary: { tab: "billing" },
				__poyo: expect.objectContaining({ clientNavigated: true }),
			}),
			"",
			"/login",
		);
		// The harness models the browser's synchronous state write.
		expect(harness.history.state).toEqual(
			expect.objectContaining({
				someOtherLibrary: { tab: "billing" },
			}),
		);
	});

	it("degrades to document load on non-2xx response", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			statusText: "Not Found",
		});
		const harness = createRouterHarness({
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		await router.push("/missing");

		expect(harness.assign).toHaveBeenCalledWith("/missing");
		expect(router.route).toBeNull();
	});

	it("requests descriptors without following redirects", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 200,
		});
		const harness = createRouterHarness({
			fetch: fetchMock as unknown as typeof fetch,
		});

		await harness.router.push("/dashboard");

		expect(fetchMock).toHaveBeenCalledWith(
			"/dashboard",
			expect.objectContaining({ redirect: "manual" }),
		);
	});

	// The access filter answers a descriptor request for a protected route with a
	// 302 to the login page, and a guest route with a 302 to the landing page. If
	// the client follows that redirect it receives a 200 descriptor for the *other*
	// page, commits that page's route and Page data, and still writes the URL it
	// asked for — so the address bar and the screen describe different pages and
	// history holds an entry for a page that was never rendered.
	it("degrades to document load when the descriptor request is redirected", async () => {
		const dashboardRoute: AppRoute = {
			path: "/dashboard",
			pageName: "Dashboard",
			access: "protected",
			component: () => null,
		};
		const loginRoute: AppRoute = {
			path: "/login",
			pageName: "Login",
			access: "guest",
			component: () => null,
		};

		// What a browser hands back for a cross-"same-origin" redirect under
		// redirect: "manual": an opaque response with no readable status or body.
		const opaqueRedirect = {
			type: "opaqueredirect",
			url: "",
			ok: false,
			status: 0,
			json: vi.fn(async () => {
				throw new SyntaxError("Unexpected token '<'");
			}),
		};
		const fetchMock = vi.fn().mockResolvedValue(opaqueRedirect);

		const harness = createRouterHarness({
			routes: [dashboardRoute, loginRoute],
			fetch: fetchMock as unknown as typeof fetch,
		});

		await harness.router.push("/dashboard");

		// The transport is what makes this an opaque redirect rather than some
		// other non-2xx, so assert it here too: this test otherwise only proves
		// the pre-existing !ok degradation path.
		expect(fetchMock).toHaveBeenCalledWith(
			"/dashboard",
			expect.objectContaining({ redirect: "manual" }),
		);
		// Hand back to the browser for the requested URL: it applies the 302
		// itself and lands on the login page with a fresh document.
		expect(harness.assign).toHaveBeenCalledWith("/dashboard");
		// The redirect target must never be committed under the requested URL.
		expect(harness.router.route).toBeNull();
		expect(harness.history.pushState).not.toHaveBeenCalled();
		expect(harness.history.replaceState).not.toHaveBeenCalled();
		// The opaque body must not even be read.
		expect(opaqueRedirect.json).not.toHaveBeenCalled();
	});

	it("degrades to document load when a redirect resolves to a valid descriptor", async () => {
		// Guards the same invariant against a transport that reports the redirect
		// and still exposes the final body: a 200 descriptor for a page that is
		// not the requested one must not be committed at the requested URL.
		const loginRoute: AppRoute = {
			path: "/login",
			pageName: "Login",
			access: "guest",
			component: () => null,
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			redirected: true,
			url: "http://localhost:3000/login?ReturnUrl=%2Fdashboard",
			json: async () => ({
				name: "Login",
				seo: { title: "Login" },
				pageData: { user: null },
			}),
		});

		const harness = createRouterHarness({
			routes: [loginRoute],
			fetch: fetchMock as unknown as typeof fetch,
		});

		await harness.router.push("/dashboard");

		expect(harness.assign).toHaveBeenCalledWith("/dashboard");
		expect(harness.router.route).toBeNull();
		expect(harness.history.pushState).not.toHaveBeenCalled();
	});

	it("does not include credentials for a cross-origin descriptor request", async () => {
		const crossOriginUrl = "https://other.example/dashboard";
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
		});
		const activeRoute: AppRoute = {
			path: "/",
			pageName: "Home",
			access: "public",
			component: () => null,
		};
		const harness = createRouterHarness({
			routes: [activeRoute],
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		await router.push(crossOriginUrl);

		expect(fetchMock).toHaveBeenCalledWith(crossOriginUrl, {
			credentials: "same-origin",
			headers: { "X-Poyo-Navigation": "1" },
			redirect: "manual",
		});
		const crossOriginOptions = fetchMock.mock.calls.find(
			([url]) => url === crossOriginUrl,
		)?.[1];
		expect(crossOriginOptions).toMatchObject({
			credentials: "same-origin",
		});
		expect(crossOriginOptions).not.toMatchObject({
			credentials: "include",
		});
		expect(router.route).toEqual(activeRoute);
		expect(harness.assign).toHaveBeenCalledWith(crossOriginUrl);
	});

	it("degrades to document load on invalid descriptor shape (not an object or missing name)", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => [1, 2, 3], // Array is not a descriptor
		});

		const harness = createRouterHarness({
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		await router.push("/bad-shape");

		expect(harness.assign).toHaveBeenCalledWith("/bad-shape");
		expect(router.route).toBeNull();
	});

	it("degrades to document load when descriptor name is unknown in route table", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "GhostPage",
				seo: null,
				pageData: {},
			}),
		});

		const harness = createRouterHarness({
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		await router.push("/ghost");

		expect(harness.assign).toHaveBeenCalledWith("/ghost");
		expect(router.route).toBeNull();
	});

	it("degrades to document load on fetch exception", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("Network Error"));
		const harness = createRouterHarness({
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		await router.push("/offline");

		expect(harness.assign).toHaveBeenCalledWith("/offline");
		expect(router.route).toBeNull();
	});

	it("ensures rapid successive pushes are last-write-wins (supersede token)", async () => {
		const slowRoute: AppRoute = {
			path: "/slow",
			pageName: "Slow",
			access: "protected",
			component: () => null,
		};
		const fastRoute: AppRoute = {
			path: "/fast",
			pageName: "Fast",
			access: "protected",
			component: () => null,
		};

		const routes: AppRoute[] = [slowRoute, fastRoute];

		const { promise: slowPromise, resolve: resolveSlowFetch } =
			Promise.withResolvers<unknown>();

		const fetchMock = vi.fn().mockImplementation((url: string) => {
			if (url === "/slow") {
				return slowPromise;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => ({
					name: "Fast",
					seo: { title: "Fast Page" },
					pageData: { speed: "fast" },
				}),
			});
		});

		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		// Start slow navigation
		const slowNavPromise = router.push("/slow");

		// Start fast navigation while slow is still in-flight
		const fastNavPromise = router.push("/fast");

		// Fast completes first
		await fastNavPromise;
		expect(router.route).toEqual(fastRoute);
		expect(usePage<{ speed: string }>()?.speed).toBe("fast");
		expect(harness.history.pushState).toHaveBeenCalledWith(
			expect.objectContaining({
				__poyo: expect.objectContaining({
					clientNavigated: true,
					scroll: { x: 0, y: 0 },
				}),
			}),
			"",
			"/fast",
		);

		// Now resolve slow navigation
		resolveSlowFetch({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Slow",
				seo: { title: "Slow Page" },
				pageData: { speed: "slow" },
			}),
		});
		await slowNavPromise;

		// Router state and usePage must still be fastRoute and speed: "fast"
		expect(router.route).toEqual(fastRoute);
		expect(usePage<{ speed: string }>()?.speed).toBe("fast");
		// No history entry may exist for /slow. Asserting on the null state the
		// router never writes would pass no matter what the supersede token did,
		// so assert on every write the router made instead.
		expect(harness.history.pushState).toHaveBeenCalledTimes(1);
		expect(harness.history.pushState).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			"/slow",
		);
	});

	it("does not trigger fallback if a superseded request fails or rejects", async () => {
		const activeRoute: AppRoute = {
			path: "/active",
			pageName: "Active",
			access: "protected",
			component: () => null,
		};

		const { promise: slowPromise, reject: rejectSlowFetch } =
			Promise.withResolvers<unknown>();

		const fetchMock = vi.fn().mockImplementation((url: string) => {
			if (url === "/stale-slow") {
				return slowPromise;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => ({
					name: "Active",
					seo: { title: "Active Page" },
					pageData: { id: 1 },
				}),
			});
		});

		const harness = createRouterHarness({
			routes: [activeRoute],
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		// Start stale navigation
		const stalePromise = router.push("/stale-slow");

		// Start active navigation
		const activePromise = router.push("/active");

		await activePromise;
		expect(router.route).toEqual(activeRoute);

		// Now stale navigation rejects with network error
		rejectSlowFetch(new Error("Stale Network Failure"));
		await stalePromise;

		// Fallback MUST NOT have been called for the superseded stale URL
		expect(harness.assign).not.toHaveBeenCalledWith("/stale-slow");
		expect(router.route).toEqual(activeRoute);
	});

	it("updates document.title and meta description from descriptor SEO", async () => {
		const seoRoute: AppRoute = {
			path: "/profile",
			pageName: "Profile",
			access: "protected",
			component: () => null,
		};

		const metaEl = {
			setAttribute: vi.fn(),
		};
		const headAppendMock = vi.fn();
		const mockDoc = {
			title: "Initial Title",
			querySelector: vi.fn().mockImplementation((sel: string) => {
				if (sel === 'meta[name="description"]') {
					return null; // Not found initially
				}
				return null;
			}),
			createElement: vi.fn().mockImplementation((tag: string) => {
				if (tag === "meta") return metaEl;
				return {};
			}),
			head: {
				appendChild: headAppendMock,
			},
			body: {
				appendChild: vi.fn(),
			},
			getElementById: vi.fn().mockReturnValue(null),
		};

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Profile",
				seo: {
					title: "User Profile - Poyo",
					description: "View and edit your profile settings",
				},
				pageData: {},
			}),
		});

		const harness = createRouterHarness({
			routes: [seoRoute],
			fetch: fetchMock as unknown as typeof fetch,
			document: mockDoc as unknown as Document,
		});
		const router = harness.router;

		await router.push("/profile");

		expect(mockDoc.title).toBe("User Profile - Poyo");
		expect(mockDoc.createElement).toHaveBeenCalledWith("meta");
		expect(metaEl.setAttribute).toHaveBeenCalledWith("name", "description");
		expect(metaEl.setAttribute).toHaveBeenCalledWith(
			"content",
			"View and edit your profile settings",
		);
		expect(headAppendMock).toHaveBeenCalledWith(metaEl);
	});

	it("moves focus to the page region and announces swap via live region", async () => {
		const settingsRoute: AppRoute = {
			path: "/settings",
			pageName: "Settings",
			access: "protected",
			component: () => null,
		};

		const pageRegionEl = {
			hasAttribute: vi.fn().mockReturnValue(false),
			setAttribute: vi.fn(),
			focus: vi.fn(),
		};

		const announcerEl = {
			id: "",
			textContent: "",
			setAttribute: vi.fn(),
		};

		const bodyAppendMock = vi.fn();
		const mockDoc = {
			title: "",
			querySelector: vi.fn().mockImplementation((sel: string) => {
				if (sel === "[data-page-region]" || sel === "main") {
					return pageRegionEl;
				}
				return null;
			}),
			getElementById: vi.fn().mockImplementation((id: string) => {
				if (id === "poyo-announcer") return null;
				if (id === "react-root") return pageRegionEl;
				return null;
			}),
			createElement: vi.fn().mockImplementation((tag: string) => {
				if (tag === "div") return announcerEl;
				return {};
			}),
			body: {
				appendChild: bodyAppendMock,
			},
		};

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Settings",
				seo: { title: "Settings - Account Preferences" },
				pageData: {},
			}),
		});

		const harness = createRouterHarness({
			routes: [settingsRoute],
			fetch: fetchMock as unknown as typeof fetch,
			document: mockDoc as unknown as Document,
		});
		const router = harness.router;

		await router.push("/settings");

		// Focus moved to page region
		expect(pageRegionEl.setAttribute).toHaveBeenCalledWith("tabindex", "-1");
		expect(pageRegionEl.focus).toHaveBeenCalledWith({ preventScroll: true });

		// Live region created and populated
		expect(announcerEl.setAttribute).toHaveBeenCalledWith(
			"aria-live",
			"polite",
		);
		expect(announcerEl.setAttribute).toHaveBeenCalledWith(
			"aria-atomic",
			"true",
		);
		expect(announcerEl.textContent).toBe("Settings - Account Preferences");
		expect(bodyAppendMock).toHaveBeenCalledWith(announcerEl);
	});
});

describe("useRouter and shell reactivity without a provider", () => {
	beforeEach(() => {
		clearActiveRouteTable();
		resetNavigationStore();
	});

	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		clearActiveRouteTable();
		resetNavigationStore();
	});

	it("renders not-found (null route) when server declares an unknown page name", () => {
		const homeRoute: AppRoute = {
			path: "/",
			pageName: "Home",
			access: "public",
			component: () => null,
		};

		// Server declared an unknown page name "GhostPage" on #react-root
		const mockDoc = {
			getElementById: (id: string) => {
				if (id === "react-root") {
					return {
						dataset: { pageName: "GhostPage" },
						getAttribute: (name: string) =>
							name === "data-page-name" ? "GhostPage" : null,
					};
				}
				return null;
			},
		};

		const harness = createRouterHarness({
			routes: [homeRoute],
			document: mockDoc as unknown as Document,
		});
		const router = harness.router;

		// Must be null (not falling back to findRouteGeneric) so shell renders not-found UI
		expect(router.route).toBeNull();
	});

	it("resolves the declared server page name on initial load", () => {
		const homeRoute: AppRoute = {
			path: "/",
			pageName: "Home",
			access: "public",
			component: () => null,
		};

		const mockDoc = {
			getElementById: (id: string) => {
				if (id === "react-root") {
					return {
						dataset: { pageName: "Home" },
						getAttribute: (name: string) =>
							name === "data-page-name" ? "Home" : null,
					};
				}
				return null;
			},
		};

		const harness = createRouterHarness({
			routes: [homeRoute],
			document: mockDoc as unknown as Document,
		});
		const router = harness.router;

		expect(router.route).toEqual(homeRoute);
	});

	it("reactively updates subscribers without a React provider when navigation commits", async () => {
		const aboutRoute: AppRoute = {
			path: "/about",
			pageName: "About",
			access: "public",
			component: () => null,
		};

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "About",
				seo: { title: "About Us" },
				pageData: { description: "Poyo team" },
			}),
		});

		const harness = createRouterHarness({
			routes: [aboutRoute],
			fetch: fetchMock as unknown as typeof fetch,
		});
		const router = harness.router;

		const subscriberMock = vi.fn();
		const store = getNavigationStore();
		const unsubscribe = store.subscribe(subscriberMock);
		expect(router.route).toBeNull();

		await router.push("/about");

		expect(subscriberMock).toHaveBeenCalled();
		expect(router.route).toEqual(aboutRoute);

		expect(usePage<{ description: string }>()?.description).toBe("Poyo team");

		unsubscribe();
	});

	it("changes the navigation state identity on every commit so useRouter's snapshot re-renders", async () => {
		const dashboardRoute: AppRoute = {
			path: "/dashboard",
			pageName: "Dashboard",
			access: "protected",
			component: () => null,
		};

		const routes: AppRoute[] = [dashboardRoute];

		let data: unknown = { generation: 1 };
		const fetchMock = vi.fn().mockImplementation(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ name: "Dashboard", pageData: data }),
		}));

		const harness = createRouterHarness({
			routes,
			fetch: fetchMock as unknown as typeof fetch,
			location: {
				pathname: "/dashboard",
				href: "http://localhost:3000/dashboard",
			},
		});
		const router = harness.router;
		const store = getNavigationStore();

		// useRouter() snapshots store.getState, so a commit that resolves to
		// the route already mounted still produces a new snapshot (and thus a
		// re-render, which is what lets usePage read the fresh page data).
		const before = store.getState();
		data = { generation: 2 };
		await router.push("/dashboard");

		expect(store.getState()).not.toBe(before);
		expect(
			(store.getState().pageData as { generation: number }).generation,
		).toBe(2);
		expect(usePage<{ generation: number }>()?.generation).toBe(2);
	});
});
