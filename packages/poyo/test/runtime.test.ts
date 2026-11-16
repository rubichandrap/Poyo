import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { usePage } from "../src/runtime/index.js";

// usePage is a hook over the navigation store. These tests read it outside a
// React render (the package has no renderer), so the store hook reads the
// snapshot directly; the subscription itself is asserted on its own.
vi.mock("react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react")>();
	return {
		...actual,
		useSyncExternalStore: vi.fn(
			(_subscribe: () => () => void, getSnapshot: () => unknown) =>
				getSnapshot(),
		),
	};
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("usePage", () => {
	it("returns null during SSR (no window)", () => {
		expect(usePage()).toBeNull();
	});

	it("returns null when SERVER_DATA is missing", () => {
		vi.stubGlobal("window", {});
		expect(usePage()).toBeNull();
	});

	it("returns null when SERVER_DATA is null", () => {
		vi.stubGlobal("window", { SERVER_DATA: null });
		expect(usePage()).toBeNull();
	});

	it("returns null when SERVER_DATA is an array", () => {
		vi.stubGlobal("window", { SERVER_DATA: [1, 2, 3] });
		expect(usePage()).toBeNull();
	});

	it("returns null when SERVER_DATA is a primitive", () => {
		vi.stubGlobal("window", { SERVER_DATA: "hello" });
		expect(usePage()).toBeNull();
		vi.stubGlobal("window", { SERVER_DATA: 42 });
		expect(usePage()).toBeNull();
		vi.stubGlobal("window", { SERVER_DATA: true });
		expect(usePage()).toBeNull();
	});

	it("returns the payload for a plain object", () => {
		const payload = { message: "hello", count: 3 };
		vi.stubGlobal("window", { SERVER_DATA: payload });
		expect(usePage()).toEqual(payload);
	});

	it("returns the payload typed with the generic", () => {
		vi.stubGlobal("window", { SERVER_DATA: { message: "hello" } });
		const data = usePage<{ message: string }>();
		expect(data?.message).toBe("hello");
	});

	it("keeps the typed contract", () => {
		expectTypeOf(usePage()).toEqualTypeOf<Record<string, unknown> | null>();
		expectTypeOf(usePage<{ message: string }>()).toEqualTypeOf<{
			message: string;
		} | null>();
		// The package owns the Window.SERVER_DATA global: `unknown`, not `any`.
		expectTypeOf<Window["SERVER_DATA"]>().toEqualTypeOf<unknown | undefined>();
	});
});

describe("getPageData", () => {
	it("reads Page data outside a component render, with usePage's narrowing", async () => {
		const { getPageData } = await import("../src/runtime/index.js");
		const { resetNavigationStore } = await import(
			"../src/runtime/navigation-store.js"
		);
		resetNavigationStore();
		vi.stubGlobal("window", { SERVER_DATA: { user: "demo" } });
		expect(getPageData<{ user: string }>()?.user).toBe("demo");

		resetNavigationStore();
		vi.stubGlobal("window", { SERVER_DATA: [1, 2] });
		expect(getPageData()).toBeNull();
		resetNavigationStore();
	});
});
