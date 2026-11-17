import { CliError } from "./error.js";

/** A reason a declared route path may not be declared as written. */
export interface PathRefusal {
	readonly kind: "backslash" | "empty" | "dot";
	/** The segment (or path) as written, so the message quotes editable text. */
	readonly written: string;
}

/**
 * A declared path holding a backslash, which a browser reads as `/`. It is
 * asked for before the trailing-slash and segment rules, in the order the
 * server applies them, because the backslash is the mistake that decides what
 * the path means: `/Admin\Users/` is a backslash path whatever its trailing
 * separator, and both runtimes must say so.
 */
export function backslashRefusal(rawPath: string): PathRefusal | undefined {
	return rawPath.includes("\\")
		? { kind: "backslash", written: rawPath }
		: undefined;
}

/**
 * The first dot or empty segment a path may not carry, or `undefined` when it
 * has none. A leading or trailing separator is not a segment: the root path
 * and a trailing slash are the registry's own rules, judged where a path is
 * declared.
 *
 * A dot segment includes the percent-encoded spellings. The URL parser reads
 * `%2e` as a dot, so `.%2e`, `%2e.` and `%2e%2e` are `..` and `%2e` is `.`
 * before a browser even asks for the page.
 */
export function firstRefusedSegment(rawPath: string): PathRefusal | undefined {
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
 * What is wrong with a refused path, as one sentence the registry reader and
 * the route-name derivation both report. The kinds fail for different reasons
 * and so are told apart: a backslash is read as "/" by the browser, so the
 * route is never requested as declared; a dot segment is normalized away,
 * which leaves the route unreachable; an empty segment is one ASP.NET's route
 * patterns cannot express, so mapping it throws a routing error at boot that
 * names neither the route nor its file.
 */
export function refusalMessage(refused: PathRefusal): string {
	if (refused.kind === "backslash") {
		return (
			'declares a backslash — a browser reads a backslash as "/" in a URL ' +
			"path, so the route is never requested as declared"
		);
	}

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
 *
 * A backslash is not refused here but read as a separator, as it is to a
 * browser and to a developer on Windows: the derived name holds only
 * separators, so the argument can never put a backslash in the registry.
 */
export function assertPathSegments(rawPath: string): void {
	const refused = firstRefusedSegment(rawPath);
	if (refused === undefined) return;

	throw new CliError(
		`Refusing route path "${rawPath}": it ${refusalMessage(refused)}.`,
	);
}

function isDotSegment(segment: string): boolean {
	const decoded = segment.replace(/%2e/gi, ".");
	return decoded === "." || decoded === "..";
}
