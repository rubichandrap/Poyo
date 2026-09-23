import type { AppRoute } from "./route-table.js";

export interface NavigationState {
	route: AppRoute | null;
	pageData: unknown;
}

export interface NavigationStore {
	getState(): NavigationState;
	getRoute(): AppRoute | null;
	getPageData(): unknown;
	commit(next: { route: AppRoute | null; pageData: unknown }): void;
	subscribe(listener: () => void): () => void;
	reset(): void;
}

let storeInstance: NavigationStore | undefined;

export function getNavigationStore(): NavigationStore {
	if (!storeInstance) {
		let state: NavigationState = {
			route: null,
			pageData: typeof window !== "undefined" ? window.SERVER_DATA : null,
		};
		let initialized = false;
		const listeners = new Set<() => void>();

		const getState = (): NavigationState => {
			if (!initialized && typeof window !== "undefined") {
				state.pageData = window.SERVER_DATA;
			}
			return state;
		};

		const getRoute = (): AppRoute | null => getState().route;
		const getPageData = (): unknown => getState().pageData;

		const commit = (next: {
			route: AppRoute | null;
			pageData: unknown;
		}): void => {
			initialized = true;
			state = {
				route: next.route,
				pageData: next.pageData,
			};
			for (const listener of listeners) {
				listener();
			}
		};

		const subscribe = (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		};

		const reset = (): void => {
			initialized = false;
			listeners.clear();
			state = {
				route: null,
				pageData: typeof window !== "undefined" ? window.SERVER_DATA : null,
			};
		};

		storeInstance = {
			getState,
			getRoute,
			getPageData,
			commit,
			subscribe,
			reset,
		};
	}
	return storeInstance;
}

export function commitNavigation(next: {
	route: AppRoute | null;
	pageData: unknown;
}): void {
	getNavigationStore().commit(next);
}

export function resetNavigationStore(): void {
	if (storeInstance) {
		storeInstance.reset();
	}
	storeInstance = undefined;
}
