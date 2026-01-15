import { QueryClient } from "@tanstack/react-query";

// Create QueryClient with MPA-optimized configuration
// Since this is an MPA, the client is recreated on each page load
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Disable background refetching - cache doesn't persist across page loads
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			refetchOnMount: false,
			// Retry failed requests
			retry: 1,
			refetchInterval: 5000,
		},
		mutations: {
			// Retry failed mutations once
			retry: 1,
		},
	},
});
