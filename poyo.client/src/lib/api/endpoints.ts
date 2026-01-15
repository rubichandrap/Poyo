import type { paths } from "~/schemas/dtos.generated";

type ApiPath = keyof paths;

type EndpointTree = ApiPath | { readonly [key: string]: EndpointTree };

export const ENDPOINTS = {
	AUTH: {
		LOGIN: "/api/Auth/Login",
		LOGOUT: "/api/Auth/Logout",
		REFRESH: "/api/Auth/Refresh",
	},
} as const satisfies EndpointTree;
