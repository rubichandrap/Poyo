import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	MAX_PROJECT_NAME_LENGTH,
	type NameState,
	isProjectNameGrammatical,
	isProjectNameValid,
	projectNameError,
	stepName,
} from "../src/project-name.js";
import { RESERVED_TYPE_NAMES } from "../src/reserved-names.generated.js";
import {
	MODULE_PATH,
	deriveReservedNames,
	renderModule,
	stripNonCode,
} from "../scripts/reserved-names.mjs";
import { exists, makeTempDir, runCli } from "./helpers.js";

/**
 * An independent reading of the three consumers the name must satisfy. Kept
 * deliberately as direct assertions rather than a second state machine, so a
 * mistake in the automaton cannot be mirrored here.
 */
function oracleAccepts(name: string): boolean {
	if (name.length === 0 || name.length > MAX_PROJECT_NAME_LENGTH) return false;

	// C# namespace segment: `<Name>.Server` and `<Name>.Server.Controllers`.
	// The identifier start class of C# is letter-or-underscore, but a leading
	// underscore is refused here because the npm name is the lowercased name
	// and `_app.client` is legal only by accident; one grammar, one answer.
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;

	// One path segment: no separator, no traversal, no absolute escape.
	if (path.posix.basename(name) !== name) return false;
	if (path.win32.basename(name) !== name) return false;
	if (name === "." || name === "..") return false;
	if (name.includes("\0")) return false;

	// The npm package name is `<name>.client` after lowercasing, so the
	// lowercased form must survive npm's name rules.
	const npmName = `${name.toLowerCase()}.client`;
	if (
		!/^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(npmName)
	) {
		return false;
	}

	return true;
}

const ALPHABET = ["a", "Z", "0", "_", "-", ".", " ", "/", "\\", "é", "~", "+"];

/** Every string over ALPHABET of length 0..maxLength. */
function* enumerateStrings(maxLength: number): Generator<string> {
	yield "";
	let frontier = [""];
	for (let length = 1; length <= maxLength; length++) {
		const next: string[] = [];
		for (const prefix of frontier) {
			for (const character of ALPHABET) {
				const candidate = prefix + character;
				next.push(candidate);
				yield candidate;
			}
		}
		frontier = next;
	}
}

describe("project-name automaton (model check)", () => {
	it("agrees with the three-consumer oracle on every string up to length 4", () => {
		const disagreements: string[] = [];
		let checked = 0;
		for (const candidate of enumerateStrings(4)) {
			checked += 1;
			if (isProjectNameGrammatical(candidate) !== oracleAccepts(candidate)) {
				disagreements.push(JSON.stringify(candidate));
			}
		}
		// 12^0 + 12^1 + 12^2 + 12^3 + 12^4 — a guard, so a shortened
		// enumeration cannot pass as a proof.
		expect(checked).toBe(22621);
		expect(disagreements).toEqual([]);
	});

	it("keeps the reject state absorbing for every character", () => {
		for (const character of ALPHABET) {
			expect(stepName("reject", character)).toBe("reject");
		}
	});

	it("reaches both accepting and refusing outcomes from start", () => {
		const states = new Set<NameState>(["start"]);
		for (const character of ALPHABET) states.add(stepName("start", character));
		expect(states.has("body")).toBe(true);
		expect(states.has("reject")).toBe(true);
	});

	it("holds the length boundary at each side", () => {
		const atLimit = "a".repeat(MAX_PROJECT_NAME_LENGTH);
		const overLimit = "a".repeat(MAX_PROJECT_NAME_LENGTH + 1);
		expect(isProjectNameValid(atLimit)).toBe(true);
		expect(isProjectNameValid(overLimit)).toBe(false);
		expect(projectNameError(overLimit)).toContain("at most");
	});

	it("states the broken rule for each refusal", () => {
		expect(projectNameError("")).toContain("must not be empty");
		expect(projectNameError("1App")).toContain(
			"must start with an ASCII letter",
		);
		expect(projectNameError("my-app")).toContain("only ASCII letters");
		expect(projectNameError("app.name")).toContain("only ASCII letters");
		expect(projectNameError("app name")).toContain("only ASCII letters");
	});
});

describe("names the generated server cannot compile under", () => {
	// Each of these scaffolded under 0.5.0 and failed `dotnet build`: the root
	// namespace `<Name>` is found before the `using` import of the type.
	it.each([
		"Task",
		"task",
		"Environment",
		"Path",
		"Exception",
	])("refuses '%s', which the shipped C# uses as a simple name", (name) => {
		expect(isProjectNameGrammatical(name)).toBe(true);
		expect(isProjectNameValid(name)).toBe(false);
		expect(projectNameError(name)).toContain("would not compile");
	});

	it("keeps the committed list equal to a fresh derivation from the shipped C#", () => {
		// A Windows checkout writes CRLF; the list is content, not endings.
		const committed = fs
			.readFileSync(MODULE_PATH, "utf-8")
			.replaceAll("\r\n", "\n");
		expect(committed).toBe(renderModule(deriveReservedNames()));
		expect([...RESERVED_TYPE_NAMES]).toEqual(deriveReservedNames());
	});

	it("collects the names a refusal depends on and no string text", () => {
		const names = new Set(deriveReservedNames());
		for (const used of [
			"Task",
			"Environment",
			"Path",
			"Exception",
			"ViewBag",
		]) {
			expect(names.has(used)).toBe(true);
		}
		expect(names.has("Poyo")).toBe(false);
		// Prose inside an interpolated error message is not code.
		expect(names.has("A")).toBe(false);
	});

	it.each([
		['$"route {Describe(route)} is Bad" Next', ["Describe", "Next"]],
		['@"Verbatim ""Quoted""" After', ["After"]],
		['$"""Raw {Hole} text""" Z', ["Hole", "Z"]],
		["// Comment\nCode /* Block */ More", ["Code", "More"]],
		["c = 'A'; D", ["D"]],
		['$"{{Escaped}} {Real}"', ["Real"]],
		// Adjacent holes are separate code, not one merged name.
		['$"{Task}{Path}" After', ["Task", "Path", "After"]],
		// A $$ raw string opens and closes its holes with two braces.
		['$$"""{{Hole}} {Text}""" Z', ["Hole", "Z"]],
	])("strips string text but keeps interpolation holes: %s", (source, want) => {
		const got = [...stripNonCode(source).matchAll(/\b[A-Z]\w*\b/g)].map(
			(match) => match[0],
		);
		expect(got).toEqual(want);
	});
});

describe("Windows reserved device names", () => {
	it.each([
		"CON",
		"con",
		"Con",
		"PRN",
		"AUX",
		"NUL",
		"COM1",
		"com9",
		"LPT1",
	])("refuses '%s'", (name) => {
		expect(isProjectNameValid(name)).toBe(false);
		expect(projectNameError(name)).toContain("reserved device name");
	});

	it.each([
		"Console",
		"Common",
		"Auxiliary",
		"Lpt",
		"Nullable1",
	])("accepts '%s', which only starts like one", (name) => {
		expect(isProjectNameValid(name)).toBe(true);
	});
});

describe("scaffolder name validation (seam)", () => {
	it.each([
		["my-app", "hyphen"],
		["1App", "leading digit"],
		["app.name", "dot"],
		["..", "traversal"],
		["app/child", "separator"],
		["app name", "space"],
		["Task", "shadows a type the server uses"],
		["con", "Windows device name"],
	])("refuses '%s' (%s) before creating anything", (name) => {
		const cwd = makeTempDir();
		const before = fs.readdirSync(cwd);
		const result = runCli([name, "--skip-install"], { cwd });

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("[ERROR]");
		// The snapshot covers names that would land outside cwd (`..`,
		// absolute paths) as well as ordinary ones: nothing may be created.
		expect(fs.readdirSync(cwd)).toEqual(before);
	});

	it.each([
		"App",
		"App_1",
		"a",
		"X2",
		"MyPoyoApp",
	])("scaffolds '%s'", (name) => {
		const cwd = makeTempDir();
		const result = runCli([name, "--skip-install"], { cwd });

		expect(result.status).toBe(0);
		expect(exists(cwd, `${name}/package.json`)).toBe(true);
		expect(exists(cwd, `${name}/${name.toLowerCase()}.client`)).toBe(true);
		// The namespace the grammar promised: a leading digit or hyphen in
		// the name would have produced an uncompilable `.cs` file here.
		const pascal = name.charAt(0).toUpperCase() + name.slice(1);
		expect(exists(cwd, `${name}/${pascal}.Server`)).toBe(true);
	});
});
