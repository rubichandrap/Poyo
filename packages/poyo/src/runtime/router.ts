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

/**
 * The newest descriptor format this runtime understands (wire contract). A
 * descriptor declaring a newer `v` is refused, which sends the navigation to
 * its document-load floor rather than misreading the payload. A descriptor
 * without `v` predates versioning and is read as version 1.
 */
export const DESCRIPTOR_VERSION = 1;

export interface PageDescriptor {
	v?: number;
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
	if (
		candidate.v !== undefined &&
		(typeof candidate.v !== "number" ||
			!Number.isInteger(candidate.v) ||
			candidate.v < 1 ||
			candidate.v > DESCRIPTOR_VERSION)
	) {
		return false;
	}
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
		/**
		 * Identifies the entry within this document's session history, so its
		 * scroll position can be remembered outside history state (which can
		 * no longer be written once the address bar has moved past the entry).
		 * Absent on entries written by a 0.5.1 or older runtime.
		 */
		key?: string;
	};
	[key: string]: unknown;
}

// A random prefix keeps keys of this document apart from keys an earlier
// document wrote into the same entries before a reload.
const ENTRY_KEY_PREFIX = Math.random().toString(36).slice(2, 10);
let entryKeySequence = 0;

/** A key no other entry of this session history carries. */
function newEntryKey(): string {
	entryKeySequence += 1;
	return `${ENTRY_KEY_PREFIX}.${entryKeySequence}`;
}

/** The entry key a history state carries, if the router wrote one. */
function entryKeyOf(state: unknown): string | undefined {
	if (!isPoyoHistoryState(state)) return undefined;
	return typeof state.__poyo.key === "string" ? state.__poyo.key : undefined;
}

/** The window's scroll position. */
function readScroll(win: Window | undefined): { x: number; y: number } {
	return {
		x: win?.scrollX ?? win?.pageXOffset ?? 0,
		y: win?.scrollY ?? win?.pageYOffset ?? 0,
	};
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
		currentState.__poyo.scroll.y !== y ||
		currentState.__poyo.key === undefined
	) {
		win.history.replaceState(
			{
				...currentState,
				__poyo: {
					...currentState.__poyo,
					scroll: { x, y },
					key: currentState.__poyo.key ?? newEntryKey(),
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
					scroll: scroll ?? readScroll(win),
					url: href,
					key: newEntryKey(),
				},
			} satisfies PoyoHistoryState,
			"",
			href,
		);
	} catch {
		// A history write the environment refuses leaves the entry cold.
	}
}

/**
 * The current entry's key, adopting the entry or adding a key to an entry an
 * older runtime wrote, so every entry the router looks at can be remembered.
 */
function ensureEntryKey(win: Window | undefined): string | undefined {
	if (!win?.history) return undefined;
	adoptCurrentEntry(win);
	const state = win.history.state;
	const existing = entryKeyOf(state);
	if (existing || !isPoyoHistoryState(state)) return existing;
	const key = newEntryKey();
	try {
		win.history.replaceState(
			{ ...state, __poyo: { ...state.__poyo, key } },
			"",
			win.location?.href ?? "",
		);
	} catch {
		return undefined;
	}
	return key;
}

/**
 * Whether a navigation target is a fragment of the document on screen: the
 * same resource as the current URL, with a fragment. Such a target is the
 * browser's own fragment navigation, as an in-page `<a href="#x">` is.
 */
function isFragmentOfCurrent(url: string, win: Window | undefined): boolean {
	const current = win?.location?.href;
	if (!current) return false;
	try {
		const target = new URL(url, current);
		return target.hash !== "" && isSameResource(current, target.href);
	} catch {
		return false;
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
	// Between a traversal's popstate and its commit, nothing is recorded:
	// whatever the screen shows then is not yet the destination entry's page
	// (ADR 0019 decision 4), even when it happens to share the URL — a Forward
	// back onto the page still on screen restores where it was left.
	let traversing = false;
	const recordScroll = () => {
		if (traversing) return;
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

	// Scroll positions by entry key, written on every scroll event while the
	// entry's page is on screen, and taken from the viewport at popstate for
	// the entry being left. History state keeps a record too, written on a
	// frame, so it survives a reload; but it cannot be written once the
	// address bar has moved past the entry, which lost the last position when
	// an entry was left within a frame of the last scroll (ADR 0019).
	const scrollMemory = new Map<string, { x: number; y: number }>();
	// The entry the browser is on, as of the router's last look at it.
	let currentKey = entryKeyOf(win?.history?.state);
	const rememberScroll = () => {
		if (traversing) return;
		if (
			!isSameResource(
				screenUrl,
				win?.location?.href ?? "",
				win?.location?.origin,
			)
		) {
			return;
		}
		const key = ensureEntryKey(win);
		if (key) {
			currentKey = key;
			scrollMemory.set(key, readScroll(win));
		}
	};

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
		// A URL with a fragment that names the resource already in the address
		// bar is a fragment navigation, not a document load (HTML "navigate":
		// same URL ignoring fragments, fragment non-null). That is the traversal
		// case — the browser has already moved to the entry — and assign or
		// replace would scroll and leave the previous page on screen. Reloading
		// loads the entry's document in place, without touching history.
		// Pinned in Chromium by scripts/platform-facts.test.mjs.
		if (
			url.includes("#") &&
			typeof location.reload === "function" &&
			isSameResource(location.href, url, location.origin)
		) {
			location.reload();
			return;
		}
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
		const activeTable = options?.routeTable ?? getActiveRouteTable();
		// Callers speak app-relative paths, as the registry does; the request,
		// the history entry and any fallback use the URL the browser sees.
		const url = withBasePath(requestedUrl, activeTable?.basePath);

		// A fragment of the page on screen is not a page change. The browser
		// performs it natively — scroll to the element, a history entry for
		// push or none for replace, popstate for the router to adopt — exactly
		// as for an in-page anchor, which `Link` already leaves native. It does
		// not supersede a navigation in flight, for the same reason.
		if (isFragmentOfCurrent(url, win)) {
			const location = win?.location;
			const method = mode === "replace" ? location?.replace : location?.assign;
			if (location && typeof method === "function") {
				method.call(location, url);
			}
			return;
		}

		const currentToken = ++supersedeToken;
		// A navigation supersedes any traversal in flight.
		traversing = false;

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
			rememberScroll();
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
				const key = newEntryKey();
				const newState: PoyoHistoryState = {
					...existingState,
					__poyo: {
						clientNavigated: true,
						scroll: { x: 0, y: 0 },
						url,
						key,
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
				currentKey = key;
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

		// The entry being left. Its page is still on screen when popstate
		// fires — with manual scroll restoration the browser has not moved the
		// viewport — so its position is read now, the last moment it can be.
		// Only when the screen shows that entry: mid-traversal the screen
		// shows an earlier page, whose position this is not.
		const outgoingKey = currentKey;
		const outgoingOnScreen = isSameResource(
			screenUrl,
			lastCommittedUrl,
			win?.location?.origin,
		);
		const captureOutgoing = () => {
			if (outgoingKey && outgoingOnScreen) {
				scrollMemory.set(outgoingKey, readScroll(win));
			}
		};

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
			// Traversing to an entry the router knows, the browser does not
			// scroll; a new fragment entry may already have scrolled to its
			// element, so the position read now would be the destination's.
			if (isPoyoHistoryState(state)) captureOutgoing();
			lastCommittedUrl = currentHref;
			adoptCurrentEntry(win);
			currentKey = entryKeyOf(win?.history?.state);
			return;
		}

		captureOutgoing();
		lastCommittedUrl = currentHref;
		currentKey = entryKeyOf(state);

		// popstate fires only for entries of this document — an entry of
		// another document is a document load the browser performs itself. So
		// an entry without Poyo state (one another library pushed, or one
		// created before this router was installed) is still traversed through
		// the descriptor; it only lacks a scroll record to restore.
		const currentToken = ++supersedeToken;
		traversing = true;

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
			traversing = false;
			const targetKey = entryKeyOf(state);
			const { x, y } =
				(targetKey ? scrollMemory.get(targetKey) : undefined) ??
				(isPoyoHistoryState(state) ? state.__poyo.scroll : { x: 0, y: 0 });
			screenUrl = currentHref;
			if (!isPoyoHistoryState(state)) adoptCurrentEntry(win, { x, y });
			// Read, not ensured: a traversal writes no history of its own. An
			// entry an older runtime wrote gains a key on its first scroll.
			currentKey = entryKeyOf(win?.history?.state);
			if (typeof win?.requestAnimationFrame === "function") {
				// A navigation that commits before this frame owns the viewport:
				// restoring now would scroll its page to this entry's offset, and
				// the scroll listener would then record that offset as its own.
				win.requestAnimationFrame(() => {
					if (currentToken !== supersedeToken) return;
					win?.scrollTo?.(x, y);
				});
			} else {
				win?.scrollTo?.(x, y);
			}
		} catch {
			fallback(targetUrl, currentToken, true);
		}
	};

	let scrollRafId: number | undefined;
	const onScroll = () => {
		rememberScroll();
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
