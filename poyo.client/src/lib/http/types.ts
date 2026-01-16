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

export class HttpError<T = unknown> extends Error {
	public message: string;
	public status?: number;
	public statusText?: string;
	public data?: T;
	public originalError?: unknown;

	constructor(
		message: string,
		status?: number,
		statusText?: string,
		data?: T,
		originalError?: unknown,
	) {
		super(message);
		this.name = "HttpError";
		this.message = message;
		this.status = status;
		this.statusText = statusText;
		this.data = data;
		this.originalError = originalError;
	}
}

export function isHttpError<T = unknown>(
	error: unknown,
): error is HttpError<T> {
	return error instanceof HttpError;
}
