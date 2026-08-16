import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useMemo } from "react";
import { queryClient } from "./lib/react-query";
import { AuthProvider, ThemeProvider } from "./providers";
import { RouteComponent } from "./routes";
import { findRouteByName, findRouteGeneric } from "./routes/route-loader";

function PageNotFound() {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="text-slate-600">Page not found</div>
		</div>
	);
}

function App() {
	const currentRoute = useMemo(() => {
		// 1. Server-driven routing: the server declares the page name on the mount root
		const rootEl = document.getElementById("react-root");
		const serverPageName = rootEl?.dataset.pageName;

		if (serverPageName) {
			const route = findRouteByName(serverPageName);
			if (route) return route;
		}

		// 2. Standalone-dev fallback: URL matching
		return findRouteGeneric(window.location.pathname);
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
				<AuthProvider>
					{currentRoute ? (
						<RouteComponent route={currentRoute} />
					) : (
						<PageNotFound />
					)}
				</AuthProvider>
			</ThemeProvider>
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	);
}

export default App;
