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
	replace: Mock;
}

export interface RouterHarnessOptions {
	routes?: AppRoute[];
	fetch?: typeof fetch;
	document?: Document;
	location?: Partial<Omit<MockLocation, "assign" | "replace">>;
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
	replaceLocation: Mock;
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
	const replaceLocation = vi.fn();
	const location: MockLocation = {
		origin,
		href: options.location?.href ?? `${origin}${pathname}`,
		pathname,
		search: options.location?.search ?? "",
		hash: options.location?.hash ?? "",
		assign,
		replace: replaceLocation,
	};

	// A real browser updates the current history entry's state and the address
	// bar synchronously inside pushState/replaceState. Modelling that is what
	// makes the router's state merge and lastCommittedUrl observable here.
	// The signature matters: history.pushState(state, title, url) is the
	// browser-standard 3-argument form the router uses, so the URL is the third
	// argument. A two-parameter signature silently binds it to the title and
	// never writes the address bar — see createRouterHarness's own tests.
	//
	// Known under-model: the browser throws a SecurityError when pushState is
	// given a cross-origin URL; `new URL` here accepts it. Not exercised today
	// because Link and the router only navigate same-origin paths.
	const applyHistoryWrite = (
		state: unknown,
		_title?: unknown,
		url?: string | null,
	) => {
		history.state = (state ?? null) as History["state"];
		if (typeof url === "string") {
			const next = new URL(url, location.href);
			location.href = next.href;
			location.pathname = next.pathname;
			location.search = next.search;
			location.hash = next.hash;
		}
	};

	const history = {
		state: options.historyState ?? null,
		scrollRestoration: "auto" as ScrollRestoration,
		pushState: vi.fn(applyHistoryWrite),
		replaceState: vi.fn(applyHistoryWrite),
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
		replaceLocation,
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
