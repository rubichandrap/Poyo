/**
 * Hook to access server-injected data
 * Server sets ViewBag.ServerData which gets rendered as window.SERVER_DATA
 *
 * Usage:
 * const data = usePage<{ userId: number, role: string }>();
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
