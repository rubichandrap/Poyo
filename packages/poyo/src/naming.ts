import { CliError } from "./error.js";

/**
 * Rejects a path with an empty, "." or ".." segment before any file path is
 * derived from it.
 *
 * A path becomes a route name, and a name becomes the page and view file
 * paths, so a segment the name carried would resolve the write outside
 * `src/pages/` or `Views/` — and with enough of them, outside the project.
 * The URL it would declare is one a browser normalizes away, so the route
 * could never be reached even where the files landed. The segment is named
 * in the message because the fix is editing the argument.
 *
 * A leading or trailing separator is not a segment: `/` and a declared
 * trailing slash are the registry's rules, judged where a path is declared.
 */
export function assertPathSegments(rawPath: string): void {
	const segments = rawPath.split(/[\\/]/);
	if (segments[0] === "") segments.shift();
	if (segments[segments.length - 1] === "") segments.pop();

	const segment = segments.find(
		(candidate) => candidate === "" || candidate === "." || candidate === "..",
	);
	if (segment === undefined) return;

	const named = segment.length === 0 ? "an empty" : `a "${segment}"`;

	throw new CliError(
		`Refusing route path "${rawPath}": it declares ${named} segment. A route path must ` +
			'have no empty, "." or ".." segment: a browser normalizes it away, so the route ' +
			"could never be reached.",
	);
}

export function toRouteName(rawPath: string): string {
	assertPathSegments(rawPath);

	const parts = rawPath.split(/[\\/]/).filter(Boolean);
	return parts
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("/");
}

export function toRoutePath(name: string): string {
	return `/${name}`;
}

export function resolveRouteFiles(
	name: string,
	isFlat = false,
): { react: string; view: string } {
	if (isFlat) {
		const parts = name.split("/");
		const leaf = parts.pop();
		if (!leaf) throw new Error(`Invalid route name: '${name}'`);
		const parent = parts.join("/");
		const basePath = parent ? `${parent}/` : "";
		return {
			react: `src/pages/${basePath}${leaf.toLowerCase()}.page.tsx`,
			view: `Views/${basePath}${leaf}.cshtml`,
		};
	}
	return {
		react: `src/pages/${name}/index.page.tsx`,
		view: `Views/${name}/Index.cshtml`,
	};
}
