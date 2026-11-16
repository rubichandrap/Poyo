/**
 * Semantic-version range evaluation for the peer ranges this repo actually
 * depends on, written as an interval model rather than ad-hoc string checks.
 *
 * A range is a half-open interval of version tuples. That is the whole model:
 * every operator below maps to a bound pair, `satisfies` is one containment
 * test, and an operator outside the supported set throws instead of guessing —
 * a range this file does not understand must fail the gate loudly, not pass
 * it silently.
 */

/** @typedef {[number, number, number]} Version */

const SUPPORTED_OPERATORS = ["^", "~", ">=", "<=", ">", "<", "=", ""];

/**
 * @param {string} text
 * @returns {Version}
 */
export function parseVersion(text) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
	if (!match) {
		throw new Error(`Unsupported version: '${text}'. Only x.y.z is modelled.`);
	}
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** @param {Version} a @param {Version} b */
export function compareVersions(a, b) {
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
	}
	return 0;
}

/**
 * Parses one comparator into its bound. `x` / `X` / `*` in a position means
 * "any", which is what makes `^5.x` the interval [5.0.0, 6.0.0).
 *
 * @param {string} token
 * @returns {{lower: Version, lowerInclusive: boolean, upper: Version | null, upperInclusive: boolean}}
 */
function parseComparator(token) {
	const text = token.trim();
	if (text === "" || text === "*" || text === "x" || text === "X") {
		return {
			lower: [0, 0, 0],
			lowerInclusive: true,
			upper: null,
			upperInclusive: false,
		};
	}

	const operator =
		SUPPORTED_OPERATORS.slice()
			.sort((a, b) => b.length - a.length)
			.find((candidate) => candidate !== "" && text.startsWith(candidate)) ??
		"";
	const rest = text.slice(operator.length).trim();

	const partial =
		/^(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.exec(
			rest,
		);
	if (!partial) {
		throw new Error(`Unsupported range token: '${text}'.`);
	}

	/** @param {string | undefined} part */
	const numberOrNull = (part) => {
		if (part === undefined || part === "x" || part === "X" || part === "*") {
			return null;
		}
		return Number(part);
	};

	const major = numberOrNull(partial[1]);
	const minor = numberOrNull(partial[2]);
	const patch = numberOrNull(partial[3]);

	if (major === null) {
		if (operator !== "" && operator !== "=") {
			throw new Error(`Unsupported range token: '${text}'.`);
		}
		return {
			lower: [0, 0, 0],
			lowerInclusive: true,
			upper: null,
			upperInclusive: false,
		};
	}

	// The lowest version the token names, with wildcards pinned to zero.
	const base = /** @type {Version} */ [major, minor ?? 0, patch ?? 0];

	switch (operator) {
		case "^": {
			// Caret: allow changes that do not touch the leftmost non-zero
			// position, exactly as npm's default caret does.
			if (major > 0 || minor === null) {
				return {
					lower: base,
					lowerInclusive: true,
					upper: [major + 1, 0, 0],
					upperInclusive: false,
				};
			}
			if (minor > 0 || patch === null) {
				return {
					lower: base,
					lowerInclusive: true,
					upper: [0, minor + 1, 0],
					upperInclusive: false,
				};
			}
			return {
				lower: base,
				lowerInclusive: true,
				upper: [0, 0, patch + 1],
				upperInclusive: false,
			};
		}
		case "~": {
			const upper = /** @type {Version} */ [major, (minor ?? 0) + 1, 0];
			return {
				lower: base,
				lowerInclusive: true,
				upper,
				upperInclusive: false,
			};
		}
		case ">=":
			return {
				lower: base,
				lowerInclusive: true,
				upper: null,
				upperInclusive: false,
			};
		case ">":
			return {
				lower: base,
				lowerInclusive: false,
				upper: null,
				upperInclusive: false,
			};
		case "<":
			return {
				lower: [0, 0, 0],
				lowerInclusive: true,
				upper: base,
				upperInclusive: false,
			};
		case "<=":
			return {
				lower: [0, 0, 0],
				lowerInclusive: true,
				upper: base,
				upperInclusive: true,
			};
		case "=":
		case "":
			// A bare version with a wildcard is an x-range: `5` and `5.x`
			// are [5.0.0, 6.0.0), `5.9` is [5.9.0, 5.10.0).
			if (minor === null) {
				return {
					lower: base,
					lowerInclusive: true,
					upper: [major + 1, 0, 0],
					upperInclusive: false,
				};
			}
			if (patch === null) {
				return {
					lower: base,
					lowerInclusive: true,
					upper: [major, minor + 1, 0],
					upperInclusive: false,
				};
			}
			return {
				lower: base,
				lowerInclusive: true,
				upper: base,
				upperInclusive: true,
			};
		default:
			throw new Error(`Unsupported operator: '${operator}' in '${text}'.`);
	}
}

/**
 * A range is an alternation (`||`) of space-separated conjunctions of
 * comparators. Each branch is one interval; the range accepts a version when
 * any branch does, which is how npm reads `^18 || ^20 || >=22`.
 */
export function parseRange(range) {
	const branches = range.split("||");
	if (branches.some((branch) => branch.trim() === "")) {
		throw new Error(`Empty range branch in '${range}'.`);
	}
	return branches.map((branch) => parseConjunction(branch.trim()));
}

function parseConjunction(range) {
	const comparators = range.split(/\s+/).map(parseComparator);
	const lower = comparators
		.map((comparator) => ({
			version: comparator.lower,
			inclusive: comparator.lowerInclusive,
		}))
		.reduce((best, candidate) => {
			const order = compareVersions(candidate.version, best.version);
			if (order > 0) return candidate;
			if (order === 0 && !candidate.inclusive) return candidate;
			return best;
		});
	const upper = comparators
		.filter((comparator) => comparator.upper !== null)
		.map((comparator) => ({
			version: /** @type {Version} */ comparator.upper,
			inclusive: comparator.upperInclusive,
		}))
		.reduce((best, candidate) => {
			if (best === null) return candidate;
			const order = compareVersions(candidate.version, best.version);
			if (order < 0) return candidate;
			if (order === 0 && !candidate.inclusive) return candidate;
			return best;
		}, null);
	return { lower, upper };
}

/**
 * @param {string} version
 * @param {string} range
 */
export function satisfiesRange(version, range) {
	const parsedVersion = parseVersion(version);
	return parseRange(range).some(({ lower, upper }) => {
		const lowerOrder = compareVersions(parsedVersion, lower.version);
		if (lowerOrder < 0 || (lowerOrder === 0 && !lower.inclusive)) return false;
		if (upper === null) return true;
		const upperOrder = compareVersions(parsedVersion, upper.version);
		if (upperOrder > 0 || (upperOrder === 0 && !upper.inclusive)) return false;
		return true;
	});
}
