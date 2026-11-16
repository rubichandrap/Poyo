import { appBasePath } from "../base-path";
import { AxiosAdapter } from "./_axios-adapter";
import { HttpClient } from "./_http-client";

// A dev-server build is the only build that talks to another origin. A
// production build is served by the host that owns the API, so its base is the
// app's own path base — and a VITE_SERVER_URL left in the project's .env by
// development must not follow the bundle into production.
const configuredBaseUrl = import.meta.env.DEV
	? import.meta.env.VITE_SERVER_URL
	: undefined;
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
