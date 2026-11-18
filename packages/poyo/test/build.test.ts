import { describe, expect, it } from "vitest";
import {
	execInFixture,
	existsFixtureFile,
	makeFixture,
	readFixtureFile,
	writeFixtureFile,
} from "./helpers.js";

interface ManifestChunk {
	file: string;
	isEntry?: boolean;
	css?: string[];
	assets?: string[];
	imports?: string[];
}

function writeManifest(
	fixture: ReturnType<typeof makeFixture>,
	chunks: Record<string, ManifestChunk>,
): void {
	writeFixtureFile(
		fixture,
		"poyo.client/dist/.vite/manifest.json",
		JSON.stringify(chunks, null, 2),
	);
}

function fixtureWithAssets(): ReturnType<typeof makeFixture> {
	const fixture = makeFixture();
	writeManifest(fixture, {
		"index.html": {
			file: "generated/index-abc.js",
			isEntry: true,
			css: ["generated/index-abc.css"],
		},
		"src/main.tsx": { file: "generated/chunk-zzz.js" },
	});
	writeFixtureFile(
		fixture,
		"poyo.client/dist/generated/index-abc.js",
		"console.log('index');\n",
	);
	writeFixtureFile(
		fixture,
		"poyo.client/dist/generated/index-abc.css",
		".app{}\n",
	);
	writeFixtureFile(
		fixture,
		"poyo.client/dist/generated/chunk-zzz.js",
		"console.log('chunk');\n",
	);
	writeFixtureFile(
		fixture,
		"Poyo.Server/wwwroot/generated/stale-old.js",
		"// stale\n",
	);
	return fixture;
}

describe("poyo build", () => {
	it("copies active assets into wwwroot/generated and prunes stale files", () => {
		const fixture = fixtureWithAssets();
		const result = execInFixture(fixture, ["build"]);

		expect(result.status).toBe(0);
		expect(
			readFixtureFile(fixture, "Poyo.Server/wwwroot/generated/index-abc.js"),
		).toBe("console.log('index');\n");
		expect(
			readFixtureFile(fixture, "Poyo.Server/wwwroot/generated/chunk-zzz.js"),
		).toBe("console.log('chunk');\n");
		expect(
			existsFixtureFile(fixture, "Poyo.Server/wwwroot/generated/stale-old.js"),
		).toBe(false);
	});

	it("writes _ReactAssets.cshtml referencing the entry js and css", () => {
		const fixture = fixtureWithAssets();
		execInFixture(fixture, ["build"]);

		const content = readFixtureFile(
			fixture,
			"Poyo.Server/Views/Shared/_ReactAssets.cshtml",
		);
		expect(content).toContain('src="@Url.Content("~/generated/index-abc.js")"');
		expect(content).toContain(
			'href="@Url.Content("~/generated/index-abc.css")"',
		);
	});

	it("writes a css-less _ReactAssets when the entry has no css", () => {
		const fixture = fixtureWithAssets();
		writeManifest(fixture, {
			"index.html": { file: "generated/index-no.css.js", isEntry: true },
		});
		writeFixtureFile(
			fixture,
			"poyo.client/dist/generated/index-no.css.js",
			"console.log('index');\n",
		);

		execInFixture(fixture, ["build"]);

		const content = readFixtureFile(
			fixture,
			"Poyo.Server/Views/Shared/_ReactAssets.cshtml",
		);
		expect(content).toContain(
			'src="@Url.Content("~/generated/index-no.css.js")"',
		);
		expect(content).not.toContain('<link rel="stylesheet"');
	});

	it("writes wwwroot/manifest.json with the entry js and css", () => {
		const fixture = fixtureWithAssets();
		execInFixture(fixture, ["build"]);

		const manifest = JSON.parse(
			readFixtureFile(fixture, "Poyo.Server/wwwroot/manifest.json"),
		);
		expect(manifest).toEqual({
			// App-relative: a consumer resolves these with Url.Content so the
			// host's path base is applied.
			js: "~/generated/index-abc.js",
			css: ["~/generated/index-abc.css"],
		});
	});

	it("fails naming a manifest file that the client build did not produce", () => {
		const fixture = makeFixture();
		writeManifest(fixture, {
			"index.html": {
				file: "generated/index-abc.js",
				isEntry: true,
				css: ["generated/index-abc.css"],
			},
			"src/main.tsx": { file: "generated/chunk-zzz.js" },
		});
		writeFixtureFile(
			fixture,
			"poyo.client/dist/generated/index-abc.js",
			"console.log('index');\n",
		);

		const result = execInFixture(fixture, ["build"]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("missing");
		expect(result.stderr).toContain("generated/index-abc.css");
		// Nothing is copied or pruned when the asset set is incomplete.
		expect(
			existsFixtureFile(fixture, "Poyo.Server/wwwroot/generated/index-abc.js"),
		).toBe(false);
	});

	it("emits the css of chunks the entry imports statically", () => {
		const fixture = makeFixture();
		writeManifest(fixture, {
			"index.html": {
				file: "generated/index-abc.js",
				isEntry: true,
				css: ["generated/index-abc.css"],
				imports: ["_shared-zzz.js"],
			},
			"_shared-zzz.js": {
				file: "generated/shared-zzz.js",
				css: ["generated/shared-zzz.css"],
				imports: ["theme.js"],
			},
			"theme.js": {
				file: "generated/theme-qqq.js",
				css: ["generated/theme-qqq.css"],
			},
		});
		for (const file of [
			"generated/index-abc.js",
			"generated/index-abc.css",
			"generated/shared-zzz.js",
			"generated/shared-zzz.css",
			"generated/theme-qqq.js",
			"generated/theme-qqq.css",
		]) {
			writeFixtureFile(fixture, `poyo.client/dist/${file}`, "/* asset */\n");
		}

		execInFixture(fixture, ["build"]);

		const content = readFixtureFile(
			fixture,
			"Poyo.Server/Views/Shared/_ReactAssets.cshtml",
		);
		// Vite's backend-integration order: the entry's own stylesheets, then
		// the imported chunks', following `imports` recursively.
		const order = [
			'~/generated/index-abc.css")"',
			'~/generated/shared-zzz.css")"',
			'~/generated/theme-qqq.css")"',
		].map((needle) => content.indexOf(needle));
		expect(order.every((index) => index !== -1)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));

		const manifest = JSON.parse(
			readFixtureFile(fixture, "Poyo.Server/wwwroot/manifest.json"),
		) as { css: string[] };
		expect(manifest.css).toEqual([
			"~/generated/index-abc.css",
			"~/generated/shared-zzz.css",
			"~/generated/theme-qqq.css",
		]);
	});

	it("fails with a clear error when the Vite manifest is missing", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["build"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Vite manifest not found");
	});
});
