import { CliError } from "./error.js";

/** A path segment a declared route path may not carry. */
export interface RefusedSegment {
	readonly kind: "empty" | "dot";
	/** The segment as it was written, so the message quotes editable text. */
	readonly written: string;
}

/**
 * The first segment a route path may not declare, or `undefined` when it has
 * none. A leading or trailing separator is not a segment: the root path and a
 * trailing slash are the registry's own rules, judged where a path is
 * declared.
 *
 * A dot segment includes the percent-encoded spellings. The URL parser reads
 * `%2e` as a dot, so `.%2e`, `%2e.` and `%2e%2e` are `..` and `%2e` is `.`
 * before a browser even asks for the page.
 */
export function firstRefusedSegment(
	rawPath: string,
): RefusedSegment | undefined {
	const segments = rawPath.split(/[\\/]/);
	if (segments[0] === "") segments.shift();
	if (segments[segments.length - 1] === "") segments.pop();

	const segment = segments.find(
		(candidate) => candidate === "" || isDotSegment(candidate),
	);
	if (segment === undefined) return undefined;

	return segment === ""
		? { kind: "empty", written: segment }
		: { kind: "dot", written: segment };
}

/**
 * What is wrong with a refused segment, as one sentence the registry reader
 * and the route-name derivation both report. The two kinds fail for different
 * reasons and so are told apart: a dot segment is one a browser normalizes
 * away, which leaves the route unreachable at the URL the registry states; an
 * empty segment is one ASP.NET's route patterns cannot express, so mapping it
 * throws a routing error at boot that names neither the route nor its file.
 */
export function segmentRefusal(refused: RefusedSegment): string {
	if (refused.kind === "empty") {
		return (
			"declares an empty segment — a path with two separators in a row is " +
			"not an ASP.NET route pattern, so the server could not map it"
		);
	}

	return (
		`declares the "${refused.written}" segment — a browser reads it as a dot ` +
		"segment and normalizes it away, so the route could never be reached"
	);
}

/**
 * Refuses a path before any file path is derived from it: a path becomes a
 * route name, and a name becomes the page and view file paths, so a dot
 * segment would resolve the write outside `src/pages/` or `Views/`.
 */
export function assertPathSegments(rawPath: string): void {
	const refused = firstRefusedSegment(rawPath);
	if (refused === undefined) return;

	throw new CliError(
		`Refusing route path "${rawPath}": it ${segmentRefusal(refused)}.`,
	);
}

function isDotSegment(segment: string): boolean {
	const decoded = segment.replace(/%2e/gi, ".");
	return decoded === "." || decoded === "..";
}
