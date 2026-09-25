import { vi, type Mock } from "vitest";
import { createRouter, type Router } from "../src/runtime/router.js";
import type { AppRoute, RouteTable } from "../src/runtime/route-table.js";

export interface MockLocation {
	origin: string;
	href: string;
	pathname: string;
	search: string;
	hash: string;
	assign: Mock;
}

export interface RouterHarnessOptions {
	routes?: AppRoute[];
	fetch?: typeof fetch;
	document?: Document;
	location?: Partial<Omit<MockLocation, "assign">>;
	historyState?: unknown;
	scrollX?: number;
	scrollY?: number;
	requestAnimationFrame?: (callback: FrameRequestCallback) => number;
	cancelAnimationFrame?: (handle: number) => void;
}

export interface RouterHarness {
	router: Router;
	location: MockLocation;
	history: {
		state: unknown;
		scrollRestoration: ScrollRestoration;
		pushState: Mock;
		replaceState: Mock;
		back: Mock;
		forward: Mock;
	};
	assign: Mock;
	scrollTo: Mock;
	addEventListener: Mock;
	popstate(state: unknown): Promise<void>;
	scroll(): void;
}

export function createRouterHarness(
	options: RouterHarnessOptions = {},
): RouterHarness {
	const origin = options.location?.origin ?? "http://localhost:3000";
	const pathname = options.location?.pathname ?? "/";
	const assign = vi.fn();
	const location: MockLocation = {
		origin,
		href: options.location?.href ?? `${origin}${pathname}`,
		pathname,
		search: options.location?.search ?? "",
		hash: options.location?.hash ?? "",
		assign,
	};
	const history = {
		state: options.historyState ?? null,
		scrollRestoration: "auto" as ScrollRestoration,
		pushState: vi.fn(),
		replaceState: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
	};
	const popstateListeners = new Set<(event: PopStateEvent) => void>();
	const scrollListeners = new Set<() => void>();
	const addEventListener = vi.fn(
		(event: string, listener: EventListenerOrEventListenerObject) => {
			if (event === "popstate") {
				popstateListeners.add(listener as (event: PopStateEvent) => void);
			}
			if (event === "scroll") {
				scrollListeners.add(listener as () => void);
			}
		},
	);
	const removeEventListener = vi.fn(
		(event: string, listener: EventListenerOrEventListenerObject) => {
			if (event === "popstate") {
				popstateListeners.delete(listener as (event: PopStateEvent) => void);
			}
			if (event === "scroll") {
				scrollListeners.delete(listener as () => void);
			}
		},
	);
	const scrollTo = vi.fn();
	const win = {
		history,
		location,
		scrollX: options.scrollX ?? 0,
		scrollY: options.scrollY ?? 0,
		scrollTo,
		requestAnimationFrame: options.requestAnimationFrame,
		cancelAnimationFrame: options.cancelAnimationFrame,
		addEventListener,
		removeEventListener,
	} as unknown as Window;
	vi.stubGlobal("window", win);

	const routes = options.routes ?? [];
	const routeTable: RouteTable = {
		basePath: "/",
		routes,
		routeMap: Object.fromEntries(
			routes.map((route) => [route.pageName, route.component]),
		),
		findRouteByName: (name) => routes.find((route) => route.pageName === name),
		findRouteGeneric: (path) => routes.find((route) => route.path === path),
		detectGhostRoutes: vi.fn(),
	};
	const fetchMock = (options.fetch ?? vi.fn()) as Mock;
	const router = createRouter({
		routeTable,
		fetch: fetchMock as unknown as typeof fetch,
		window: win,
		document: options.document,
	});

	return {
		router,
		location,
		history,
		assign,
		scrollTo,
		addEventListener,
		popstate: async (state) => {
			for (const listener of popstateListeners) {
				await listener({ state } as PopStateEvent);
			}
		},
		scroll: () => {
			for (const listener of scrollListeners) {
				listener();
			}
		},
	};
}
