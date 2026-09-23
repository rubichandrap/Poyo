import React, { useSyncExternalStore } from "react";
import { commitNavigation, getNavigationStore } from "./navigation-store.js";
import {
	type AppRoute,
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
}

let activeRouterInstance: Router | undefined;
let supersedeToken = 0;

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
			if (!fetchFn) {
				fallback(url, currentToken);
				return;
			}

			const response = await fetchFn(url, {
				headers: {
					[NAVIGATION_HEADER]: NAVIGATION_HEADER_VALUE,
				},
			});

			if (currentToken !== supersedeToken) {
				return;
			}

			if (!response.ok) {
				fallback(url, currentToken);
				return;
			}

			let body: unknown;
			try {
				body = await response.json();
			} catch {
				fallback(url, currentToken);
				return;
			}

			if (currentToken !== supersedeToken) {
				return;
			}

			if (!isPageDescriptor(body)) {
				fallback(url, currentToken);
				return;
			}

			const activeTable = options?.routeTable ?? getActiveRouteTable();
			if (!activeTable) {
				fallback(url, currentToken);
				return;
			}

			const resolvedRoute = activeTable.findRouteByName(body.name);
			if (!resolvedRoute) {
				fallback(url, currentToken);
				return;
			}

			if (currentToken !== supersedeToken) {
				return;
			}

			// Atomic commit to navigation store
			store.commit({
				route: resolvedRoute,
				pageData: body.pageData ?? null,
			});

			// Write browser history
			if (win?.history) {
				if (mode === "push") {
					win.history.pushState(null, "", url);
				} else {
					win.history.replaceState(null, "", url);
				}
			}

			// Apply SEO metadata
			if (doc && body.seo) {
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
			} else if (doc && body.name) {
				doc.title = body.name;
			}

			// Shift focus to page region for accessibility
			const pageRegion =
				doc?.querySelector("[data-page-region]") ??
				doc?.querySelector("main") ??
				doc?.getElementById("react-root");
			if (
				pageRegion &&
				typeof (pageRegion as HTMLElement).focus === "function"
			) {
				if (!pageRegion.hasAttribute("tabindex")) {
					pageRegion.setAttribute("tabindex", "-1");
				}
				(pageRegion as HTMLElement).focus({ preventScroll: true });
			}

			// Announce swap via live region for assistive tech
			if (doc?.body) {
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
		} catch {
			fallback(url, currentToken);
		}
	};

	const router: Router = {
		get route() {
			return store.getRoute();
		},
		push(url: string) {
			return navigate(url, "push");
		},
		replace(url: string) {
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
	};

	setActiveRouter(router);
	return router;
}

export function useRouter(): Router {
	const router = getActiveRouter();
	const store = getNavigationStore();

	const currentRoute = useSyncExternalStore(
		store.subscribe,
		store.getRoute,
		() => null,
	);

	return {
		route: currentRoute,
		push: router.push,
		replace: router.replace,
		back: router.back,
		forward: router.forward,
	};
}
