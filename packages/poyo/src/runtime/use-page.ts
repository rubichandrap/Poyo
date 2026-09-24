import { getNavigationStore } from "./navigation-store.js";

/**
 * Accessor for controller-authored Page data.
 *
 * A view controller supplies data through `this.PoyoPage(data)`. The shared
 * layout embeds that object into `window.SERVER_DATA` through
 * `@Html.PoyoPageData()`, which seeds the client navigation store. Dynamic
 * navigation updates the store with the descriptor's structurally equal
 * `pageData`.
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

	const serverData = getNavigationStore().getPageData();

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
		// The server's @Html.PoyoPageData() helper embeds controller-supplied
		// Page data. The global stays `unknown`; usePage narrows supported objects.
		SERVER_DATA?: unknown;
	}
}
