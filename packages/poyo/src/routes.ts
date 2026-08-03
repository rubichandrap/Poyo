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

export interface Route {
	path: string;
	name: string;
	files: RouteFile;
	isPublic?: boolean;
	isGuestOnly?: boolean;
	controller?: string;
	action?: string;
	seo?: RouteSeo;
}
