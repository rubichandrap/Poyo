import { describe, expect, it } from "vitest";
import { createRouterHarness } from "./router-test-helpers.js";

// The harness underpins every navigation and traversal test, so its own fidelity
// is load-bearing and gets its own tests. A defect here silently invalidates the
// suites built on it: a two-parameter history-write signature once bound the URL
// to pushState's title argument, so the address bar never moved and the whole
// runtime suite stayed green.
describe("createRouterHarness history fidelity", () => {
	it("writes state and the address bar for the browser-standard 3-argument pushState", () => {
		const harness = createRouterHarness({ routes: [] });

		harness.history.pushState({ a: 1 }, "", "/dashboard?tab=billing#team");

		expect(harness.history.state).toEqual({ a: 1 });
		expect(harness.location.pathname).toBe("/dashboard");
		expect(harness.location.search).toBe("?tab=billing");
		expect(harness.location.hash).toBe("#team");
		expect(harness.location.href).toBe(
			"http://localhost:3000/dashboard?tab=billing#team",
		);
	});

	it("writes state and the address bar for replaceState", () => {
		const harness = createRouterHarness({ routes: [] });

		harness.history.replaceState({ a: 1 }, "", "/login");

		expect(harness.history.state).toEqual({ a: 1 });
		expect(harness.location.pathname).toBe("/login");
	});

	it("leaves the address bar alone when no URL is supplied", () => {
		const harness = createRouterHarness({ routes: [] });
		const before = harness.location.href;

		harness.history.pushState({ a: 1 }, "");

		expect(harness.history.state).toEqual({ a: 1 });
		expect(harness.location.href).toBe(before);
	});

	it("resolves a relative URL against the current one", () => {
		const harness = createRouterHarness({ routes: [] });
		harness.history.pushState(null, "", "/settings");

		harness.history.pushState(null, "", "billing");

		expect(harness.location.pathname).toBe("/billing");
	});
});
