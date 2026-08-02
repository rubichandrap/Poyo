import { ENDPOINTS } from "../lib/api";
import { httpClient } from "../lib/http";
import type { HttpRequestConfig } from "../lib/http/types";
import type { components } from "../schemas/dtos.generated";

export const authService = {
	login: async (
		data: components["schemas"]["LoginRequest"],
		options?: HttpRequestConfig,
	) => {
		const response = await httpClient.post<
			components["schemas"]["JSendResponseOfLoginResponse"]
		>(ENDPOINTS.AUTH.LOGIN, data, options);
		return response.data;
	},
	logout: async (options?: HttpRequestConfig) => {
		const response = await httpClient.post<
			components["schemas"]["JSendResponseOfLogoutResponse"]
		>(ENDPOINTS.AUTH.LOGOUT, undefined, options);
		return response.data;
	},
};
