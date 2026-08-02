import type React from "react";
import { Suspense } from "react";
import type { AppRoute } from "./route-loader";

// Simple loading fallback
const LoadingFallback = () => (
	<div className="flex items-center justify-center min-h-screen">
		<div className="text-slate-600">Loading...</div>
	</div>
);

// Route component with lazy loading
export const RouteComponent: React.FC<{ route: AppRoute }> = ({ route }) => {
	const Component = route.component;
	return (
		<Suspense fallback={<LoadingFallback />}>
			<Component />
		</Suspense>
	);
};
