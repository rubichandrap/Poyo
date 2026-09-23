import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePage } from "../src/runtime/use-page.js";
import {
	commitNavigation,
	getNavigationStore,
	resetNavigationStore,
} from "../src/runtime/navigation-store.js";
import { createRouter, useRouter } from "../src/runtime/router.js";
import type { AppRoute } from "../src/runtime/route-table.js";

const dummyRoute: AppRoute = {
	path: "/dashboard",
	pageName: "Dashboard",
	access: "protected",
	component: () => null,
};

describe("Navigation Store & usePage", () => {
	beforeEach(() => {
		resetNavigationStore();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
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
		resetNavigationStore();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
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
		const routeTable = {
			routes,
			routeMap: new Map([["/dashboard", dashboardRoute]]),
			findRouteByName: (name: string) =>
				routes.find((r) => r.pageName === name),
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
		};

		const pushStateMock = vi.fn();
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Dashboard",
				seo: { title: "Dashboard Overview" },
				pageData: { stats: 100 },
			}),
		});

		vi.stubGlobal("window", {
			history: { pushState: pushStateMock, replaceState: vi.fn() },
			location: {
				assign: assignMock,
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
		});

		await router.push("/dashboard");

		expect(fetchMock).toHaveBeenCalledWith(
			"/dashboard",
			expect.objectContaining({
				headers: expect.objectContaining({
					"X-Poyo-Navigation": "1",
				}),
			}),
		);
		expect(router.route).toEqual(dashboardRoute);
		expect(usePage<{ stats: number }>()?.stats).toBe(100);
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
		expect(assignMock).not.toHaveBeenCalled();
	});

	it("swaps route and calls replaceState on replace", async () => {
		const loginRoute: AppRoute = {
			path: "/login",
			pageName: "Login",
			access: "public",
			component: () => null,
		};

		const routes: AppRoute[] = [loginRoute];
		const routeTable = {
			routes,
			routeMap: new Map([["/login", loginRoute]]),
			findRouteByName: (name: string) =>
				routes.find((r) => r.pageName === name),
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
		};

		const replaceStateMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "Login",
				seo: { title: "Login" },
				pageData: null,
			}),
		});

		vi.stubGlobal("window", {
			history: { pushState: vi.fn(), replaceState: replaceStateMock },
			location: {
				assign: vi.fn(),
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
		});

		await router.replace("/login");

		expect(router.route).toEqual(loginRoute);
		expect(replaceStateMock).toHaveBeenCalledWith(
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

	it("degrades to document load on non-2xx response", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			statusText: "Not Found",
		});

		vi.stubGlobal("window", {
			history: { pushState: vi.fn(), replaceState: vi.fn() },
			location: {
				assign: assignMock,
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			fetch: fetchMock as unknown as typeof fetch,
		});

		await router.push("/missing");

		expect(assignMock).toHaveBeenCalledWith("/missing");
		expect(router.route).toBeNull();
	});

	it("degrades to document load on invalid descriptor shape (not an object or missing name)", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => [1, 2, 3], // Array is not a descriptor
		});

		vi.stubGlobal("window", {
			history: { pushState: vi.fn(), replaceState: vi.fn() },
			location: {
				assign: assignMock,
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			fetch: fetchMock as unknown as typeof fetch,
		});

		await router.push("/bad-shape");

		expect(assignMock).toHaveBeenCalledWith("/bad-shape");
		expect(router.route).toBeNull();
	});

	it("degrades to document load when descriptor name is unknown in route table", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				name: "GhostPage",
				seo: null,
				pageData: {},
			}),
		});

		const routeTable = {
			routes: [],
			routeMap: new Map(),
			findRouteByName: () => undefined,
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
		};

		vi.stubGlobal("window", {
			history: { pushState: vi.fn(), replaceState: vi.fn() },
			location: {
				assign: assignMock,
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
		});

		await router.push("/ghost");

		expect(assignMock).toHaveBeenCalledWith("/ghost");
		expect(router.route).toBeNull();
	});

	it("degrades to document load on fetch exception", async () => {
		const assignMock = vi.fn();
		const fetchMock = vi.fn().mockRejectedValue(new Error("Network Error"));

		vi.stubGlobal("window", {
			history: { pushState: vi.fn(), replaceState: vi.fn() },
			location: {
				assign: assignMock,
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			fetch: fetchMock as unknown as typeof fetch,
		});

		await router.push("/offline");

		expect(assignMock).toHaveBeenCalledWith("/offline");
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
		const routeTable = {
			routes,
			routeMap: new Map([
				["/slow", slowRoute],
				["/fast", fastRoute],
			]),
			findRouteByName: (name: string) =>
				routes.find((r) => r.pageName === name),
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
		};

		const { promise: slowPromise, resolve: resolveSlowFetch } =
			Promise.withResolvers<unknown>();

		const pushStateMock = vi.fn();
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

		vi.stubGlobal("window", {
			history: { pushState: pushStateMock, replaceState: vi.fn() },
			location: {
				assign: vi.fn(),
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
		});

		// Start slow navigation
		const slowNavPromise = router.push("/slow");

		// Start fast navigation while slow is still in-flight
		const fastNavPromise = router.push("/fast");

		// Fast completes first
		await fastNavPromise;
		expect(router.route).toEqual(fastRoute);
		expect(usePage<{ speed: string }>()?.speed).toBe("fast");
		expect(pushStateMock).toHaveBeenCalledWith(
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
		// pushState must NOT have been called for /slow
		expect(pushStateMock).not.toHaveBeenCalledWith(null, "", "/slow");
	});

	it("does not trigger fallback if a superseded request fails or rejects", async () => {
		const activeRoute: AppRoute = {
			path: "/active",
			pageName: "Active",
			access: "protected",
			component: () => null,
		};

		const routeTable = {
			routes: [activeRoute],
			routeMap: new Map([["/active", activeRoute]]),
			findRouteByName: (name: string) =>
				name === "Active" ? activeRoute : undefined,
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
		};

		const { promise: slowPromise, reject: rejectSlowFetch } =
			Promise.withResolvers<unknown>();

		const assignMock = vi.fn();
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

		vi.stubGlobal("window", {
			history: { pushState: vi.fn(), replaceState: vi.fn() },
			location: {
				assign: assignMock,
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
		});

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
		expect(assignMock).not.toHaveBeenCalledWith("/stale-slow");
		expect(router.route).toEqual(activeRoute);
	});

	it("updates document.title and meta description from descriptor SEO", async () => {
		const seoRoute: AppRoute = {
			path: "/profile",
			pageName: "Profile",
			access: "protected",
			component: () => null,
		};

		const routeTable = {
			routes: [seoRoute],
			routeMap: new Map([["/profile", seoRoute]]),
			findRouteByName: (name: string) =>
				name === "Profile" ? seoRoute : undefined,
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
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

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			document: mockDoc as unknown as Document,
		});

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

		const routeTable = {
			routes: [settingsRoute],
			routeMap: new Map([["/settings", settingsRoute]]),
			findRouteByName: (name: string) =>
				name === "Settings" ? settingsRoute : undefined,
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
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

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
			document: mockDoc as unknown as Document,
		});

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
		resetNavigationStore();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		resetNavigationStore();
	});

	it("renders not-found (null route) when server declares an unknown page name", () => {
		const homeRoute: AppRoute = {
			path: "/",
			pageName: "Home",
			access: "public",
			component: () => null,
		};

		const routeTable = {
			routes: [homeRoute],
			routeMap: new Map([["/", homeRoute]]),
			findRouteByName: (name: string) =>
				name === "Home" ? homeRoute : undefined,
			findRouteGeneric: () => homeRoute,
			detectGhostRoutes: () => [],
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

		const router = createRouter({
			routeTable,
			document: mockDoc as unknown as Document,
		});

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

		const routeTable = {
			routes: [homeRoute],
			routeMap: new Map([["/", homeRoute]]),
			findRouteByName: (name: string) =>
				name === "Home" ? homeRoute : undefined,
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
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

		const router = createRouter({
			routeTable,
			document: mockDoc as unknown as Document,
		});

		expect(router.route).toEqual(homeRoute);
	});

	it("reactively updates subscribers without a React provider when navigation commits", async () => {
		const homeRoute: AppRoute = {
			path: "/",
			pageName: "Home",
			access: "public",
			component: () => null,
		};
		const aboutRoute: AppRoute = {
			path: "/about",
			pageName: "About",
			access: "public",
			component: () => null,
		};

		const routeTable = {
			routes: [homeRoute, aboutRoute],
			routeMap: new Map([
				["/", homeRoute],
				["/about", aboutRoute],
			]),
			findRouteByName: (name: string) =>
				name === "Home" ? homeRoute : name === "About" ? aboutRoute : undefined,
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
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

		vi.stubGlobal("window", {
			history: { pushState: vi.fn(), replaceState: vi.fn() },
			location: {
				assign: vi.fn(),
				pathname: "/",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/",
			},
		});

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
		});

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
		const routeTable = {
			routes,
			routeMap: new Map([["/dashboard", dashboardRoute]]),
			findRouteByName: (name: string) =>
				routes.find((r) => r.pageName === name),
			findRouteGeneric: () => undefined,
			detectGhostRoutes: () => [],
		};

		let data: unknown = { generation: 1 };
		const fetchMock = vi.fn().mockImplementation(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ name: "Dashboard", pageData: data }),
		}));

		vi.stubGlobal("window", {
			history: { pushState: vi.fn(), replaceState: vi.fn() },
			location: {
				assign: vi.fn(),
				pathname: "/dashboard",
				origin: "http://localhost:3000",
				href: "http://localhost:3000/dashboard",
			},
		});

		const router = createRouter({
			routeTable,
			fetch: fetchMock as unknown as typeof fetch,
		});
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
