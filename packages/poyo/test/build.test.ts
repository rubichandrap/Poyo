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
		expect(content).toContain('src="/generated/index-abc.js"');
		expect(content).toContain('href="/generated/index-abc.css"');
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
		expect(content).toContain('src="/generated/index-no.css.js"');
		expect(content).not.toContain('<link rel="stylesheet"');
	});

	it("writes wwwroot/manifest.json with the entry js and css", () => {
		const fixture = fixtureWithAssets();
		execInFixture(fixture, ["build"]);

		const manifest = JSON.parse(
			readFixtureFile(fixture, "Poyo.Server/wwwroot/manifest.json"),
		);
		expect(manifest).toEqual({
			js: "/generated/index-abc.js",
			css: "/generated/index-abc.css",
		});
	});

	it("fails with a clear error when the Vite manifest is missing", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["build"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Vite manifest not found");
	});
});
