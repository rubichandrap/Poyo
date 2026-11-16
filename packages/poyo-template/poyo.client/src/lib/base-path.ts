/**
 * The path the app is mounted under, as the server rendered it.
 *
 * Razor writes `data-base-path="@Url.Content("~/")"` on the mount root and on
 * `<body>`, so it already includes the host's path base (`/` at the host root,
 * `/Poyo/` under a subpath). Navigation, asset tags and API calls all resolve
 * against this one value; a second copy of the rule is how one of them
 * escapes the base.
 */
export function appBasePath(): string {
	const mountRoot = document.getElementById("react-root");
	const raw =
		mountRoot?.dataset.basePath ??
		document.body?.dataset.basePath ??
		(import.meta.env.VITE_BASE_URL as string | undefined) ??
		"/";
	const trimmed = raw.replace(/\/+$/, "");
	return trimmed === "" ? "/" : trimmed;
}
