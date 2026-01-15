import { AxiosAdapter } from "./_axios-adapter";
import { HttpClient } from "./_http-client";

const apiBaseUrl = import.meta.env.VITE_SERVER_URL;

if (!apiBaseUrl) {
	console.error(
		"❌ VITE_SERVER_URL is not defined in the environment variables.",
	);
}

const axiosAdapter = new AxiosAdapter({
	baseURL: apiBaseUrl,
	withCredentials: true, // Required for Cookie Auth
	headers: {
		"Content-Type": "application/json",
	},
});

export const httpClient = new HttpClient(axiosAdapter);
