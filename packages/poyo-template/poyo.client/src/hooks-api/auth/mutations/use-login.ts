import { useMutation } from "@tanstack/react-query";
import type { ApiMutationOptions } from "~/hooks-api/types";
import type { components } from "~/schemas/dtos.generated";
import { authService } from "~/services";

export const useLogin = (
	options?: ApiMutationOptions<
		components["schemas"]["JSendResponseOfLoginResponse"],
		unknown,
		components["schemas"]["LoginRequest"]
	>,
) => {
	const { request, ...mutationOptions } = options || {};

	return useMutation({
		mutationFn: (data: components["schemas"]["LoginRequest"]) =>
			authService.login(data, request),
		...mutationOptions,
	});
};
