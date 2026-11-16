import React, { useSyncExternalStore } from "react";
import { commitNavigation, getNavigationStore } from "./navigation-store.js";
import {
	type AppRoute,
	type RoutePath,
	type RouteTable,
	getActiveRouteTable,
	registerRouteTable,
	withBasePath,
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
/** Marks a head element the registry `seo` owns; the layout emits it too. */
export const SEO_MARKER_ATTRIBUTE = "data-poyo-seo";
/** On `<title>`: the layout's title format, with `%s` for the page title. */
export const TITLE_TEMPLATE_ATTRIBUTE = "data-poyo-title-template";

function quoteSelectorValue(value: string): string {
	return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

/**
 * Makes the head describe the descriptor's route the way the server renders
 * the document for it (`SeoPolicyFilter` + the layout): the title through the
 * layout's template, with the route name when the registry gives none; a
 * description tag only when there is a description; the registry's meta tags
 * (`og:*` as `property`, the rest as `name`); and its JSON-LD. Every element
 * the previous route owned — marked by the layout or by an earlier navigation
 * — is removed first, so nothing of the previous page survives. Returns the
 * page title, for the announcement.
 */
function applyHead(doc: Document, body: PageDescriptor): string {
	const pageTitle = body.seo?.title || body.name;
	const template = doc
		.querySelector?.("title")
		?.getAttribute?.(TITLE_TEMPLATE_ATTRIBUTE);
	doc.title = template?.includes("%s")
		? template.replace("%s", pageTitle)
		: pageTitle;

	if (typeof doc.querySelectorAll === "function") {
		for (const owned of Array.from(
			doc.querySelectorAll(`[${SEO_MARKER_ATTRIBUTE}]`),
		)) {
			owned.remove();
		}
	}

	const canCreate =
		typeof doc.createElement === "function" &&
		typeof doc.head?.appendChild === "function";

	// A layout without markers still has an unmarked tag per key; reuse it
	// rather than adding a second one beside it.
	const upsertMeta = (attribute: "name" | "property", key: string) => {
		let element = doc.querySelector(
			`meta[${attribute}=${quoteSelectorValue(key)}]`,
		);
		if (!element && canCreate) {
			element = doc.createElement("meta");
			element.setAttribute(attribute, key);
			doc.head.appendChild(element);
		}
		element?.setAttribute(SEO_MARKER_ATTRIBUTE, "");
		return element;
	};

	const description = body.seo?.description;
	if (description === undefined || description === null) {
		doc.querySelector('meta[name="description"]')?.remove?.();
	} else {
		upsertMeta("name", "description")?.setAttribute("content", description);
	}

	for (const [key, value] of Object.entries(body.seo?.meta ?? {})) {
		const attribute = key.startsWith("og:") ? "property" : "name";
		upsertMeta(attribute, key)?.setAttribute("content", value);
	}

	const jsonLd = body.seo?.jsonLd;
	if (jsonLd !== undefined && jsonLd !== null && canCreate) {
		const script = doc.createElement("script");
		script.setAttribute("type", "application/ld+json");
		script.setAttribute(SEO_MARKER_ATTRIBUTE, "");
		script.textContent = JSON.stringify(jsonLd);
		doc.head.appendChild(script);
	}

	return pageTitle;
}

function applySeoAndAccessibility(
	doc: Document | undefined,
	body: PageDescriptor,
): void {
	if (!doc) return;

	const title = applyHead(doc, body);

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
			announcer.textContent = title;
		}
	}
}
function saveCurrentScroll(win: Window | undefined): void {
	if (!win?.history) return;
	const currentState = win.history.state;
	if (!isPoyoHistoryState(currentState)) {
		// An entry this router did not write (a fragment entry, another
		// library's entry) still belongs to this document; give it a record.
		adoptCurrentEntry(win);
		return;
	}
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
/**
 * Marks the current history entry as one this router can traverse to, keeping
 * any keys another library stored on it. A no-op when the entry is already
 * marked or the environment refuses the write.
 */
function adoptCurrentEntry(
	win: Window | undefined,
	scroll?: { x: number; y: number },
): void {
	if (!win?.history || isPoyoHistoryState(win.history.state)) return;
	const existing =
		typeof win.history.state === "object" && win.history.state !== null
			? (win.history.state as Record<string, unknown>)
			: {};
	const href = win.location?.href ?? "";
	try {
		win.history.replaceState(
			{
				...existing,
				__poyo: {
					clientNavigated: true,
					scroll: scroll ?? {
						x: win.scrollX ?? win.pageXOffset ?? 0,
						y: win.scrollY ?? win.pageYOffset ?? 0,
					},
					url: href,
				},
			} satisfies PoyoHistoryState,
			"",
			href,
		);
	} catch {
		// A history write the environment refuses leaves the entry cold.
	}
}

/** Whether two URLs name the same resource, ignoring only the fragment. */
function isSameResource(
	previousUrl: string,
	nextUrl: string,
	baseOrigin?: string,
): boolean {
	if (!previousUrl || !nextUrl) return false;
	try {
		const base = baseOrigin ?? "http://localhost";
		const prev = new URL(previousUrl, base);
		const next = new URL(nextUrl, base);
		return (
			prev.origin === next.origin &&
			prev.pathname === next.pathname &&
			prev.search === next.search
		);
	} catch {
		return previousUrl.split("#")[0] === nextUrl.split("#")[0];
	}
}

/** How long a navigation waits for its fragment's element to render. */
const FRAGMENT_WAIT_MS = 5000;

/** The decoded fragment of a URL, or null when it has none. */
function fragmentOf(url: string): string | null {
	const index = url.indexOf("#");
	if (index < 0 || index === url.length - 1) return null;
	const raw = url.slice(index + 1);
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
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
	// A descriptor request is one representation of one resource, so a 3xx means
	// the server declined to serve *this* resource here — it is not a descriptor
	// for some other page. Following the redirect would commit that other page's
	// route, Page data and SEO while history records the URL that was asked for,
	// leaving the address bar and the screen describing different pages. With
	// manual handling the response is an opaque redirect (status 0, not ok), so
	// the check below degrades to a document load of the requested URL. The
	// browser then applies the redirect itself and boots a fresh document, which
	// re-evaluates access server-side and discards the previous session's client
	// state. The cost is a second round trip — the aborted descriptor request plus
	// the document request — and it is the same shape as clicking a plain
	// <a href>.
	const response = await fetchFn(fetchUrl, {
		credentials: "same-origin",
		redirect: "manual",
		headers: {
			[NAVIGATION_HEADER]: NAVIGATION_HEADER_VALUE,
		},
	});
	// `redirect: "manual"` means a real browser cannot hand back a followed
	// redirect, so this is defense for an injected transport that does follow.
	// The invariant is that a descriptor describes the resource that was asked
	// for; a response that reports a redirect describes some other one.
	if (response.redirected === true) return null;
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

	// The URL of the page on screen. Between a traversal's popstate and its
	// commit the browser already points at the destination entry while the
	// outgoing page is still on screen; recording scroll then would write the
	// outgoing page's position into the destination's record. So scroll is
	// recorded only while the current entry names the resource on screen.
	let screenUrl = lastCommittedUrl;
	const recordScroll = () => {
		if (
			isSameResource(
				screenUrl,
				win?.location?.href ?? "",
				win?.location?.origin,
			)
		) {
			saveCurrentScroll(win);
		}
	};

	// The entry this document was loaded into is as much this router's as any
	// it pushes: Back to it is a same-document traversal, so it fires popstate
	// rather than loading a document. Stamping it here gives it the scroll
	// record every other entry has; without it, Back to the landing page found
	// no Poyo state and reloaded the whole document.
	if (store.getRoute()) {
		adoptCurrentEntry(win);
	}

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

	// A descriptor request that cannot be answered hands the decision back to the
	// browser. The document load preserves the history operation the caller
	// asked for, so `push` falls back through `location.assign` and `replace`
	// through `location.replace`: a failed `replace` must not grow the history
	// stack, and a failed `push` must not collapse it. Traversal already passes
	// `true`, because the browser has moved the current history entry to the
	// target, so a document load must settle that entry rather than risk growing
	// or truncating the stack. `replace` is required: a default would let a
	// future call site inherit the wrong operation by omission.
	const fallback = (url: string, token: number, replace: boolean) => {
		if (token !== supersedeToken) return;
		const target = win ?? (typeof window !== "undefined" ? window : undefined);
		const location = target?.location;
		if (!location) return;
		const method = replace ? location.replace : location.assign;
		if (typeof method === "function") {
			method.call(location, url);
		}
	};

	const revealFragment = (id: string, token: number) => {
		const find = () =>
			doc?.getElementById?.(id) ?? doc?.getElementsByName?.(id)?.[0] ?? null;
		const reveal = (element: Element) => element.scrollIntoView?.();
		const watch = () => {
			if (token !== supersedeToken) return;
			const element = find();
			if (element) {
				reveal(element);
				return;
			}
			// The page component is lazy, so its markup can arrive later than
			// the next frame: watch for it, and stop at the next navigation or
			// after a bound, so a missing anchor costs nothing.
			const Observer = (win as (Window & typeof globalThis) | undefined)
				?.MutationObserver;
			if (!Observer || !doc?.body) return;
			const observer = new Observer(() => {
				if (token !== supersedeToken) {
					observer.disconnect();
					return;
				}
				const target = find();
				if (target) {
					observer.disconnect();
					reveal(target);
				}
			});
			observer.observe(doc.body, { childList: true, subtree: true });
			win?.setTimeout?.(() => observer.disconnect(), FRAGMENT_WAIT_MS);
		};
		// The outgoing page may still hold an element with the same id until
		// React commits the new one, so the first look waits a frame.
		if (typeof win?.requestAnimationFrame === "function") {
			win.requestAnimationFrame(watch);
		} else {
			watch();
		}
	};

	const navigate = async (
		requestedUrl: string,
		mode: "push" | "replace",
	): Promise<void> => {
		const currentToken = ++supersedeToken;
		const activeTable = options?.routeTable ?? getActiveRouteTable();
		// Callers speak app-relative paths, as the registry does; the request,
		// the history entry and any fallback use the URL the browser sees.
		const url = withBasePath(requestedUrl, activeTable?.basePath);

		try {
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
				fallback(url, currentToken, mode === "replace");
				return;
			}

			// Save current scroll of the entry we are leaving BEFORE committing new route
			recordScroll();

			// Atomic commit to navigation store
			store.commit({
				route: result.route,
				pageData: result.body.pageData ?? null,
			});

			// Write browser history
			if (win?.history) {
				// `replace` rewrites the current entry, so another library's keys
				// on it survive. `push` creates a new entry: the keys on the entry
				// being left belong to that entry, and copying them forward would
				// hand the new page another page's state (an open modal, a tab).
				const existingState =
					mode === "replace" &&
					typeof win.history.state === "object" &&
					win.history.state !== null
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
				// Both operations show the new page from the top, which is what the
				// entry's fresh scroll record says; a replace that kept the old
				// offset would be restored to the top on the next return to it.
				if (mode === "push") {
					win.history.pushState(newState, "", url);
				} else {
					win.history.replaceState(newState, "", url);
				}
				win.scrollTo?.(0, 0);
			}
			// A target with a fragment then scrolls to its element once the new
			// page has rendered it, as a document load of the same URL would.
			const fragment = fragmentOf(url);
			if (fragment) revealFragment(fragment, currentToken);

			// Apply SEO & accessibility
			applySeoAndAccessibility(doc, result.body);
			lastCommittedUrl = win?.location?.href ?? url;
			screenUrl = lastCommittedUrl;
		} catch {
			fallback(url, currentToken, mode === "replace");
		}
	};

	const onPopState = async (event: PopStateEvent) => {
		const currentHref = win?.location?.href ?? "";
		const targetUrl = win?.location
			? win.location.pathname + win.location.search + win.location.hash ||
				currentHref
			: currentHref;

		const state = event.state ?? win?.history?.state;

		// Not a page change: a hash-only change (the browser owns anchor
		// scrolling), or an entry for the resource already on screen that this
		// router never wrote — another library's in-page state, such as an open
		// modal. That entry is adopted so its scroll is recorded like any other
		// entry this document created. A same-URL entry the router did write (a
		// push to the page already shown) is still a page change: it carries its
		// own Page data and scroll.
		if (
			isHashChangeOnly(lastCommittedUrl, currentHref, win?.location?.origin) ||
			(!isPoyoHistoryState(state) &&
				isSameResource(lastCommittedUrl, currentHref, win?.location?.origin))
		) {
			lastCommittedUrl = currentHref;
			adoptCurrentEntry(win);
			return;
		}

		lastCommittedUrl = currentHref;

		// popstate fires only for entries of this document — an entry of
		// another document is a document load the browser performs itself. So
		// an entry without Poyo state (one another library pushed, or one
		// created before this router was installed) is still traversed through
		// the descriptor; it only lacks a scroll record to restore.
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
				fallback(targetUrl, currentToken, true);
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
			// against the outgoing document's height. An entry with no record
			// shows its page from the top, as a push does, rather than at the
			// outgoing page's offset; adopting it gives it a record from here on.
			const { x, y } = isPoyoHistoryState(state)
				? state.__poyo.scroll
				: { x: 0, y: 0 };
			screenUrl = currentHref;
			if (!isPoyoHistoryState(state)) adoptCurrentEntry(win, { x, y });
			if (typeof win?.requestAnimationFrame === "function") {
				win.requestAnimationFrame(() => win?.scrollTo?.(x, y));
			} else {
				win?.scrollTo?.(x, y);
			}
		} catch {
			fallback(targetUrl, currentToken, true);
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
				recordScroll();
			});
		} else {
			recordScroll();
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
