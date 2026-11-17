/**
 * Browser behavior the navigation runtime's decisions rest on, checked in
 * Chromium rather than assumed (AGENTS.md, "Decisions and evidence").
 *
 * - The fallback floor reloads when its target is the entry already in the
 *   address bar with a fragment, because `location.replace` to that URL is a
 *   fragment navigation: no request, the same document, the previous page
 *   still on screen. Found by the navigation model check once its simulated
 *   browser modelled fragment navigation (after 0.5.1).
 * - `router.push("#x")` hands a fragment of the page on screen to
 *   `location.assign`, because the browser performs it as an in-page anchor:
 *   no request, a new history entry, and a `popstate` for the router to adopt.
 *
 * Needs Chromium: `pnpm exec playwright install chromium`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";

const ORIGIN = "http://platform-facts.test";

async function withPage(run) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const requests = [];
		await page.route(`${ORIGIN}/**`, (route) => {
			requests.push(route.request().url());
			return route.fulfill({
				contentType: "text/html",
				headers: { "cache-control": "no-store" },
				body: '<!doctype html><p style="height:3000px">top</p><p id="x">x</p>',
			});
		});
		await run(page, requests);
	} finally {
		await browser.close();
	}
}

const markDocument = (page) =>
	page.evaluate(() => {
		window.__sameDocument = true;
	});
const isSameDocument = (page) =>
	page.evaluate(() => window.__sameDocument === true);

test("location.replace to the current URL with a fragment loads no document", async () => {
	await withPage(async (page, requests) => {
		await page.goto(`${ORIGIN}/a#x`);
		await markDocument(page);
		const before = requests.length;

		await page.evaluate(() => location.replace("/a#x"));
		await page.waitForTimeout(250);

		assert.equal(requests.length - before, 0, "no request");
		assert.equal(await isSameDocument(page), true, "same document");
	});
});

test("location.reload loads the current entry's document again", async () => {
	await withPage(async (page, requests) => {
		await page.goto(`${ORIGIN}/a#x`);
		await markDocument(page);
		const before = requests.length;

		await Promise.all([
			page.waitForEvent("load"),
			page.evaluate(() => setTimeout(() => location.reload(), 0)),
		]);

		assert.equal(requests.length - before, 1, "one document request");
		assert.equal(await isSameDocument(page), false, "a new document");
		assert.equal(new URL(page.url()).hash, "#x", "the entry keeps its fragment");
	});
});

test("location.assign to a fragment of the current page is an in-page navigation with popstate", async () => {
	await withPage(async (page, requests) => {
		await page.goto(`${ORIGIN}/a`);
		await markDocument(page);
		await page.evaluate(() => {
			window.__popstates = 0;
			addEventListener("popstate", () => {
				window.__popstates += 1;
			});
		});
		const before = requests.length;
		const lengthBefore = await page.evaluate(() => history.length);

		await page.evaluate(() => location.assign("#x"));
		await page.waitForTimeout(250);

		assert.equal(requests.length - before, 0, "no request");
		assert.equal(await isSameDocument(page), true, "same document");
		assert.equal(await page.evaluate(() => history.length), lengthBefore + 1, "a new entry");
		assert.equal(await page.evaluate(() => window.__popstates), 1, "popstate fired");
		assert.ok((await page.evaluate(() => window.scrollY)) > 0, "scrolled to the element");
	});
});
