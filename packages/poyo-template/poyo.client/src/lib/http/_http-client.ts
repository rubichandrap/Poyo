import type { HttpRequestConfig, HttpResponse, IHttpClient } from "./types";

export class HttpClient implements IHttpClient {
	private client: IHttpClient;

	constructor(client: IHttpClient) {
		this.client = client;
	}

	async get<T>(
		url: string,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		return this.client.get(url, config);
	}

	async post<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		return this.client.post(url, data, config);
	}

	async put<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		return this.client.put(url, data, config);
	}

	async delete<T>(
		url: string,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		return this.client.delete(url, config);
	}

	async patch<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>> {
		return this.client.patch(url, data, config);
	}
}
