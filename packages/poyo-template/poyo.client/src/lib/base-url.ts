/**
 * Application base URL from the build-time env (VITE_BASE_URL). Supports both
 * full URLs (https://host/Poyo) and path-only values (/Poyo); the route
 * loader resolves the server's runtime base path (data-base-path) separately.
 */
const rawBaseUrl = (import.meta.env.VITE_BASE_URL as string | undefined) ?? "/";

export const BASE_URL =
	rawBaseUrl !== "/" && rawBaseUrl.endsWith("/")
		? rawBaseUrl.slice(0, -1)
		: rawBaseUrl;

/**
 * Joins an app-relative path (e.g. a route path from the typed route table)
 * onto the base URL. Handles the root case: BASE_URL is "/" at root, and a
 * naive `${BASE_URL}${path}` would produce a protocol-relative "//path" href.
 */
export function appUrl(path: string): string {
	const base = BASE_URL === "/" ? "" : BASE_URL;
	return `${base}${path}`;
}
