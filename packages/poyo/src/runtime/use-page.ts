import { useSyncExternalStore } from "react";
import { getNavigationStore } from "./navigation-store.js";

/** Narrows Page data to the plain object the accessors promise, or null. */
function asPageObject<T extends object>(value: unknown): T | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as T)
		: null;
}

/**
 * Hook for controller-authored Page data.
 *
 * A view controller supplies data through `this.PoyoPage(data)`. The shared
 * layout embeds that object into `window.SERVER_DATA` through
 * `@Html.PoyoPageData()`, which seeds the client navigation store. Dynamic
 * navigation updates the store with the descriptor's `pageData`; its
 * representation matches the same normalized value, while a later controller
 * invocation may produce fresh time-varying fields.
 *
 * It subscribes to the store, so a page below a memoized boundary re-renders
 * with the new data on navigation. Being a hook, it is called while a
 * component renders; code outside a component reads `getPageData()`.
 * Without a `window` it returns null, and non-object payloads (missing,
 * null, arrays, primitives) resolve to null — only a plain object is
 * returned, typed with `T`.
 *
 * Usage:
 *   const data = usePage<{ userId: number; role: string }>();
 */
export function usePage<
	T extends object = Record<string, unknown>,
>(): T | null {
	const store = getNavigationStore();
	const serverData = useSyncExternalStore(
		store.subscribe,
		store.getPageData,
		() => null,
	);
	if (typeof window === "undefined") return null;
	return asPageObject<T>(serverData);
}

/**
 * The current Page data, read once, for code outside a component render (an
 * event handler, a utility, a test). Same narrowing as `usePage()`; it does
 * not subscribe, so a component reads `usePage()` instead.
 */
export function getPageData<
	T extends object = Record<string, unknown>,
>(): T | null {
	if (typeof window === "undefined") return null;
	return asPageObject<T>(getNavigationStore().getPageData());
}

declare global {
	interface Window {
		// The server's @Html.PoyoPageData() helper embeds controller-supplied
		// Page data. The global stays `unknown`; usePage narrows supported objects.
		SERVER_DATA?: unknown;
	}
}
