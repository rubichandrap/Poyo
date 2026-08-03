export function toRouteName(rawPath: string): string {
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
