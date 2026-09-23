/**
 * Client runtime for generated Poyo projects — shipped as the
 * "@rubichandrap/poyo/runtime" subpath export.
 *
 * Public face of the runtime: everything the client imports comes from
 * here. Add new runtime APIs as sibling modules and re-export them.
 */
export { usePage } from "./use-page.js";
export {
	createRouteTable,
	routePath,
	type AppRoute,
	type PageLoader,
	type PageLoaders,
	type PoyoRouteRegistry,
	type RouteAccess,
	type RouteEntry,
	type RouteName,
	type RoutePath,
	type RouteTable,
	type RouteTableOptions,
} from "./route-table.js";
