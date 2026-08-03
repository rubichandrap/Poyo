/**
 * Parses a JWT token to extract its payload.
 * Does not verify the signature (server does that).
 */
export function parseJwt<T = Record<string, unknown>>(token: string): T | null {
	try {
		const base64Url = token.split(".")[1];
		if (!base64Url) return null;

		const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
		const jsonPayload = decodeURIComponent(
			window
				.atob(base64)
				.split("")
				.map((c) => {
					return `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`;
				})
				.join(""),
		);

		return JSON.parse(jsonPayload) as T;
	} catch (e) {
		console.error("Failed to parse JWT", e);
		return null;
	}
}
