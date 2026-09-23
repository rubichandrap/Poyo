import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRouter } from "@rubichandrap/poyo/runtime/router";
import { queryClient } from "./lib/react-query";
import { AuthProvider, ThemeProvider } from "./providers";
import { RouteComponent } from "./routes";
import "./routes/route-loader";
function PageNotFound() {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="text-slate-600">Page not found</div>
		</div>
	);
}

function App() {
	const { route: currentRoute } = useRouter();
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
