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
import { stubComponent } from "./router-test-helpers.js";

const ORIGIN = "http://poyo.test";

const ROUTES: AppRoute[] = [
	{ path: "/", pageName: "Home", access: "public", component: stubComponent() },
	{ path: "/a", pageName: "A", access: "public", component: stubComponent() },
	{ path: "/b", pageName: "B", access: "public", component: stubComponent() },
];

const routeTable: RouteTable = {
	basePath: "/",
	routes: ROUTES,
	routeMap: Object.fromEntries(ROUTES.map((r) => [r.pageName, r.component])),
	findRouteByName: (name) => ROUTES.find((r) => r.pageName === name),
	findRouteGeneric: (path) => ROUTES.find((r) => r.path === path),
	detectGhostRoutes: () => undefined,
};

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
	resolve: (response: Response) => void;
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
		if (this.during === "push #x") {
			this.violations.push(
				`FRAGMENT-FETCH: push to a fragment of the page on screen requested ${input}`,
			);
		}
		if (headers["X-Poyo-Navigation"] !== "1") {
			this.violations.push(`descriptor request without header: ${input}`);
		}
		return new Promise<Response>((resolve) => {
			this.pending.push({
				path: url.pathname,
				epoch: this.epoch,
				mode:
					this.lastNavKind === "replace"
						? "replace"
						: this.lastNavKind === "push"
							? "push"
							: "traverse",
				resolve,
			});
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

const pageNameFor = (path: string) =>
	ROUTES.find((r) => r.path === path)?.pageName;

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
	| "replace /b"
	| "frag"
	| "push #x"
	| "lib"
	| "back"
	| "forward"
	| "ok"
	| "okLast"
	| "fail"
	| "scroll"
	| "frame";

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
	"scroll",
	"frame",
];

function enabled(sim: SimBrowser, e: Event): boolean {
	if (sim.terminal) return false;
	switch (e) {
		case "back":
			return sim.index > 0;
		case "forward":
			return sim.index < sim.entries.length - 1;
		case "ok":
		case "fail":
		case "okLast":
			return sim.pending.length > 0;
		case "lib":
			return sim.pending.length === 0;
		case "frame":
			return sim.frames.size > 0;
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
	const router = createRouter({
		routeTable,
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
	switch (e) {
		case "push /a":
		case "push /b":
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
				// I3 — when a cross-path traversal's own descriptor arrives, the
				// scroll position its entry was left at is back on screen once
				// the restore frame has run (checked in the "frame" step).
				const target = sim.traversedTo;
				const expected = sim.traversedToRecorded ? target.leftAt : 0;
				sim.restoreCheck = { target, expected };
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
		case "scroll":
			sim.scroll();
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
	if (sim.pending.length === 0) sim.settled = true;
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
	if (sim.terminal) return;

	const quiescent = sim.pending.length === 0;
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

async function explore(depth: number): Promise<Map<string, Counterexample>> {
	const found = new Map<string, Counterexample>();
	// Breadth-first, so the first counterexample per invariant is a shortest one.
	let frontier: Event[][] = [[]];
	let explored = 0;
	for (let d = 0; d < depth; d++) {
		const next: Event[][] = [];
		for (const prefix of frontier) {
			for (const e of ALPHABET) {
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
	}, 600_000);
});
