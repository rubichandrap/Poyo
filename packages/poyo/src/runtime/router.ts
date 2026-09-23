import React, { useSyncExternalStore } from "react";
import { commitNavigation, getNavigationStore } from "./navigation-store.js";
import {
	type AppRoute,
	type RoutePath,
	type RouteTable,
	getActiveRouteTable,
	registerRouteTable,
} from "./route-table.js";

export const NAVIGATION_HEADER = "X-Poyo-Navigation";
export const NAVIGATION_HEADER_VALUE = "1";

export interface PageDescriptor {
	name: string;
	seo?: {
		title?: string | null;
		description?: string | null;
		meta?: Record<string, string> | null;
		jsonLd?: unknown;
	} | null;
	pageData?: unknown;
}

export function isPageDescriptor(value: unknown): value is PageDescriptor {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return typeof candidate.name === "string" && candidate.name.length > 0;
}
export interface PoyoHistoryState {
	__poyo: {
		clientNavigated: boolean;
		scroll: {
			x: number;
			y: number;
		};
		url?: string;
	};
	[key: string]: unknown;
}

export function isPoyoHistoryState(state: unknown): state is PoyoHistoryState {
	if (typeof state !== "object" || state === null) {
		return false;
	}
	const candidate = state as Record<string, unknown>;
	const poyo = candidate.__poyo;
	if (typeof poyo !== "object" || poyo === null) {
		return false;
	}
	const poyoObj = poyo as Record<string, unknown>;
	if (poyoObj.clientNavigated !== true) {
		return false;
	}
	if (typeof poyoObj.scroll !== "object" || poyoObj.scroll === null) {
		return false;
	}
	const scroll = poyoObj.scroll as Record<string, unknown>;
	return typeof scroll.x === "number" && typeof scroll.y === "number";
}

export interface RouterOptions {
	routeTable?: RouteTable;
	fetch?: typeof fetch;
	window?: Window;
	document?: Document;
}

export interface Router {
	readonly route: AppRoute | null;
	push(url: string): Promise<void>;
	replace(url: string): Promise<void>;
	back(): void;
	forward(): void;
	destroy?(): void;
}

let activeRouterInstance: Router | undefined;

export function getActiveRouter(): Router {
	if (!activeRouterInstance) {
		activeRouterInstance = createRouter();
	}
	return activeRouterInstance;
}

export function setActiveRouter(router: Router | undefined): void {
	activeRouterInstance = router;
}

function resolveInitialRoute(
	routeTable: RouteTable | undefined,
	win: Window | undefined,
	doc: Document | undefined,
): AppRoute | null {
	if (!routeTable) return null;

	const targetDoc =
		doc ?? (typeof document !== "undefined" ? document : undefined);
	const targetWin = win ?? (typeof window !== "undefined" ? window : undefined);

	const rootEl = targetDoc?.getElementById("react-root");
	const serverPageName =
		rootEl?.dataset?.pageName ??
		(typeof rootEl?.getAttribute === "function"
			? rootEl.getAttribute("data-page-name")
			: undefined);

	if (serverPageName) {
		const matched = routeTable.findRouteByName(serverPageName);
		return matched ?? null;
	}

	if (targetWin?.location?.pathname) {
		return routeTable.findRouteGeneric(targetWin.location.pathname) ?? null;
	}

	return null;
}
function applySeoAndAccessibility(
	doc: Document | undefined,
	body: PageDescriptor,
): void {
	if (!doc) return;

	// Apply SEO metadata
	if (body.seo) {
		if (body.seo.title) {
			doc.title = body.seo.title;
		}
		if (body.seo.description !== undefined) {
			let descEl = doc.querySelector('meta[name="description"]');
			if (!descEl && doc.createElement && doc.head?.appendChild) {
				descEl = doc.createElement("meta");
				descEl.setAttribute("name", "description");
				doc.head.appendChild(descEl);
			}
			if (descEl) {
				descEl.setAttribute("content", body.seo.description ?? "");
			}
		}
	} else if (body.name) {
		doc.title = body.name;
	}

	// Shift focus to page region for accessibility
	const pageRegion =
		doc.querySelector("[data-page-region]") ??
		doc.querySelector("main") ??
		doc.getElementById("react-root");
	if (pageRegion && typeof (pageRegion as HTMLElement).focus === "function") {
		if (!pageRegion.hasAttribute("tabindex")) {
			pageRegion.setAttribute("tabindex", "-1");
		}
		(pageRegion as HTMLElement).focus({ preventScroll: true });
	}

	// Announce swap via live region for assistive tech
	if (doc.body) {
		let announcer = doc.getElementById("poyo-announcer");
		if (!announcer && doc.createElement && doc.body.appendChild) {
			announcer = doc.createElement("div");
			announcer.id = "poyo-announcer";
			announcer.setAttribute("aria-live", "polite");
			announcer.setAttribute("aria-atomic", "true");
			announcer.setAttribute(
				"style",
				"position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;",
			);
			doc.body.appendChild(announcer);
		}
		if (announcer) {
			const titleToAnnounce = body.seo?.title ?? body.name;
			announcer.textContent = titleToAnnounce;
		}
	}
}
function saveCurrentScroll(win: Window | undefined): void {
	if (!win?.history) return;
	const currentState = win.history.state;
	if (isPoyoHistoryState(currentState)) {
		const x = win.scrollX ?? win.pageXOffset ?? 0;
		const y = win.scrollY ?? win.pageYOffset ?? 0;
		if (
			currentState.__poyo.scroll.x !== x ||
			currentState.__poyo.scroll.y !== y
		) {
			win.history.replaceState(
				{
					...currentState,
					__poyo: {
						...currentState.__poyo,
						scroll: { x, y },
					},
				},
				"",
				win.location?.href ?? "",
			);
		}
	}
}
export function isHashChangeOnly(
	previousUrl: string,
	nextUrl: string,
	baseOrigin?: string,
): boolean {
	if (!previousUrl || !nextUrl) return false;
	try {
		const base =
			baseOrigin ??
			(typeof window !== "undefined" && window.location?.origin
				? window.location.origin
				: "http://localhost");
		const prevUrl = new URL(previousUrl, base);
		const nextUrlObj = new URL(nextUrl, base);
		return (
			prevUrl.origin === nextUrlObj.origin &&
			prevUrl.pathname === nextUrlObj.pathname &&
			prevUrl.search === nextUrlObj.search &&
			prevUrl.hash !== nextUrlObj.hash
		);
	} catch {
		const stripHash = (s: string) => s.split("#")[0];
		return (
			stripHash(previousUrl) === stripHash(nextUrl) && previousUrl !== nextUrl
		);
	}
}

async function fetchAndResolveDescriptor(
	fetchFn: typeof fetch | undefined,
	url: string,
	token: number,
	routeTable: RouteTable | undefined,
	getSupercedeToken: () => number,
): Promise<{ route: AppRoute; body: PageDescriptor } | null> {
	if (!fetchFn || !routeTable) return null;
	const fetchUrl = url.split("#")[0] || url;
	const response = await fetchFn(fetchUrl, {
		headers: {
			[NAVIGATION_HEADER]: NAVIGATION_HEADER_VALUE,
		},
	});
	if (token !== getSupercedeToken() || !response.ok) return null;
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return null;
	}
	if (token !== getSupercedeToken() || !isPageDescriptor(body)) return null;
	const resolvedRoute = routeTable.findRouteByName(body.name);
	if (!resolvedRoute || token !== getSupercedeToken()) return null;
	return { route: resolvedRoute, body };
}

export function createRouter(options?: RouterOptions): Router {
	if (options?.routeTable) {
		registerRouteTable(options.routeTable);
	}
	const win =
		options?.window ?? (typeof window !== "undefined" ? window : undefined);
	const doc =
		options?.document ??
		(typeof document !== "undefined" ? document : undefined);
	const fetchFn =
		options?.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);
	const routeTable = options?.routeTable ?? getActiveRouteTable();

	const store = getNavigationStore();

	// Last-write-wins state is per instance: a second router must not supersede
	// the first one's in-flight descriptor requests.
	let supersedeToken = 0;

	// Initialize route in navigation store if not already set
	if (!store.getRoute()) {
		const initialRoute = resolveInitialRoute(routeTable, win, doc);
		if (initialRoute) {
			store.commit({
				route: initialRoute,
				pageData: store.getPageData(),
			});
		}
	}
	let lastCommittedUrl = win?.location?.href ?? "";

	// The browser's own restoration is disabled while this router is installed;
	// destroy() puts the previous value back.
	const previousScrollRestoration =
		win?.history && "scrollRestoration" in win.history
			? win.history.scrollRestoration
			: undefined;
	if (win?.history && "scrollRestoration" in win.history) {
		try {
			win.history.scrollRestoration = "manual";
		} catch {
			// Ignore in environments where setting scrollRestoration throws
		}
	}

	const fallback = (url: string, token: number) => {
		if (token !== supersedeToken) return;
		if (win?.location?.assign) {
			win.location.assign(url);
		} else if (typeof window !== "undefined" && window.location?.assign) {
			window.location.assign(url);
		}
	};

	const navigate = async (
		url: string,
		mode: "push" | "replace",
	): Promise<void> => {
		const currentToken = ++supersedeToken;

		try {
			const activeTable = options?.routeTable ?? getActiveRouteTable();
			const result = await fetchAndResolveDescriptor(
				fetchFn,
				url,
				currentToken,
				activeTable,
				() => supersedeToken,
			);

			if (currentToken !== supersedeToken) {
				return;
			}

			if (!result) {
				fallback(url, currentToken);
				return;
			}

			// Save current scroll of the entry we are leaving BEFORE committing new route
			saveCurrentScroll(win);

			// Atomic commit to navigation store
			store.commit({
				route: result.route,
				pageData: result.body.pageData ?? null,
			});

			// Write browser history
			if (win?.history) {
				const existingState =
					typeof win.history.state === "object" && win.history.state !== null
						? win.history.state
						: {};
				const newState: PoyoHistoryState = {
					...existingState,
					__poyo: {
						clientNavigated: true,
						scroll: { x: 0, y: 0 },
						url,
					},
				};
				if (mode === "push") {
					win.history.pushState(newState, "", url);
					win.scrollTo?.(0, 0);
				} else {
					win.history.replaceState(newState, "", url);
				}
			}

			// Apply SEO & accessibility
			applySeoAndAccessibility(doc, result.body);
			lastCommittedUrl = win?.location?.href ?? url;
		} catch {
			fallback(url, currentToken);
		}
	};

	const onPopState = async (event: PopStateEvent) => {
		const currentHref = win?.location?.href ?? "";
		const targetUrl = win?.location
			? win.location.pathname + win.location.search + win.location.hash ||
				currentHref
			: currentHref;

		// Hash-only changes keep native anchor behavior
		if (
			isHashChangeOnly(lastCommittedUrl, currentHref, win?.location?.origin)
		) {
			lastCommittedUrl = currentHref;
			return;
		}

		lastCommittedUrl = currentHref;
		const state = event.state ?? win?.history?.state;
		if (!isPoyoHistoryState(state)) {
			const currentToken = ++supersedeToken;
			fallback(targetUrl, currentToken);
			return;
		}

		const currentToken = ++supersedeToken;

		try {
			const activeTable = options?.routeTable ?? getActiveRouteTable();
			const result = await fetchAndResolveDescriptor(
				fetchFn,
				targetUrl,
				currentToken,
				activeTable,
				() => supersedeToken,
			);

			if (currentToken !== supersedeToken) {
				return;
			}

			if (!result) {
				fallback(targetUrl, currentToken);
				return;
			}

			// Atomic commit to navigation store
			store.commit({
				route: result.route,
				pageData: result.body.pageData ?? null,
			});

			// Apply SEO & accessibility
			applySeoAndAccessibility(doc, result.body);

			// Restore the stored scroll position after the browser has had a
			// chance to render the destination — restoring synchronously clamps
			// against the outgoing document's height.
			if (state.__poyo?.scroll) {
				const { x, y } = state.__poyo.scroll;
				if (typeof win?.requestAnimationFrame === "function") {
					win.requestAnimationFrame(() => win?.scrollTo?.(x, y));
				} else {
					win?.scrollTo?.(x, y);
				}
			}
		} catch {
			fallback(targetUrl, currentToken);
		}
	};

	let scrollRafId: number | undefined;
	const onScroll = () => {
		if (typeof win?.requestAnimationFrame === "function") {
			if (
				scrollRafId !== undefined &&
				typeof win.cancelAnimationFrame === "function"
			) {
				win.cancelAnimationFrame(scrollRafId);
			}
			scrollRafId = win.requestAnimationFrame(() => {
				scrollRafId = undefined;
				saveCurrentScroll(win);
			});
		} else {
			saveCurrentScroll(win);
		}
	};
	win?.addEventListener?.("scroll", onScroll);

	win?.addEventListener?.("popstate", onPopState);

	const router: Router = {
		get route() {
			return store.getRoute();
		},
		push(url: RoutePath | (string & {})) {
			return navigate(url, "push");
		},
		replace(url: RoutePath | (string & {})) {
			return navigate(url, "replace");
		},
		back() {
			if (win?.history?.back) {
				win.history.back();
			}
		},
		forward() {
			if (win?.history?.forward) {
				win.history.forward();
			}
		},
		destroy() {
			win?.removeEventListener?.("popstate", onPopState);
			win?.removeEventListener?.("scroll", onScroll);
			if (
				scrollRafId !== undefined &&
				typeof win?.cancelAnimationFrame === "function"
			) {
				win.cancelAnimationFrame(scrollRafId);
			}
			// The browser's own restoration comes back with the router.
			if (win?.history && "scrollRestoration" in win.history) {
				try {
					win.history.scrollRestoration = previousScrollRestoration ?? "auto";
				} catch {
					// Ignore in environments where setting scrollRestoration throws
				}
			}
			if (activeRouterInstance === router) {
				activeRouterInstance = undefined;
			}
		},
	};

	// The newest router serves Link and useRouter; a second createRouter() in
	// the same page is a caller mistake (its listeners would duplicate this
	// one's), but the per-instance supersede token keeps the two navigations
	// from superseding each other.
	setActiveRouter(router);
	return router;
}

export function useRouter(): Router {
	const router = getActiveRouter();
	const store = getNavigationStore();

	// Snapshot the whole navigation state, not just the route: page data can
	// change while the route object stays identical (a push back to the route
	// already mounted), and only a changed snapshot re-renders the page so
	// `usePage` sees the fresh data.
	const currentState = useSyncExternalStore(
		store.subscribe,
		store.getState,
		() => null,
	);
	const currentRoute = currentState?.route ?? null;

	return {
		route: currentRoute,
		push: router.push,
		replace: router.replace,
		back: router.back,
		forward: router.forward,
	};
}
