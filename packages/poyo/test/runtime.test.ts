import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { usePage } from "../src/runtime.js";

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
	});
});
