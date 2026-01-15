import type {
	UseMutationOptions,
	UseQueryOptions,
} from "@tanstack/react-query";
import type { HttpRequestConfig } from "~/lib/http/types";

export type ApiQueryOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends readonly unknown[] = readonly unknown[],
> = Omit<
	UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
	"queryKey" | "queryFn"
> & {
	request?: HttpRequestConfig;
};

export type ApiMutationOptions<
	TData = unknown,
	TError = unknown,
	TVariables = void,
	TContext = unknown,
> = Omit<
	UseMutationOptions<TData, TError, TVariables, TContext>,
	"mutationFn"
> & {
	request?: HttpRequestConfig;
};
