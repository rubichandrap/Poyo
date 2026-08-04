import { CliError } from "./error.js";

export interface RouteFile {
	react: string;
	view: string;
}

export interface RouteSeo {
	title: string;
	description: string;
	meta?: Record<string, string>;
	jsonld?: unknown;
}

export type RouteAccess = "public" | "guest" | "protected";

export const ACCESS_VALUES: readonly RouteAccess[] = [
	"public",
	"guest",
	"protected",
];

export const DEFAULT_ACCESS: RouteAccess = "protected";

export function isRouteAccess(value: unknown): value is RouteAccess {
	return ACCESS_VALUES.some((candidate) => candidate === value);
}

export function assertSingleAccessFlag(
	publicFlag: boolean | undefined,
	guestFlag: boolean | undefined,
): void {
	if (publicFlag !== undefined && guestFlag !== undefined) {
		throw new CliError(
			"Cannot use both --public and --guest; pick one access level.",
		);
	}
}

export function accessFromFlags(
	publicFlag: boolean | undefined,
	guestFlag: boolean | undefined,
): RouteAccess {
	assertSingleAccessFlag(publicFlag, guestFlag);
	if (guestFlag) return "guest";
	if (publicFlag) return "public";
	return DEFAULT_ACCESS;
}

export function applyAccessFlag(
	current: RouteAccess,
	flag: "public" | "guest",
	on: boolean,
): RouteAccess {
	if (!on) {
		return current === flag ? DEFAULT_ACCESS : current;
	}
	return flag === "guest" ? "guest" : "public";
}

export interface Route {
	path: string;
	name: string;
	files: RouteFile;
	access: RouteAccess;
	controller?: string;
	action?: string;
	seo?: RouteSeo;
}
