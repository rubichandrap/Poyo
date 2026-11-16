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
 * the scenario needs no fixture pages of its own.
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

		const homeReady = () => page.waitForSelector('a[href="/Login"]');
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
		const expectedHome = await documentHead("/", 'a[href="/Login"]');
		const expectedLogin = await documentHead("/Login", "form");

		const assertSameDocument = async (step) => {
			assert.equal(
				await page.evaluate(() => window.__poyoMarker),
				LANDING_MARKER,
				`${step}: the document was reloaded instead of swapped`,
			);
		};

		await page.goto(`${origin}/`);
		await homeReady();
		await page.evaluate((marker) => {
			window.__poyoMarker = marker;
		}, LANDING_MARKER);

		// Link click: a dynamic navigation.
		await page.click('a[href="/Login"]');
		await page.waitForURL(`${origin}/Login`);
		await loginReady();
		await assertSameDocument("Link to /Login");
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
		assert.deepEqual(
			await readHead(page),
			expectedHome,
			"after Back to / the head differs from a document load of /",
		);

		// Forward again.
		await page.goForward();
		await page.waitForURL(`${origin}/Login`);
		await loginReady();
		await assertSameDocument("Forward to /Login");
		assert.deepEqual(await readHead(page), expectedLogin);

		assert.deepEqual(
			pageErrors.map((error) => error.message),
			[],
			"the page raised errors during navigation",
		);
	} finally {
		await browser.close();
	}
}
