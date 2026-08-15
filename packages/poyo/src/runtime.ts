/**
 * Client runtime for generated Poyo projects — shipped as the
 * "@rubichandrap/poyo/runtime" subpath export.
 *
 * The server serializes `ViewBag.ServerData` into `window.SERVER_DATA`
 * (see `_Layout.cshtml`); `usePage` reads that channel once per page load.
 * It is SSR-safe: without a `window` it returns null, and non-object
 * payloads (missing, null, arrays, primitives) also resolve to null — only
 * a plain object is returned, typed with `T`.
 *
 * Usage:
 *   const data = usePage<{ userId: number; role: string }>();
 */
export function usePage<
	T extends object = Record<string, unknown>,
>(): T | null {
	if (typeof window === "undefined") return null;

	const serverData = window.SERVER_DATA;

	if (
		typeof serverData === "object" &&
		serverData !== null &&
		!Array.isArray(serverData)
	) {
		return serverData as T;
	}
	return null;
}

declare global {
	interface Window {
		// SERVER_DATA is injected by the ASP.NET Core view (_Layout.cshtml).
		// It can be any JSON value, so it stays `unknown`; usePage narrows it.
		SERVER_DATA?: unknown;
	}
}
