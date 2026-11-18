import { assertDeclarablePath } from "./path-segments.js";

export function toRouteName(rawPath: string): string {
	assertDeclarablePath(rawPath);

	const parts = rawPath.split(/[\\/]/).filter(Boolean);
	return parts
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("/");
}

export function toRoutePath(name: string): string {
	return `/${name}`;
}

/**
 * The identifier the scaffolded page declares. A route name keeps whatever the
 * URL spelled — a hyphen, a leading digit, a space — because that is the name
 * the registry and the view carry; a page component cannot, so the leaf
 * segment becomes PascalCase words and a name that would still start with a
 * digit is prefixed. `User-profile` becomes `UserProfile`, `123` becomes
 * `Page123`, and a name with no identifier characters becomes `Page`.
 *
 * `React` becomes `ReactPage`: the page imports `React` as a type, so a local
 * declaration of the same name would collide (TS2440).
 */
export function toComponentName(name: string): string {
	const leaf = name.split("/").filter(Boolean).pop() ?? "";
	const identifier = leaf
		.split(/[^A-Za-z0-9_$]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join("");

	if (identifier === "") return "Page";
	const valid = /^[A-Za-z_$]/.test(identifier)
		? identifier
		: `Page${identifier}`;
	return valid === "React" ? "ReactPage" : valid;
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
