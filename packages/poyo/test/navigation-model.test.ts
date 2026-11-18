/**
 * Explicit-state model check of the dynamic-navigation runtime.
 *
 * The real `createRouter` runs against a simulated browser that models the
 * parts of the HTML history semantics the router depends on:
 *
 * - every session-history entry belongs to a document; traversal between two
 *   entries of the current document fires `popstate`, traversal to an entry
 *   of another document is a document load;
 * - `pushState` truncates forward entries; `replaceState` rewrites in place;
 * - a native fragment navigation (an in-page `<a href="#x">`) appends a
 *   same-document entry with a null state and fires `popstate`;
 * - `location.assign` / `location.replace` are document loads that push or
 *   replace the current entry, and end the run;
 * - `requestAnimationFrame` callbacks wait for the next frame, which is its
 *   own event: a descriptor answered quickly can commit before it.
 *
 * Descriptor requests are deferred, so the checker controls when each one is
 * answered and whether it succeeds. Every event sequence up to a depth bound
 * is enumerated, and the invariants below are checked after every step. A
 * violation reports the shortest event sequence that produces it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getNavigationStore,
	resetNavigationStore,
} from "../src/runtime/navigation-store.js";
import {
	type Router,
	createRouter,
	setActiveRouter,
} from "../src/runtime/router.js";
import {
	type AppRoute,
	type RouteTable,
	clearActiveRouteTable,
} from "../src/runtime/route-table.js";

const ORIGIN = "http://poyo.test";

/** The registry the model's browser serves, by path. */
const PAGE_NAMES: Record<string, string> = {
	"/": "Home",
	"/a": "A",
	"/b": "B",
	"/c": "C",
};

/** Routes the registry marks `dynamic: false`: a document load, never a swap. */
const NON_DYNAMIC_PATHS = new Set(["/c"]);

/** A page module the router is waiting for. */
interface PendingPage {
	path: string;
	mode: "push" | "replace" | "traverse";
	/**
	 * The descriptor-request generation that asked for it. A newer request
	 * (any push, replace or traversing popstate) supersedes the page load.
	 */
	request: number;
	resolve: () => void;
	reject: (error: unknown) => void;
}

interface Entry {
	url: URL;
	state: unknown;
	doc: number;
	/** The scroll position the browser leaves this entry at (model truth). */
	leftAt: number;
}

interface Pending {
	path: string;
	epoch: number;
	mode: "push" | "replace" | "traverse";
	/** The controller signal the router handed the transport. */
	signal: AbortSignal | null | undefined;
	resolve: (response: Response) => void;
	reject: (error: unknown) => void;
}

type Terminal = {
	kind: "assign" | "replace" | "reload";
	url: string;
	during: string;
};

class SimBrowser {
	entries: Entry[];
	index = 0;
	readonly doc = 0;
	scrollY = 0;
	terminal: Terminal | null = null;
	pending: Pending[] = [];
	/** Set by the destroy event; the router no longer owns the screen. */
	destroyed = false;
	epoch = 0;
	/** The event currently being dispatched, for classifying document loads. */
	during = "boot";
	/** Set while a same-document traversal's popstate is dispatched. */
	traversalTarget: Entry | null = null;
	lastNavKind: "push" | "replace" | "traverse" | "hash" | null = null;
	/** The entry the latest cross-path traversal moved to, until a navigation. */
	traversedTo: Entry | null = null;
	/**
	 * Whether that entry carried a router scroll record when the traversal
	 * started. An entry another library pushed and the user never scrolled on
	 * gives the router no moment to record it (pushState has no event), so
	 * the documented behavior for it is "shown from the top".
	 */
	traversedToRecorded = false;
	violations: string[] = [];
	/** Queued animation-frame callbacks, with the store state they saw. */
	frames = new Map<number, { cb: FrameRequestCallback; queuedAt: unknown }>();
	private nextFrame = 1;
	/** I3, pending until the traversal's restore frame has run. */
	restoreCheck: { target: Entry; expected: number } | null = null;
	/** Page modules already in memory, keyed by route path. */
	readonly pagesLoaded = new Set<string>();
	/** Page modules the router is waiting for, oldest first. */
	pendingPages: PendingPage[] = [];
	/** Descriptor requests started: the router's supersede counter, observed. */
	descriptorRequests = 0;
	/** The operation of the descriptor response being consumed, for page loads. */
	pageMode: PendingPage["mode"] | null = null;
	readonly routes: AppRoute[];
	readonly routeTable: RouteTable;

	private popListeners = new Set<(e: PopStateEvent) => void>();
	private scrollListeners = new Set<() => void>();
	readonly window: Window;

	constructor(initialPath: string) {
		this.entries = [
			{ url: new URL(initialPath, ORIGIN), state: null, doc: 0, leftAt: 0 },
		];
		const sim = this;
		const location = {
			get href() {
				return sim.current.url.href;
			},
			get origin() {
				return ORIGIN;
			},
			get pathname() {
				return sim.current.url.pathname;
			},
			get search() {
				return sim.current.url.search;
			},
			get hash() {
				return sim.current.url.hash;
			},
			assign: (url: string) => sim.documentLoad("assign", url),
			replace: (url: string) => sim.documentLoad("replace", url),
			reload: () => sim.documentLoad("reload", sim.current.url.href),
		};
		const history = {
			get state() {
				return sim.current.state;
			},
			get length() {
				return sim.entries.length;
			},
			scrollRestoration: "auto",
			pushState: (state: unknown, _t: string, url?: string | null) => {
				const next = new URL(url ?? sim.current.url.href, sim.current.url);
				if (next.origin !== ORIGIN) throw new Error("SecurityError");
				const keys = Object.keys((state ?? {}) as object);
				if (keys.includes("__poyo") && keys.length > 1) {
					sim.violations.push(
						`STATE-LEAK: a pushed entry carries another entry's keys (${keys.join(", ")})`,
					);
				}
				// The router records the entry it leaves synchronously before its
				// own pushState; another library's push gives it no such moment.
				if (sim.settled) sim.leave(sim.current);
				sim.entries = sim.entries.slice(0, sim.index + 1);
				sim.entries.push({
					url: next,
					state: structuredClone(state),
					doc: sim.doc,
					leftAt: 0,
				});
				sim.index++;
			},
			replaceState: (state: unknown, _t: string, url?: string | null) => {
				const next = new URL(url ?? sim.current.url.href, sim.current.url);
				if (next.origin !== ORIGIN) throw new Error("SecurityError");
				sim.current.url = next;
				sim.current.state = structuredClone(state);
			},
			back: () => sim.traverse(-1),
			forward: () => sim.traverse(1),
		};
		this.window = {
			location,
			history,
			get scrollX() {
				return 0;
			},
			get scrollY() {
				return sim.scrollY;
			},
			scrollTo: (_x: number, y: number) => {
				sim.scrollY = y;
			},
			requestAnimationFrame: (cb: FrameRequestCallback) => {
				const id = sim.nextFrame++;
				sim.frames.set(id, {
					cb,
					queuedAt: getNavigationStore().getState(),
				});
				return id;
			},
			cancelAnimationFrame: (id: number) => {
				sim.frames.delete(id);
			},
			addEventListener: (type: string, fn: () => void) => {
				if (type === "popstate") sim.popListeners.add(fn);
				if (type === "scroll") sim.scrollListeners.add(fn);
			},
			removeEventListener: (type: string, fn: () => void) => {
				if (type === "popstate") sim.popListeners.delete(fn);
				if (type === "scroll") sim.scrollListeners.delete(fn);
			},
		} as unknown as Window;
		this.routes = Object.entries(PAGE_NAMES).map(([path, pageName]) =>
			this.makeRoute(path, pageName),
		);
		this.routeTable = {
			basePath: "/",
			routes: this.routes,
			routeMap: Object.fromEntries(
				this.routes.map((r) => [r.pageName, r.component]),
			),
			findRouteByName: (name) => this.routes.find((r) => r.pageName === name),
			findRouteGeneric: (path) => this.routes.find((r) => r.path === path),
			detectGhostRoutes: () => undefined,
		};
	}

	private makeRoute(path: string, pageName: string): AppRoute {
		return {
			path,
			pageName,
			access: "public",
			component: () => null,
			preload: () => this.preloadPage(path),
			dynamic: !NON_DYNAMIC_PATHS.has(path),
		};
	}

	/**
	 * A page module load: instant once the module is in memory, otherwise a
	 * request the checker answers with `pageOk` or `pageFail`. The real route
	 * table shares one promise per route; per-navigation pending records are
	 * behaviourally equivalent here, because a single result settles them all.
	 */
	private preloadPage(path: string): Promise<void> {
		if (this.pagesLoaded.has(path)) return Promise.resolve();
		const mode = this.pageMode ?? "traverse";
		this.pageMode = null;
		return new Promise<void>((resolve, reject) => {
			this.pendingPages.push({
				path,
				mode,
				request: this.descriptorRequests,
				resolve,
				reject,
			});
		});
	}

	/**
	 * Whether the page on screen is the current entry's page. The oracle only
	 * credits a scroll position to an entry while it is; mid-traversal the
	 * user is scrolling the outgoing page.
	 */
	settled = true;

	get current(): Entry {
		return this.entries[this.index];
	}

	fetch = (input: string, init?: RequestInit): Promise<Response> => {
		const url = new URL(input, this.current.url);
		const headers = (init?.headers ?? {}) as Record<string, string>;
		this.descriptorRequests += 1;
		if (this.during === "push #x") {
			this.violations.push(
				`FRAGMENT-FETCH: push to a fragment of the page on screen requested ${input}`,
			);
		}
		if (headers["X-Poyo-Navigation"] !== "1") {
			this.violations.push(`descriptor request without header: ${input}`);
		}
		// ABORT — a navigation supersedes whatever came before it, and the
		// older request must be cancelled before the new one starts. A live
		// request is one still in `pending`: answering pops it, aborting
		// removes it.
		if (this.pending.length > 0) {
			this.violations.push(
				`ABORT: ${this.during} started ${url.pathname} while ${this.pending
					.map((request) => request.path)
					.join(", ")} was still in flight`,
			);
		}
		// NON-DYNAMIC-FETCH — the route table carries the registry's opt-out,
		// so the router must hand the target to the browser unrequested.
		if (NON_DYNAMIC_PATHS.has(url.pathname)) {
			this.violations.push(
				`NON-DYNAMIC-FETCH: ${this.during} requested a descriptor for ${url.pathname}`,
			);
		}
		return new Promise<Response>((resolve, reject) => {
			const record: Pending = {
				path: url.pathname,
				epoch: this.epoch,
				mode:
					this.lastNavKind === "replace"
						? "replace"
						: this.lastNavKind === "push"
							? "push"
							: "traverse",
				signal: init?.signal ?? null,
				resolve,
				reject,
			};
			record.signal?.addEventListener("abort", () => {
				const index = this.pending.indexOf(record);
				if (index >= 0) this.pending.splice(index, 1);
				const error = new Error("The operation was aborted.");
				error.name = "AbortError";
				reject(error);
			});
			this.pending.push(record);
		});
	};

	documentLoad(kind: "assign" | "replace" | "reload", url: string) {
		if (this.terminal) return;
		if (kind === "reload") {
			this.terminal = { kind, url, during: this.during };
			return;
		}
		// A URL that differs from the current one only by its fragment is a
		// fragment navigation, not a document load: `assign` appends an entry
		// and `replace` rewrites the current one, both with a null state, and
		// popstate fires.
		const next = new URL(url, this.current.url);
		if (
			next.hash !== "" &&
			next.origin === this.current.url.origin &&
			next.pathname === this.current.url.pathname &&
			next.search === this.current.url.search
		) {
			if (kind === "assign") {
				this.fragment(next.hash);
			} else {
				this.current.url = next;
				this.current.state = null;
				this.lastNavKind = "hash";
				for (const fn of this.popListeners) {
					fn({ state: null } as PopStateEvent);
				}
			}
			return;
		}
		this.terminal = { kind, url, during: this.during };
	}

	traverse(delta: number) {
		const target = this.index + delta;
		if (target < 0 || target >= this.entries.length) return;
		const from = this.current;
		if (this.settled) this.leave(from);
		const to = this.entries[target];
		if (to.doc !== this.doc) {
			this.terminal = {
				kind: "replace",
				url: to.url.href,
				during: "cross-doc",
			};
			return;
		}
		const hashOnly =
			from.url.pathname === to.url.pathname &&
			from.url.search === to.url.search;
		this.index = target;
		this.lastNavKind = hashOnly ? "hash" : "traverse";
		this.traversedTo = hashOnly ? null : to;
		this.traversedToRecorded =
			typeof to.state === "object" && to.state !== null && "__poyo" in to.state;
		if (!hashOnly) this.settled = false;
		if (!hashOnly) this.epoch++;
		this.traversalTarget = to;
		for (const fn of this.popListeners) {
			fn({ state: structuredClone(to.state) } as PopStateEvent);
		}
		this.traversalTarget = null;
	}

	fragment(hash: string) {
		const next = new URL(this.current.url);
		next.hash = hash;
		if (this.settled) this.leave(this.current);
		this.entries = this.entries.slice(0, this.index + 1);
		this.entries.push({ url: next, state: null, doc: this.doc, leftAt: 0 });
		this.index++;
		this.lastNavKind = "hash";
		for (const fn of this.popListeners) {
			fn({ state: null } as PopStateEvent);
		}
	}

	/**
	 * The browser leaves the current entry without the router writing it (a
	 * traversal, a fragment, another library's pushState): its true position
	 * is the screen's. I3 holds the router to it however soon after the last
	 * scroll the entry is left — including before the router's throttled
	 * record has had its frame, which 0.5.1 documented as a limit.
	 */
	leave(entry: Entry) {
		entry.leftAt = this.scrollY;
	}

	scroll() {
		this.scrollY += 100;
		for (const fn of this.scrollListeners) fn();
	}

	/** The next frame: every callback queued so far runs, in order. */
	frame() {
		const due = [...this.frames.entries()];
		this.frames.clear();
		for (const [, { cb, queuedAt }] of due) {
			const before = this.scrollY;
			cb(0);
			// I4 — a frame queued before a navigation committed never moves the
			// page that navigation put on screen.
			if (
				this.scrollY !== before &&
				getNavigationStore().getState() !== queuedAt
			) {
				this.violations.push(
					`STALE-FRAME: a frame queued for an earlier page moved ${this.current.url.pathname} from ${before} to ${this.scrollY}`,
				);
			}
		}
	}
}

const pageNameFor = (path: string) => PAGE_NAMES[path];

function respond(p: Pending, ok: boolean): void {
	const name = pageNameFor(p.path);
	if (!ok || !name) {
		p.resolve({
			ok: false,
			status: 500,
			redirected: false,
			json: async () => {
				throw new Error("not json");
			},
		} as unknown as Response);
		return;
	}
	p.resolve({
		ok: true,
		status: 200,
		redirected: false,
		json: async () => ({ name, seo: null, pageData: { path: p.path } }),
	} as unknown as Response);
}

type Event =
	| "push /a"
	| "push /b"
	| "push /c"
	| "replace /b"
	| "frag"
	| "push #x"
	| "lib"
	| "back"
	| "forward"
	| "ok"
	| "okLast"
	| "fail"
	| "pageOk"
	| "pageFail"
	| "scroll"
	| "frame"
	| "destroy";

/**
 * The depth-7 alphabet: the navigation behaviors the deep walk has always
 * covered. It stays this size because depth 7 replays millions of traces.
 */
const ALPHABET: Event[] = [
	"push /a",
	"push /b",
	"replace /b",
	"frag",
	"push #x",
	"lib",
	"back",
	"forward",
	"ok",
	"okLast",
	"fail",
	"pageOk",
	"pageFail",
	"scroll",
	"frame",
];

/**
 * The behaviors added with abort, destroy and the `dynamic: false` opt-out.
 * A non-dynamic push ends the run in a document load and destroy is only
 * enabled while work is in flight, so this walk is cheap at depth 5.
 */
const EXTENDED_ALPHABET: Event[] = [...ALPHABET, "push /c", "destroy"];

function enabled(sim: SimBrowser, e: Event): boolean {
	if (sim.terminal) return false;
	// A destroyed router no longer owns the screen: only the results it was
	// waiting for may arrive, and none of them may change anything.
	if (sim.destroyed) {
		return (
			((e === "pageOk" || e === "pageFail") && sim.pendingPages.length > 0) ||
			(e === "frame" && sim.frames.size > 0)
		);
	}
	switch (e) {
		case "back":
			return sim.index > 0;
		case "forward":
			return sim.index < sim.entries.length - 1;
		case "ok":
		case "fail":
		case "okLast":
			return sim.pending.length > 0;
		case "pageOk":
		case "pageFail":
			return sim.pendingPages.length > 0;
		case "lib":
			return sim.pending.length === 0;
		case "frame":
			return sim.frames.size > 0;
		case "destroy":
			// Destroying an idle router proves nothing; the cases worth
			// exploring are the ones with work that could still land.
			return (
				sim.pending.length > 0 ||
				sim.pendingPages.length > 0 ||
				sim.frames.size > 0
			);
		default:
			return true;
	}
}

async function flush(): Promise<void> {
	for (let i = 0; i < 25; i++) await Promise.resolve();
}

interface Run {
	sim: SimBrowser;
	router: Router;
}

function boot(): Run {
	clearActiveRouteTable();
	resetNavigationStore();
	setActiveRouter(undefined);
	const sim = new SimBrowser("/a");
	vi.stubGlobal("window", sim.window);
	// PAGE-COMMIT — the store never shows a route whose page module is still
	// loading. Subscribed before the router installs, so its first commit is
	// observed too.
	const store = getNavigationStore();
	let lastState = store.getState();
	store.subscribe(() => {
		const next = store.getState();
		const path = next.route?.path;
		if (
			next !== lastState &&
			path &&
			sim.pendingPages.some((page) => page.path === path)
		) {
			sim.violations.push(
				`PAGE-COMMIT: committed ${path} before its page module loaded`,
			);
		}
		lastState = next;
	});
	const router = createRouter({
		routeTable: sim.routeTable,
		window: sim.window,
		fetch: sim.fetch as unknown as typeof fetch,
	});
	return { sim, router };
}

async function step({ sim, router }: Run, e: Event): Promise<void> {
	sim.during = e;
	const entriesBefore = sim.entries
		.map((x) => `${x.url.href}|${JSON.stringify(x.state)}`)
		.join(",");
	const routeBefore = getNavigationStore().getRoute();
	const stateBefore = getNavigationStore().getState();
	const scrollBefore = sim.scrollY;
	switch (e) {
		case "push /a":
		case "push /b":
		case "push /c":
			sim.traversedTo = null;
			sim.restoreCheck = null;
			sim.lastNavKind = "push";
			sim.epoch++;
			void router.push(e.slice(5));
			break;
		case "replace /b":
			sim.traversedTo = null;
			sim.restoreCheck = null;
			sim.lastNavKind = "replace";
			sim.epoch++;
			void router.replace("/b");
			break;
		case "push #x":
			// The programmatic form of an in-page anchor: the browser's own
			// fragment navigation, never a descriptor request.
			void router.push("#x");
			break;
		case "frag":
			sim.fragment(sim.current.url.hash === "#x" ? "#y" : "#x");
			break;
		case "lib":
			// Another library records an in-page state (a modal, a tab) on the
			// same URL. pushState fires no popstate.
			sim.window.history.pushState({ lib: true }, "", sim.current.url.href);
			break;
		case "back":
			sim.traverse(-1);
			break;
		case "forward":
			sim.traverse(1);
			break;
		case "ok":
		case "fail":
		case "okLast": {
			const p = e === "okLast" ? sim.pending.pop() : sim.pending.shift();
			if (!p) break;
			const stale = p.epoch < sim.epoch;
			if (!stale && e !== "fail") sim.pageMode = p.mode;
			respond(p, e !== "fail");
			await flush();
			if (stale) {
				const entriesAfter = sim.entries
					.map((x) => `${x.url.href}|${JSON.stringify(x.state)}`)
					.join(",");
				if (
					sim.terminal ||
					entriesAfter !== entriesBefore ||
					getNavigationStore().getRoute() !== routeBefore
				) {
					sim.violations.push(
						"SUPERSEDED: a stale descriptor response changed state",
					);
				}
			} else if (e !== "fail" && p.mode === "traverse" && sim.traversedTo) {
				// I3 — a cross-path traversal arms its scroll check once it
				// commits. When the page module was already in memory the
				// commit happened in this step; otherwise the pageOk step arms
				// it, because the traversal waits for the module.
				if (getNavigationStore().getState() !== stateBefore) {
					const target = sim.traversedTo;
					const expected = sim.traversedToRecorded ? target.leftAt : 0;
					sim.restoreCheck = { target, expected };
				}
			} else if (e === "fail" && sim.terminal) {
				// A traversal has already moved the entry, so its floor settles
				// that entry: replace, or reload when the entry's URL has a
				// fragment (replace would be a fragment navigation, no load).
				const allowed =
					p.mode === "push"
						? ["assign"]
						: p.mode === "replace"
							? ["replace"]
							: ["replace", "reload"];
				if (!allowed.includes(sim.terminal.kind)) {
					sim.violations.push(
						`HISTORY-OP: failed ${p.mode} fell back through location.${sim.terminal.kind}`,
					);
				}
			}
			break;
		}
		case "pageOk":
		case "pageFail": {
			// One page module result settles every navigation waiting for it;
			// only the newest generation is still live.
			const pages = sim.pendingPages.splice(0);
			const live = pages.filter(
				(page) => page.request === sim.descriptorRequests,
			);
			if (e === "pageOk") {
				for (const page of pages) {
					sim.pagesLoaded.add(page.path);
					page.resolve();
				}
			} else {
				for (const page of pages) {
					page.reject(new Error("Failed to fetch dynamically imported module"));
				}
			}
			await flush();
			if (
				e === "pageOk" &&
				sim.traversedTo &&
				live.some((page) => page.mode === "traverse") &&
				getNavigationStore().getState() !== stateBefore
			) {
				// The delayed traversal has now committed; its restore frame is
				// queued, so I3 becomes checkable on the next frame.
				const target = sim.traversedTo;
				sim.restoreCheck = {
					target,
					expected: sim.traversedToRecorded ? target.leftAt : 0,
				};
			}
			if (e === "pageFail" && !sim.destroyed) {
				if (live.length > 0) {
					// The live navigation must hand the entry to a document
					// load through the operation it asked for.
					if (!sim.terminal) {
						sim.violations.push(
							"PAGE-FALLBACK: a failed page module was not answered with a document load",
						);
					} else {
						const allowed = (mode: PendingPage["mode"]) =>
							mode === "push"
								? ["assign"]
								: mode === "replace"
									? ["replace"]
									: ["replace", "reload"];
						for (const page of live) {
							if (!allowed(page.mode).includes(sim.terminal.kind)) {
								sim.violations.push(
									`HISTORY-OP: failed ${page.mode} page module fell back through location.${sim.terminal.kind}`,
								);
							}
						}
					}
				} else {
					const entriesAfter = sim.entries
						.map((x) => `${x.url.href}|${JSON.stringify(x.state)}`)
						.join(",");
					if (
						sim.terminal ||
						entriesAfter !== entriesBefore ||
						getNavigationStore().getRoute() !== routeBefore
					) {
						sim.violations.push(
							"SUPERSEDED-PAGE: a stale page module failure changed state",
						);
					}
				}
			}
			break;
		}
		case "scroll":
			sim.scroll();
			break;
		case "destroy":
			router.destroy?.();
			sim.destroyed = true;
			if (sim.pending.length > 0) {
				sim.violations.push(
					`ABORT: destroy() left ${sim.pending
						.map((request) => request.path)
						.join(", ")} in flight`,
				);
			}
			break;
		case "frame": {
			const check = sim.restoreCheck;
			sim.frame();
			if (check && sim.traversedTo === check.target) {
				sim.restoreCheck = null;
				if (sim.scrollY !== check.expected) {
					const { target, expected } = check;
					sim.violations.push(
						`SCROLL: returned to ${target.url.pathname}${target.url.hash} at ${sim.scrollY}, expected ${expected} (left at ${target.leftAt})`,
					);
				}
			}
			break;
		}
	}
	await flush();
	if (sim.pending.length === 0 && sim.pendingPages.length === 0) {
		sim.settled = true;
	}
	if (sim.destroyed) {
		const entriesAfter = sim.entries
			.map((x) => `${x.url.href}|${JSON.stringify(x.state)}`)
			.join(",");
		if (
			sim.terminal ||
			entriesAfter !== entriesBefore ||
			getNavigationStore().getState() !== stateBefore ||
			sim.scrollY !== scrollBefore
		) {
			sim.violations.push(`DESTROY: ${e} after destroy() changed the document`);
		}
	}
	checkInvariants(sim, e);
}

function checkInvariants(sim: SimBrowser, e: Event): void {
	// I1 — a same-document entry is never treated as a cold entry. A document
	// load raised synchronously by a traversal to an entry of this document
	// discards the shell for an entry this document itself created.
	if (
		sim.terminal &&
		(e === "back" || e === "forward") &&
		sim.terminal.during === e
	) {
		const target = sim.current;
		if (target.doc === sim.doc) {
			sim.violations.push(
				`COLD-SAME-DOC: ${e} to ${target.url.pathname}${target.url.hash} (a same-document entry, state=${JSON.stringify(target.state)}) reloaded the document`,
			);
		}
	}
	// I5 — a fragment of the page on screen is never a document load.
	if (sim.terminal?.during === "push #x") {
		sim.violations.push(
			`FRAGMENT-LOAD: push to a fragment of the page on screen loaded ${sim.terminal.url}`,
		);
	}
	// I6 — a `dynamic: false` route is a document load, never a request.
	if (e === "push /c" && sim.terminal?.kind !== "assign") {
		sim.violations.push(
			"NON-DYNAMIC-LOAD: push to a non-dynamic route did not load the document",
		);
	}
	// After destroy the router no longer owns the screen, so it makes no
	// promise that the store describes the address bar.
	if (sim.destroyed) return;
	if (sim.terminal) return;

	const quiescent = sim.pending.length === 0 && sim.pendingPages.length === 0;
	const route = getNavigationStore().getRoute();
	// I2 — at quiescence the screen describes the address bar.
	if (quiescent && route?.path !== sim.current.url.pathname) {
		sim.violations.push(
			`SCREEN≠URL: store shows ${route?.path} while the address bar is ${sim.current.url.pathname}`,
		);
	}
}

interface Counterexample {
	invariant: string;
	message: string;
	trace: Event[];
}

async function explore(
	depth: number,
	alphabet: Event[] = ALPHABET,
): Promise<Map<string, Counterexample>> {
	const found = new Map<string, Counterexample>();
	// Breadth-first, so the first counterexample per invariant is a shortest one.
	let frontier: Event[][] = [[]];
	let explored = 0;
	let sinceYield = 0;
	for (let d = 0; d < depth; d++) {
		const next: Event[][] = [];
		for (const prefix of frontier) {
			// The checker awaits only microtasks, so a deep run never hands the
			// event loop back; the test worker then misses its RPC deadline and
			// vitest fails a run whose checks all passed. Yield a macrotask now
			// and then.
			if (++sinceYield >= 200) {
				sinceYield = 0;
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
			for (const e of alphabet) {
				const trace = [...prefix, e];
				const run = boot();
				let alive = true;
				for (const ev of trace) {
					if (!enabled(run.sim, ev)) {
						alive = false;
						break;
					}
					await step(run, ev);
				}
				run.router.destroy?.();
				vi.unstubAllGlobals();
				if (!alive) continue;
				for (const v of run.sim.violations) {
					const invariant = v.split(":")[0];
					if (!found.has(invariant))
						found.set(invariant, { invariant, message: v, trace });
				}
				if (!run.sim.terminal) next.push(trace);
			}
		}
		frontier = next;
		explored += next.length;
	}
	console.log(`explored ${explored} live states to depth ${depth}`);
	return found;
}

describe("dynamic navigation — model check", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		clearActiveRouteTable();
		resetNavigationStore();
		setActiveRouter(undefined);
	});

	it("holds every invariant for every event sequence up to the depth bound (POYO_MODEL_DEPTH, default 5)", async () => {
		const found = await explore(Number(process.env.POYO_MODEL_DEPTH ?? 5));
		const report = [...found.values()].map(
			(c) => `${c.message}\n    trace: ${c.trace.join(" → ")}`,
		);
		expect(report).toEqual([]);
		// Depth 7 explores millions of states in a CPU-bound walk; a shared
		// runner has taken over ten minutes for it. The cap is a resource
		// bound, not an invariant.
	}, 900_000);

	it("holds the abort, destroy and non-dynamic invariants up to depth 5", async () => {
		const found = await explore(5, EXTENDED_ALPHABET);
		const report = [...found.values()].map(
			(c) => `${c.message}\n    trace: ${c.trace.join(" → ")}`,
		);
		expect(report).toEqual([]);
		// A separate, shallower walk: these events multiply the depth-7 state
		// space without revealing anything the extra depth would.
	}, 120_000);
});
