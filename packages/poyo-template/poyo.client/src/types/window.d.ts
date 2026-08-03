export {};

declare global {
	interface Window {
		// SERVER_DATA is injected by the ASP.NET Core View
		// It can be any JSON object, so we default to unknown or any
		// specific shape if we had one.
		// biome-ignore lint/suspicious/noExplicitAny: Server data is untyped
		SERVER_DATA?: any;
	}
}
