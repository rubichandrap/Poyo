import { describe, expect, it } from "vitest";
import {
	execInFixture,
	makeFixture,
	readFixtureFile,
	writeFixtureFile,
} from "./helpers.js";

/**
 * Path-base model.
 *
 * A deployment may mount the app under a path base (`/Poyo`, `/app/nested`).
 * Every URL the app emits is a *transition* from a path base to a request
 * path, and the invariant is containment: the resolved path must still start
 * with the base it was emitted under. Escape means the browser asks the host
 * root for an asset or an API the application owns, which is a 404 — the
 * defect this file exists to make findable without a deployment.
 *
 * The model is checked exhaustively over a finite domain: every base the
 * template can be mounted under (root, one segment, two segments), every form
 * a generator can emit, and every document URL a relative reference can
 * resolve against.
 */

const BASES = ["", "/", "/Poyo", "/app/nested"];

/** A URL form: what a generator writes into HTML or JavaScript. */
const FORMS = {
	rootAbsolute: "/generated/x.js",
	razorAppRelative: "~/generated/x.js",
	documentRelative: "generated/x.js",
} as const;

/** Documents a `src`/`href` can be resolved against. */
const DOCUMENTS = ["/", "/Poyo/", "/Poyo/Login", "/Poyo/Settings/Profile"];

const joinPaths = (base: string, rest: string): string => {
	const trimmedBase = base.replace(/\/+$/, "");
	const trimmedRest = rest.replace(/^\/+/, "");
	const joined = `${trimmedBase}/${trimmedRest}`;
	return joined.startsWith("/") ? joined : `/${joined}`;
};

/** `Url.Content("~/x")` as ASP.NET defines it: the path base, then the app path. */
export function resolveRazor(pathBase: string, content: string): string {
	if (!content.startsWith("~/")) return content;
	return joinPaths(pathBase, content.slice(2));
}

/** Browser resolution of a relative reference against the document URL. */
export function resolveBrowser(documentUrl: string, reference: string): string {
	return new URL(reference, `http://host${documentUrl}`).pathname;
}

/** The invariant: the resolved path is inside the base, not beside it. */
export function isInsideBase(resolvedPath: string, pathBase: string): boolean {
	const base = pathBase.replace(/\/+$/, "");
	if (base === "") return resolvedPath.startsWith("/");
	return resolvedPath === base || resolvedPath.startsWith(`${base}/`);
}

describe("path-base model (exhaustive over the finite domain)", () => {
	it("app-relative Razor URLs stay inside every base", () => {
		for (const base of BASES) {
			const resolved = resolveRazor(base, FORMS.razorAppRelative);
			expect(
				isInsideBase(resolved, base),
				`~/generated/x.js under '${base}' resolved to ${resolved}`,
			).toBe(true);
		}
	});

	it("root-absolute URLs escape every non-root base (the defect class)", () => {
		const escapes = BASES.filter((base) => base !== "").map((base) => ({
			base,
			resolved: resolveRazor(base, FORMS.rootAbsolute),
		}));
		expect(escapes).toEqual([
			{ base: "/", resolved: "/generated/x.js" },
			{ base: "/Poyo", resolved: "/generated/x.js" },
			{ base: "/app/nested", resolved: "/generated/x.js" },
		]);
		for (const escaped of escapes) {
			expect(isInsideBase(escaped.resolved, escaped.base)).toBe(
				escaped.base === "/",
			);
		}
	});

	it("document-relative URLs only survive at the base root, not on nested routes", () => {
		const outcomes = DOCUMENTS.map((documentUrl) => ({
			documentUrl,
			resolved: resolveBrowser(documentUrl, FORMS.documentRelative),
		}));
		expect(outcomes).toEqual([
			{ documentUrl: "/", resolved: "/generated/x.js" },
			{ documentUrl: "/Poyo/", resolved: "/Poyo/generated/x.js" },
			{ documentUrl: "/Poyo/Login", resolved: "/Poyo/generated/x.js" },
			// A nested route has a different base directory, so the same
			// relative reference points somewhere else entirely.
			{
				documentUrl: "/Poyo/Settings/Profile",
				resolved: "/Poyo/Settings/generated/x.js",
			},
		]);
	});

	it("an API path is only inside the base when the base is prefixed", () => {
		const endpoint = "/api/Auth/Login";
		for (const base of BASES) {
			const prefixed = joinPaths(base, endpoint);
			expect(isInsideBase(prefixed, base)).toBe(true);
			// What the client does today: baseURL from data-base-path, then
			// the endpoint. Without the base the request escapes a subpath;
			// "" and "/" are the host root, where no prefix is needed.
			if (base === "" || base === "/") {
				expect(isInsideBase(endpoint, base)).toBe(true);
			} else {
				expect(isInsideBase(endpoint, base)).toBe(false);
			}
		}
	});
});

describe("poyo build emits the safe form", () => {
	function fixtureWithManifest(): ReturnType<typeof makeFixture> {
		const fixture = makeFixture();
		writeFixtureFile(
			fixture,
			"poyo.client/dist/.vite/manifest.json",
			JSON.stringify(
				{
					"src/main.tsx": {
						file: "generated/main-abc.js",
						isEntry: true,
						css: ["generated/main-abc.css"],
					},
				},
				null,
				2,
			),
		);
		for (const file of ["main-abc.js", "main-abc.css"]) {
			writeFixtureFile(
				fixture,
				`poyo.client/dist/generated/${file}`,
				"/* built */\n",
			);
		}
		return fixture;
	}

	it("writes asset tags whose resolution is inside every base", () => {
		const fixture = fixtureWithManifest();
		execInFixture(fixture, ["build"]);

		const partial = readFixtureFile(
			fixture,
			"Poyo.Server/Views/Shared/_ReactAssets.cshtml",
		);
		const emitted = [
			...partial.matchAll(/(?:src|href)="@Url\.Content\("([^"]+)"\)"/g),
		].map((match) => match[1]);
		expect(emitted).toEqual([
			"~/generated/main-abc.js",
			"~/generated/main-abc.css",
		]);

		for (const base of BASES) {
			for (const content of emitted) {
				expect(
					isInsideBase(resolveRazor(base, content), base),
					`${content} under '${base}'`,
				).toBe(true);
			}
		}
	});

	it("records the manifest in the same app-relative form", () => {
		const fixture = fixtureWithManifest();
		execInFixture(fixture, ["build"]);

		const manifest = JSON.parse(
			readFixtureFile(fixture, "Poyo.Server/wwwroot/manifest.json"),
		) as { js: string; css: string };
		expect(manifest).toEqual({
			js: "~/generated/main-abc.js",
			css: "~/generated/main-abc.css",
		});
	});
});
