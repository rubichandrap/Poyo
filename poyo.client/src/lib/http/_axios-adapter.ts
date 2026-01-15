import axios, {
	type AxiosInstance,
	type AxiosRequestConfig,
	type AxiosResponse,
} from "axios";
import type { HttpRequestConfig, HttpResponse, IHttpClient } from "./types";

export class AxiosAdapter implements IHttpClient {
	private instance: AxiosInstance;

	constructor(config?: AxiosRequestConfig) {
		this.instance = axios.create({
			...config,
			withCredentials: true, // Send cookies with every request
		});
		this.setupResponseInterceptor();
	}

	private setupResponseInterceptor() {
		// Response: Handle 401
		this.instance.interceptors.response.use(
			(response) => response,
			(error) => {
				// We let the caller handle 401s (e.g. Login form showing error)
				// Global redirect is annoying for login forms.
				return Promise.reject(error);
			},
		);
	}

	private mapConfig(config?: HttpRequestConfig): AxiosRequestConfig {
		if (!config) return {};
		const { headers, params, ...rest } = config;
		return {
			headers: headers,
			params: params,
			...rest,
		};
	}

	private mapResponse<T>(response: AxiosResponse<T>): HttpResponse<T> {
		return {
			data: response.data,
			status: response.status,
			statusText: response.statusText,
			headers: response.headers as Record<string, unknown>,
		};
	}

	async get<T>(
		url: string,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		const response = await this.instance.get<T>(url, this.mapConfig(config));
		return this.mapResponse(response);
	}

	async post<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		const response = await this.instance.post<T>(
			url,
			data,
			this.mapConfig(config),
		);
		return this.mapResponse(response);
	}

	async put<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		const response = await this.instance.put<T>(
			url,
			data,
			this.mapConfig(config),
		);
		return this.mapResponse(response);
	}

	async delete<T>(
		url: string,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		const response = await this.instance.delete<T>(url, this.mapConfig(config));
		return this.mapResponse(response);
	}

	async patch<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		const response = await this.instance.patch<T>(
			url,
			data,
			this.mapConfig(config),
		);
		return this.mapResponse(response);
	}
}
