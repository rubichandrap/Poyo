/**
 * Derives the project names the generated server cannot compile under.
 *
 * A project name becomes the root namespace (`<Name>.Server`). C# resolves a
 * simple name by walking outward through the enclosing namespaces and checks a
 * namespace's members before the `using` directives attached to it, so a root
 * namespace `Task` is found before `System.Threading.Tasks.Task` from every
 * file of the project, including Razor views. A name is therefore a hazard
 * exactly when the shipped C# uses it as a simple name. The candidate set is
 * every capitalized identifier token in the C# the generated project compiles:
 * the framework server core, the template server and its tests. In `.cs`
 * files comments and string text are dropped and interpolation holes kept; a
 * Razor view keeps everything but its comments. Over-collecting (a word in
 * Razor markup) only refuses a name nobody needs; under-collecting would let
 * a project through that does not compile.
 *
 * Run `node scripts/reserved-names.mjs --write` after changing shipped C#;
 * `test/reserved-names.test.ts` fails while the committed list is stale.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
export const SOURCE_ROOTS = [
	"packages/poyo/server",
	"packages/poyo-template/Poyo.Server",
	"packages/poyo-template/Poyo.Server.Tests",
];
/**
 * The C# files the derivation reads: those git tracks or would track, under
 * the source roots. Ignored files are build outputs (a built
 * `_ReactAssets.cshtml` carries content hashes such as `HbxBlxZ`) and differ
 * between machines, so a derivation that read them would disagree with CI.
 */
function sourceFiles() {
	const listed = execFileSync(
		"git",
		[
			"ls-files",
			"--cached",
			"--others",
			"--exclude-standard",
			"--",
			...SOURCE_ROOTS,
		],
		{ cwd: repo, encoding: "utf8" },
	);
	return listed
		.split("\n")
		.filter((file) => /\.(cs|cshtml)$/.test(file))
		.map((file) => path.join(repo, file))
		.filter((file) => fs.existsSync(file))
		.sort();
}

/**
 * Returns the code of a C# source with comments and string text removed. A
 * small lexer rather than regular expressions, because interpolated strings
 * nest: the holes of `$"…{Describe(route)}…"` are code and are kept, while
 * the literal text around them is dropped. Handles line and block comments,
 * Razor comments, character literals, regular, verbatim, raw and
 * interpolated strings (`$"`, `$@"`, `@$"`, `$"""`).
 */
export function stripNonCode(source) {
	let out = "";
	let i = 0;
	const n = source.length;
	// Reads a string starting at i (at its first prefix character) and returns
	// the index after it, appending the code of its holes to `out`.
	const readString = () => {
		let interpolated = false;
		let verbatim = false;
		let dollars = 0;
		while (source[i] === "$" || source[i] === "@") {
			if (source[i] === "$") {
				interpolated = true;
				dollars += 1;
			} else verbatim = true;
			i += 1;
		}
		let quotes = 0;
		while (source[i + quotes] === '"') quotes += 1;
		const raw = quotes >= 3;
		const delimiter = raw ? quotes : 1;
		if (!raw && quotes === 2) {
			i += 2; // empty string ""
			return;
		}
		i += delimiter;
		const braces = raw && interpolated ? dollars : 1;
		while (i < n) {
			const c = source[i];
			if (raw) {
				let run = 0;
				while (source[i + run] === '"') run += 1;
				if (run >= delimiter) {
					i += run;
					return;
				}
			} else if (verbatim) {
				if (c === '"' && source[i + 1] === '"') {
					i += 2;
					continue;
				}
				if (c === '"') {
					i += 1;
					return;
				}
			} else {
				if (c === "\\") {
					i += 2;
					continue;
				}
				if (c === '"' || c === "\n") {
					i += 1;
					return;
				}
			}
			if (interpolated && c === "{") {
				let run = 0;
				while (source[i + run] === "{") run += 1;
				if (!raw && run >= 2) {
					i += 2; // escaped brace
					continue;
				}
				if (run >= braces) {
					i += braces;
					// Each hole is its own code: separated from the next, so
					// `{Task}{Path}` reads as two names rather than `TaskPath`.
					out += " ";
					readCode("}");
					out += " ";
					// A raw string with `$$` closes its holes with `}}`.
					i += braces;
					continue;
				}
			}
			i += 1;
		}
	};
	// Reads code until `stop` at depth zero (or the end), appending it to out.
	const readCode = (stop) => {
		let depth = 0;
		while (i < n) {
			const c = source[i];
			const next = source[i + 1];
			if (stop && depth === 0 && c === stop) return;
			if (c === "/" && next === "/") {
				while (i < n && source[i] !== "\n") i += 1;
				continue;
			}
			if (c === "/" && next === "*") {
				const close = source.indexOf("*/", i + 2);
				i = close === -1 ? n : close + 2;
				out += " ";
				continue;
			}
			if (c === "@" && next === "*") {
				const close = source.indexOf("*@", i + 2);
				i = close === -1 ? n : close + 2;
				out += " ";
				continue;
			}
			if (c === "'") {
				const match = /^'(?:[^'\\\n]|\\.[^']*)'/.exec(source.slice(i));
				if (match) {
					i += match[0].length;
					out += " ";
					continue;
				}
			}
			if (
				c === '"' ||
				((c === "$" || c === "@") &&
					/^[$@]{1,4}"/.test(source.slice(i, i + 5)) &&
					!/[\w]/.test(source[i - 1] ?? ""))
			) {
				readString();
				out += " ";
				continue;
			}
			if (stop === "}" && c === "{") depth += 1;
			if (stop === "}" && c === "}") depth -= 1;
			out += c;
			i += 1;
		}
	};
	readCode(null);
	return out;
}

export function deriveReservedNames() {
	const names = new Set();
	for (const file of sourceFiles()) {
		const text = fs.readFileSync(file, "utf8");
		// Razor attribute values are code (`content="@ViewBag.Description"`),
		// so a view keeps its strings and loses only its comments; its markup
		// words are over-collected, which is the safe direction.
		const code = file.endsWith(".cshtml")
			? text.replace(/@\*[\s\S]*?\*@/g, " ").replace(/<!--[\s\S]*?-->/g, " ")
			: stripNonCode(text);
		for (const match of code.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
			names.add(match[0]);
		}
	}
	// The template's own name is rewritten to the project's, never compiled.
	names.delete("Poyo");
	return [...names].sort();
}

export function renderModule(names) {
	return `// Generated by scripts/reserved-names.mjs from the C# a generated project
// compiles. Do not edit; run \`node scripts/reserved-names.mjs --write\`.
export const RESERVED_TYPE_NAMES: ReadonlySet<string> = new Set([
${names.map((name) => `\t"${name}",`).join("\n")}
]);
`;
}

export const MODULE_PATH = path.join(
	here,
	"../src/reserved-names.generated.ts",
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const names = deriveReservedNames();
	if (process.argv.includes("--write")) {
		fs.writeFileSync(MODULE_PATH, renderModule(names));
		console.log(
			`wrote ${names.length} names to ${path.relative(repo, MODULE_PATH)}`,
		);
	} else {
		console.log(names.join(" "));
	}
}
