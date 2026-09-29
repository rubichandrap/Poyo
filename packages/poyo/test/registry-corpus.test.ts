import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getPaths } from "../src/config.js";
import { readRoutes } from "../src/registry.js";

/**
 * The registry corpus is the contract the server and the route manager are
 * held to together, rather than two suites asserting two sets of wording.
 *
 * The rules are written twice — once in C#, once in TypeScript — because the
 * two run the registry at different times and a bad one is refused in one of
 * them first. Two suites that each assert their own wording cannot detect the
 * wording drifting apart, so both read the same corpus instead: every case is
 * a registry and the verdict it earns, and a rule added to one runtime with
 * nothing pinning it on the other side turns this file red.
 *
 * The corpus lives at the repository root, owned by neither package, because
 * `packages/poyo` must not read files out of `poyo-template` and the
 * template's test project must not read them out of a published package. It is
 * read only at test time, so neither published artifact depends on it.
 */
const CORPUS_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../fixtures/registry",
);

type Verdict = "accept" | "reject";

interface CorpusCase {
	id: string;
	/** The verdict both runtimes are expected to earn, or `null` when pinned. */
	verdict: Verdict | null;
	verdicts: { server: Verdict; manager: Verdict };
	message: string[];
	note: string;
	registry: unknown;
	text: string;
}

function isVerdict(value: unknown): value is Verdict {
	return value === "accept" || value === "reject";
}

function loadCorpus(): CorpusCase[] {
	return fs
		.readdirSync(CORPUS_DIR)
		.filter((entry) => entry.endsWith(".json"))
		.sort()
		.map((entry) => {
			const body = JSON.parse(
				fs.readFileSync(path.join(CORPUS_DIR, entry), "utf-8"),
			) as Partial<CorpusCase>;

			// The file name is the case id, so a case cannot be renamed without
			// the test names following it and a duplicated id cannot exist.
			const shared = body.verdict;
			const pinned = body.verdicts;

			if ((shared === undefined) === (pinned === undefined)) {
				throw new Error(
					`${entry}: exactly one of "verdict" and "verdicts" must be declared`,
				);
			}

			// A verdict is asserted, not cast through: a case whose verdict is a
			// typo would otherwise read as `accept` and quietly stop being a
			// case, which is the one way a corpus rots without anyone noticing.
			const server = pinned ? pinned.server : shared;
			const manager = pinned ? pinned.manager : shared;
			if (!isVerdict(server) || !isVerdict(manager)) {
				throw new Error(`${entry}: a verdict must be "accept" or "reject"`);
			}

			return {
				id: entry.replace(/\.json$/, ""),
				verdict: shared ?? null,
				verdicts: { server, manager },
				message: body.message ?? [],
				note: body.note ?? "",
				registry: body.registry,
				text: body.text,
			};
		});
}

const cases = loadCorpus();

/**
 * The registry the case declares, as a file on disk. `readRoutes` is the seam
 * under test rather than `validateRoutes`: every route command reads the
 * registry through it, and it is the only place the parse error and the
 * validation errors are both reported.
 */
function read(corpusCase: CorpusCase): {
	verdict: Verdict;
	/** What the runtime said: a failure message, or the routes it accepted. */
	outcome: string;
} {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poyo-registry-corpus-"));
	try {
		fs.writeFileSync(
			path.join(dir, "routes.json"),
			corpusCase.text ?? `${JSON.stringify(corpusCase.registry, null, "\t")}\n`,
		);

		const routes = readRoutes(getPaths(dir));

		return { verdict: "accept", outcome: `accepted ${routes.length} route(s)` };
	} catch (error) {
		return {
			verdict: "reject",
			outcome: error instanceof Error ? error.message : String(error),
		};
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

describe("registry corpus", () => {
	it("holds cases, so an empty or relocated corpus is a failure and not a vacuous pass", () => {
		expect(cases.length).toBeGreaterThan(0);
	});

	it("records why every case exists", () => {
		const undocumented = cases
			.filter((corpusCase) => corpusCase.note.trim().length === 0)
			.map((corpusCase) => corpusCase.id);

		expect(undocumented).toEqual([]);
	});

	it.each(
		cases.map((corpusCase) => [corpusCase.id, corpusCase] as const),
	)("%s", (id, corpusCase) => {
		const outcome = read(corpusCase);

		expect(
			outcome.verdict,
			`the route manager ${outcome.verdict === "accept" ? "accepted" : "rejected"} ` +
				`a registry the corpus says it should ${corpusCase.verdicts.manager}: ` +
				`${outcome.outcome}`,
		).toBe(corpusCase.verdicts.manager);

		// A pinned difference asserts its fragments of the side that refuses it;
		// there is nothing to match on the side that accepts.
		if (outcome.verdict !== "reject") {
			return;
		}

		for (const fragment of corpusCase.message) {
			expect(
				outcome.outcome.toLowerCase(),
				`${id}: "${fragment}" is missing from "${outcome.outcome}"`,
			).toContain(fragment.toLowerCase());
		}
	});
});
