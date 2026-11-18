import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetNavigationStore } from "../src/runtime/navigation-store.js";
import {
	SEO_MARKER_ATTRIBUTE,
	TITLE_TEMPLATE_ATTRIBUTE,
	getActiveRouter,
	setActiveRouter,
} from "../src/runtime/router.js";
import {
	type AppRoute,
	clearActiveRouteTable,
} from "../src/runtime/route-table.js";
import { createFakeDocument, seed } from "./fake-head.js";
import { createRouterHarness, stubPage } from "./router-test-helpers.js";

/**
 * The head-parity corpus, read by the runtime's side of it. The server suite
 * (HeadParityCorpusTests) renders each route's document and checks its head
 * and its descriptor's seo against the same file; this suite applies that
 * descriptor seo after a navigation and checks the head is the same one.
 */
const CORPUS = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../fixtures/head/head-parity.json",
);

interface Expected {
	title: string;
	description: string | null;
	meta: Record<string, string>;
	jsonLd: unknown;
}

interface Case {
	id: string;
	name: string;
	seo?: {
		title?: string;
		description?: string;
		meta?: Record<string, string>;
		jsonld?: unknown;
	};
	expected: Expected;
}

const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf-8")) as {
	titleTemplate: string;
	cases: Case[];
};

/** The registry seo as the server's descriptor carries it. */
function descriptorSeo(seo: Case["seo"]) {
	if (!seo) return null;
	return {
		title: seo.title ?? null,
		description: seo.description ?? null,
		meta: seo.meta ?? null,
		jsonLd: seo.jsonld ?? null,
	};
}

describe("head parity corpus — runtime side", () => {
	afterEach(() => {
		getActiveRouter()?.destroy?.();
		setActiveRouter(undefined);
		vi.unstubAllGlobals();
		clearActiveRouteTable();
		resetNavigationStore();
	});

	it.each(
		corpus.cases.map((c) => [c.id, c] as const),
	)("%s: a dynamic navigation shows the head a document load renders", async (_id, corpusCase) => {
		const route: AppRoute = {
			path: `/${corpusCase.name}`,
			pageName: corpusCase.name,
			access: "public",
			...stubPage(),
		};
		// The page another route left behind.
		const doc = createFakeDocument();
		seed(doc, "title", { [TITLE_TEMPLATE_ATTRIBUTE]: corpus.titleTemplate });
		seed(doc, "meta", {
			name: "description",
			content: "stale",
			[SEO_MARKER_ATTRIBUTE]: "",
		});
		seed(doc, "meta", {
			name: "stale-key",
			content: "stale",
			[SEO_MARKER_ATTRIBUTE]: "",
		});
		seed(
			doc,
			"script",
			{ type: "application/ld+json", [SEO_MARKER_ATTRIBUTE]: "" },
			"{}",
		);

		const harness = createRouterHarness({
			routes: [route],
			document: doc as unknown as Document,
			fetch: vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					v: 1,
					name: corpusCase.name,
					seo: descriptorSeo(corpusCase.seo),
					pageData: null,
				}),
			}) as unknown as typeof fetch,
		});
		await harness.router.push(route.path);

		const owned = doc.querySelectorAll(`[${SEO_MARKER_ATTRIBUTE}]`);
		const description =
			owned
				.find(
					(e) =>
						e.tagName === "META" && e.getAttribute("name") === "description",
				)
				?.getAttribute("content") ?? null;
		const meta = Object.fromEntries(
			owned
				.filter(
					(e) =>
						e.tagName === "META" && e.getAttribute("name") !== "description",
				)
				.map((e) => [
					e.getAttribute("property") ?? e.getAttribute("name") ?? "",
					e.getAttribute("content") ?? "",
				]),
		);
		const scripts = owned.filter((e) => e.tagName === "SCRIPT");
		const jsonLd = scripts.length ? JSON.parse(scripts[0].textContent) : null;

		expect({
			title: doc.title,
			description,
			meta,
			jsonLd,
		}).toEqual(corpusCase.expected);
		expect(scripts.length).toBeLessThanOrEqual(1);
	});
});
