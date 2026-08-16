import type { ComponentType } from "react";
import {
	createRouteTable,
	type AppRoute,
	type PageLoaders,
} from "@rubichandrap/poyo/runtime";
import { routeManifest } from "./routes.generated";

// Vite glob keys are relative to this module ("../pages/..."); the registry
// speaks registry-space paths ("src/pages/..."). Re-key into registry space.
// biome-ignore lint/suspicious/noExplicitAny: page props are unknown and vary per page; any keeps lazy() and JSX permissive.
const pages = import.meta.glob<{ default: ComponentType<any> }>(
	"../pages/**/*.page.tsx",
);

const pageLoaders: PageLoaders = Object.fromEntries(
	Object.entries(pages).map(([key, loader]) => [
		key.replace("../pages/", "src/pages/"),
		loader,
	]),
);

// The server injects its hosting path on the mount root (or <body>) as
// data-base-path; VITE_BASE_URL is the standalone-dev fallback; "/" is the
// default. createRouteTable normalizes and matches it case-insensitively.
const mountRoot = document.getElementById("react-root");
const baseUrl =
	mountRoot?.dataset.basePath ??
	document.body.dataset.basePath ??
	(import.meta.env.VITE_BASE_URL as string | undefined) ??
	"/";

const { routes, routeMap, findRouteByName, findRouteGeneric } =
	createRouteTable(routeManifest, pageLoaders, {
		baseUrl,
		dev: import.meta.env.DEV,
	});

// Legacy surface — app.tsx and routes/index.tsx keep importing from here.
export { routes, routeMap, findRouteByName, findRouteGeneric };
export type { AppRoute };
