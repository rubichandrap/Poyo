/**
 * Dynamic navigation in a real browser, against a running Poyo application
 * served in Production (the built bundle, not the Vite dev server).
 *
 * The runtime's unit tests and model check run the router against simulated
 * browsers. This is the check that the simulation matches a real one: the
 * cold-entry bug survived because a mock history encoded the same wrong
 * assumption as the code. Each step asserts three things:
 *
 *   - no document load happened (a marker set on `window` survives), so the
 *     swap and the Back/Forward traversal stayed in the loaded document;
 *   - the page that rendered is the one the address bar names;
 *   - the head is the one a fresh document load of that URL renders
 *     (title, and every `data-poyo-seo` element), so the two representations
 *     agree in the browser, not only in the corpus.
 *
 * The scaffolded template's Home page links to Login and Login links back, so
 * the scenario needs no fixture pages of its own. It then signs in with the
 * demo credentials and logs out, asserting the full-page redirect lands on the
 * application's root — which under a path base is not the host's root.
 */
import assert from "node:assert/strict";

const LANDING_MARKER = "poyo-landing-document";

/** The route-owned head, normalized so attribute order and JSON text do not matter. */
async function readHead(page) {
	return page.evaluate(() => ({
		title: document.title,
		owned: [...document.querySelectorAll("[data-poyo-seo]")]
			.map((element) =>
				element.tagName === "SCRIPT"
					? { tag: "script", json: JSON.parse(element.textContent ?? "null") }
					: {
							tag: element.tagName.toLowerCase(),
							attributes: Object.fromEntries(
								[...element.attributes]
									.filter((attribute) => attribute.name !== "data-poyo-seo")
									.map((attribute) => [attribute.name, attribute.value])
									.sort(([a], [b]) => a.localeCompare(b)),
							),
						},
			)
			.map((entry) => JSON.stringify(entry))
			.sort(),
	}));
}

/**
 * @param {object} options
 * @param {import("playwright").BrowserType} options.chromium
 * @param {string} options.origin e.g. "http://127.0.0.1:5000"
 */
export async function checkBrowserNavigation({ chromium, origin }) {
	const browser = await chromium.launch();
	try {
		const context = await browser.newContext();
		const page = await context.newPage();
		const pageErrors = [];
		page.on("pageerror", (error) => pageErrors.push(error));
		const basePathname =
			new URL(`${origin}/`).pathname.replace(/\/$/, "") || "/";

		// The rendered href includes the app's path base (/Login at the host
		// root, /Poyo/Login under one), so match the route, not the raw path.
		const homeReady = () => page.waitForSelector('a[href$="/Login"]');
		const loginReady = () => page.waitForSelector("form");

		/** The head a fresh document load of `path` renders, from a second tab. */
		const documentHead = async (path, ready) => {
			const fresh = await context.newPage();
			try {
				await fresh.goto(origin + path);
				await fresh.waitForSelector(ready);
				return await readHead(fresh);
			} finally {
				await fresh.close();
			}
		};
		const expectedHome = await documentHead("/", 'a[href$="/Login"]');
		const expectedLogin = await documentHead("/Login", "form");

		const assertSameDocument = async (step) => {
			assert.equal(
				await page.evaluate(() => window.__poyoMarker),
				LANDING_MARKER,
				`${step}: the document was reloaded instead of swapped`,
			);
		};

		/**
		 * Focus lands in the incoming page's own region, not on an element of
		 * the outgoing page that React removes. The pages under test render
		 * `data-page-region`, so the target is the page's, not the mount
		 * root's.
		 */
		const assertFocusRegion = async (name, step) => {
			await page.waitForFunction(
				(expected) =>
					document.activeElement
						?.closest?.("[data-page-region]")
						?.getAttribute("data-page-region") === expected,
				name,
			);
			const active = await page.evaluate(() => {
				const element = document.activeElement;
				return {
					region:
						element
							?.closest?.("[data-page-region]")
							?.getAttribute("data-page-region") ?? null,
					isMountRoot: element?.id === "react-root",
				};
			});
			assert.deepEqual(
				active,
				{ region: name, isMountRoot: false },
				`${step}: focus is not on the ${name} page's region`,
			);
		};

		await page.goto(`${origin}/`);
		await homeReady();
		await page.evaluate((marker) => {
			window.__poyoMarker = marker;
		}, LANDING_MARKER);
		// A successful dynamic navigation must render the new page without
		// showing the Suspense fallback: the route's page module is loaded
		// before the store commit (ADR 0009). Record every fallback insertion,
		// including one React would repaint over within a microtask.
		await page.evaluate(() => {
			window.__poyoFallbackSeen = false;
			const observer = new MutationObserver((records) => {
				for (const record of records) {
					for (const node of record.addedNodes) {
						if (node.textContent?.includes("Loading...")) {
							window.__poyoFallbackSeen = true;
						}
					}
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
		});

		// Link click: a dynamic navigation.
		await page.click('a[href$="/Login"]');
		await page.waitForURL(/\/Login$/);
		await loginReady();
		await assertSameDocument("Link to /Login");
		assert.equal(
			await page.evaluate(() => window.__poyoFallbackSeen),
			false,
			"a dynamic navigation showed the Suspense fallback",
		);
		await assertFocusRegion("Login", "Link to /Login");
		assert.deepEqual(
			await readHead(page),
			expectedLogin,
			"after a dynamic navigation to /Login the head differs from a document load of /Login",
		);

		// Back to the landing entry: the entry the document was loaded into.
		await page.goBack();
		await page.waitForURL(`${origin}/`);
		await homeReady();
		await assertSameDocument("Back to the landing entry");
		await assertFocusRegion("Home", "Back to the landing entry");
		assert.deepEqual(
			await readHead(page),
			expectedHome,
			"after Back to / the head differs from a document load of /",
		);

		// Forward again.
		await page.goForward();
		await page.waitForURL(/\/Login$/);
		await loginReady();
		await assertSameDocument("Forward to /Login");
		await assertFocusRegion("Login", "Forward to /Login");
		assert.deepEqual(await readHead(page), expectedLogin);

		// A route the registry marks `dynamic: false` is the browser's
		// document load: clicking its Link must not send a descriptor
		// request. The marker is still on the Login document, so a swap
		// would keep it and the document load removes it (ADR 0009).
		const registerDescriptors = [];
		const collectRegisterDescriptor = (request) => {
			if (
				request.headers()["x-poyo-navigation"] === "1" &&
				new URL(request.url()).pathname.endsWith("/Register")
			) {
				registerDescriptors.push(request.url());
			}
		};
		page.on("request", collectRegisterDescriptor);
		const registerDocument = page.waitForRequest(
			(request) =>
				request.resourceType() === "document" &&
				new URL(request.url()).pathname.endsWith("/Register"),
			{ timeout: 15000 },
		);
		await page.click('a[href$="/Register"]');
		await registerDocument;
		await page.waitForURL(/\/Register$/);
		page.off("request", collectRegisterDescriptor);
		assert.deepEqual(
			registerDescriptors,
			[],
			"a Link to a dynamic: false route requested a descriptor",
		);
		assert.equal(
			await page.evaluate(() => window.__poyoMarker),
			undefined,
			"a Link to a dynamic: false route swapped the page instead of loading the document",
		);

		// A page chunk that fails to load — a tab left open across a deploy,
		// whose old chunk hash now 404s — must become a document load of the
		// requested URL. The router loads the page module before committing,
		// so the rejection reaches the fallback instead of blanking the
		// mounted shell. A separate context keeps its page errors out of the
		// navigation scenario above.
		const staleContext = await browser.newContext();
		try {
			const stale = await staleContext.newPage();
			await stale.goto(`${origin}/`);
			await stale.waitForSelector('a[href$="/Login"]');
			await stale.evaluate((marker) => {
				window.__poyoMarker = marker;
			}, LANDING_MARKER);
			const bootScripts = new Set(
				await stale.evaluate(() =>
					performance.getEntriesByType("resource").map((entry) => entry.name),
				),
			);
			let aborted = 0;
			await stale.route(/\/generated\/index\.page-[^/]+\.js$/, (route) => {
				// The landing page's chunk is already in memory; every later
				// page chunk is the one the deploy replaced.
				if (bootScripts.has(route.request().url())) return route.continue();
				aborted += 1;
				return route.abort("failed");
			});
			const documentRequest = stale.waitForRequest(
				(request) =>
					request.resourceType() === "document" &&
					new URL(request.url()).pathname.endsWith("/Login"),
				{ timeout: 15000 },
			);
			await stale.click('a[href$="/Login"]');
			await documentRequest;
			await stale.waitForURL(/\/Login$/);
			assert.ok(aborted > 0, "the failing page chunk was never requested");
			assert.equal(
				await stale.evaluate(() => window.__poyoMarker),
				undefined,
				"the failing page chunk did not fall back to a document load",
			);
		} finally {
			await staleContext.close();
		}

		// Logout is a full document load to the application's root. Under a
		// path base that root is `${origin}/`, not the host's `/` — the host
		// root is outside the application, so a redirect there strands the
		// user on a page the app does not serve under its mount.
		await page.goto(`${origin}/Login`);
		await loginReady();
		await page.waitForLoadState("networkidle");
		await page.fill("#username", "demo");
		await page.fill("#password", "password");
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/Dashboard$/);
		await page.waitForSelector('button:has-text("Logout")');
		await page.click('button:has-text("Logout")');
		// `withBasePath("/")` emits the base as normalized, without a trailing
		// slash, so the app root is `${origin}` or `${origin}/` — never the
		// host root above it.
		await page.waitForURL(
			(url) => (url.pathname.replace(/\/$/, "") || "/") === basePathname,
		);
		await homeReady();

		assert.deepEqual(
			pageErrors.map((error) => error.message),
			[],
			"the page raised errors during navigation",
		);
	} finally {
		await browser.close();
	}
}
