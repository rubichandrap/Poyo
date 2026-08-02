import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiMutationOptions } from "~/hooks-api/types";
import type { components } from "~/schemas/dtos.generated";
import { authService } from "~/services";

export const useLogout = (
	options?: ApiMutationOptions<
		components["schemas"]["JSendResponseOfLogoutResponse"]
	>,
) => {
	const queryClient = useQueryClient();
	const { request, ...mutationOptions } = options || {};

	return useMutation({
		...mutationOptions,
		mutationFn: () => authService.logout(request),
		onSuccess: (data, variables, onMutateResult, context) => {
			queryClient.clear();
			localStorage.removeItem("ui-token");
			mutationOptions?.onSuccess?.(data, variables, onMutateResult, context);
		},
	});
};
