export interface HttpRequestConfig {
	headers?: Record<string, string>;
	params?: Record<string, unknown>;
	// Generic way to pass extra non-standard config if needed, though strictly typed is better
	[key: string]: unknown;
}

export interface HttpResponse<T = unknown> {
	data: T;
	status: number;
	statusText: string;
	headers: Record<string, unknown>;
}

export interface IHttpClient {
	get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
	post<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>>;
	put<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>>;
	delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
	patch<T>(
		url: string,
		data?: unknown,
		config?: HttpRequestConfig,
	): Promise<HttpResponse<T>>;
}
