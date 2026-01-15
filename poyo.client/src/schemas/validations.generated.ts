import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

const LoginRequest = z
	.object({
		username: z.string().min(0).max(150),
		password: z.string().min(2).max(100),
		rememberMe: z.boolean().optional(),
		appType: z.string().optional(),
	})
	.passthrough();
const LoginResponse = z
	.object({
		token: z.string(),
		refreshToken: z.string(),
		expiration: z.string().datetime({ offset: true }),
		username: z.string(),
	})
	.partial()
	.passthrough();
const JSendResponseOfLoginResponse = z
	.object({
		status: z.string(),
		data: z.union([z.unknown(), LoginResponse]),
		message: z.string().nullable(),
	})
	.partial()
	.passthrough();
const JSendResponseOfObject = z
	.object({
		status: z.string(),
		data: z.unknown(),
		message: z.string().nullable(),
	})
	.partial()
	.passthrough();
const RefreshRequest = z
	.object({ token: z.string(), refreshToken: z.string() })
	.partial()
	.passthrough();
const LogoutResponse = z
	.object({ message: z.string(), success: z.boolean() })
	.partial()
	.passthrough();
const JSendResponseOfLogoutResponse = z
	.object({
		status: z.string(),
		data: z.union([z.unknown(), LogoutResponse]),
		message: z.string().nullable(),
	})
	.partial()
	.passthrough();

export const schemas = {
	LoginRequest,
	LoginResponse,
	JSendResponseOfLoginResponse,
	JSendResponseOfObject,
	RefreshRequest,
	LogoutResponse,
	JSendResponseOfLogoutResponse,
};

const endpoints = makeApi([
	{
		method: "post",
		path: "/api/Auth/Login",
		alias: "postApiAuthLogin",
		requestFormat: "json",
		parameters: [
			{
				name: "body",
				type: "Body",
				schema: LoginRequest,
			},
		],
		response: JSendResponseOfLoginResponse,
		errors: [
			{
				status: 401,
				description: `Unauthorized`,
				schema: JSendResponseOfObject,
			},
		],
	},
	{
		method: "post",
		path: "/api/Auth/Logout",
		alias: "postApiAuthLogout",
		requestFormat: "json",
		response: JSendResponseOfLogoutResponse,
	},
	{
		method: "post",
		path: "/api/Auth/Refresh",
		alias: "postApiAuthRefresh",
		requestFormat: "json",
		parameters: [
			{
				name: "body",
				type: "Body",
				schema: RefreshRequest,
			},
		],
		response: JSendResponseOfLoginResponse,
		errors: [
			{
				status: 401,
				description: `Unauthorized`,
				schema: JSendResponseOfObject,
			},
		],
	},
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
	return new Zodios(baseUrl, endpoints, options);
}
