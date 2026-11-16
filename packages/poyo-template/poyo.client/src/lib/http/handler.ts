import { appBasePath } from "../base-path";
import { AxiosAdapter } from "./_axios-adapter";
import { HttpClient } from "./_http-client";

// An absolute VITE_SERVER_URL is the dev server, a different origin. Served by
// the .NET host, the API lives under the same path base as the app: a request
// to "/api/..." without that prefix leaves the app and 404s, so the base comes
// from the value Razor rendered rather than from a build-time guess.
const configuredBaseUrl = import.meta.env.VITE_SERVER_URL;
const pathBase = appBasePath();
const apiBaseUrl = configuredBaseUrl ?? (pathBase === "/" ? "" : pathBase);

const axiosAdapter = new AxiosAdapter({
	baseURL: apiBaseUrl,
	withCredentials: true, // Required for Cookie Auth
	headers: {
		"Content-Type": "application/json",
	},
});

export const httpClient = new HttpClient(axiosAdapter);
