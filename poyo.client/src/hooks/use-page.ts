/**
 * Hook to access server-injected data
 * Server sets ViewBag.ServerData which gets rendered as window.SERVER_DATA
 *
 * Usage:
 * const data = usePage<{ userId: number, role: string }>();
 */
export function usePage<T = unknown>(): T | null {
	if (typeof window === "undefined") return null;

	const serverData = window.SERVER_DATA;
	return serverData ?? null;
}
