import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React, { useMemo } from "react";
import { queryClient } from "./lib/react-query";
import { AuthProvider, ThemeProvider } from "./providers";
import { RouteComponent } from "./routes";
import { findRouteByName, findRouteGeneric } from "./routes/route-loader";

function App() {
	const currentRoute = useMemo(() => {
		// 1. Try Server-Driven Routing (Single Source of Truth)
		const rootEl = document.getElementById("root");
		const serverPageName = rootEl?.dataset.pageName;

		if (serverPageName) {
			const component = findRouteByName(serverPageName);
			if (component) {
				return {
					path: window.location.pathname,
					component: component,
					pageName: serverPageName,
				};
			}
			console.warn(
				`Server requested page "${serverPageName}" but it was not found in client bundle.`,
			);
		}

		// 2. Fallback to Client-Side/Dev URL Matching
		const route = findRouteGeneric(window.location.pathname);
		if (route) return route;

		// 3. Fallback to Home
		return {
			path: "/",
			component: React.lazy(() => import("./pages/Home/index.page")),
			pageName: "Home",
		};
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
				<AuthProvider>
					<RouteComponent route={currentRoute} />
				</AuthProvider>
			</ThemeProvider>
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	);
}

export default App;
