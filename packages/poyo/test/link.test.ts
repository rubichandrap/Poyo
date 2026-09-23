import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link } from "../src/runtime/link.js";
import { createRouter } from "../src/runtime/router.js";
import { resetNavigationStore } from "../src/runtime/navigation-store.js";

describe("<Link /> component click eligibility rules", () => {
	beforeEach(() => {
		resetNavigationStore();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		resetNavigationStore();
	});

	function createMockEvent(
		overrides: Partial<React.MouseEvent<HTMLAnchorElement>> = {},
	) {
		let defaultPrevented = false;
		return {
			button: 0,
			metaKey: false,
			altKey: false,
			ctrlKey: false,
			shiftKey: false,
			get defaultPrevented() {
				return defaultPrevented;
			},
			preventDefault: vi.fn(() => {
				defaultPrevented = true;
			}),
			isDefaultPrevented: () => defaultPrevented,
			currentTarget: {
				getAttribute: () => null,
				hasAttribute: () => false,
			},
			...overrides,
		} as unknown as React.MouseEvent<HTMLAnchorElement>;
	}

	function renderLink(props: React.ComponentProps<typeof Link>) {
		const forwardRefComponent = Link as unknown as {
			render: (
				props: React.ComponentProps<typeof Link>,
				ref: React.Ref<HTMLAnchorElement>,
			) => React.ReactElement<{
				onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
			}>;
		};
		return forwardRefComponent.render(props, null);
	}

	it("intercepts eligible click and calls router.push", async () => {
		const pushMock = vi.fn().mockResolvedValue(undefined);
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const event = createMockEvent();
		const rendered = renderLink({ href: "/dashboard" });
		rendered.props.onClick(event);

		expect(event.preventDefault).toHaveBeenCalled();
		expect(pushMock).toHaveBeenCalledWith("/dashboard");
	});

	it("calls router.replace when replace prop is true", async () => {
		const replaceMock = vi.fn().mockResolvedValue(undefined);
		const router = createRouter();
		vi.spyOn(router, "replace").mockImplementation(replaceMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const event = createMockEvent();
		const rendered = renderLink({ href: "/dashboard", replace: true });
		rendered.props.onClick(event);

		expect(event.preventDefault).toHaveBeenCalled();
		expect(replaceMock).toHaveBeenCalledWith("/dashboard");
	});

	it("keeps native behavior on modifier clicks (meta, alt, ctrl, shift)", async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		for (const modifier of [
			"metaKey",
			"altKey",
			"ctrlKey",
			"shiftKey",
		] as const) {
			const event = createMockEvent({ [modifier]: true });
			const rendered = renderLink({ href: "/dashboard" });
			rendered.props.onClick(event);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(pushMock).not.toHaveBeenCalled();
		}
	});

	it("keeps native behavior on non-primary button clicks (button !== 0)", async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const event = createMockEvent({ button: 1 }); // Middle click
		const rendered = renderLink({ href: "/dashboard" });
		rendered.props.onClick(event);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("keeps native behavior when target is set and not _self", async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const event = createMockEvent();
		const rendered = renderLink({ href: "/dashboard", target: "_blank" });
		rendered.props.onClick(event);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("keeps native behavior when download attribute is present", async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const event = createMockEvent();
		const rendered = renderLink({ href: "/file.pdf", download: true });
		rendered.props.onClick(event);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("keeps native behavior for external origins", async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const event = createMockEvent();
		const rendered = renderLink({ href: "https://external.com/login" });
		rendered.props.onClick(event);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("keeps native behavior for in-page hash-only changes", async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/dashboard",
				search: "",
				href: "http://localhost:3000/dashboard",
			},
		});

		const event1 = createMockEvent();
		const rendered1 = renderLink({ href: "#section" });
		rendered1.props.onClick(event1);

		expect(event1.preventDefault).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();

		const event2 = createMockEvent();
		const rendered2 = renderLink({ href: "/dashboard#section" });
		rendered2.props.onClick(event2);

		expect(event2.preventDefault).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});

	it('honors data-dynamic-nav="off" as the opt-out', async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const attr = { "data-dynamic-nav": "off" };
		const event = createMockEvent({
			currentTarget: {
				getAttribute: (name: string) =>
					(attr as Record<string, string>)[name] ?? null,
			} as unknown as EventTarget & HTMLAnchorElement,
		});
		const rendered = renderLink({ href: "/dashboard", ...attr });
		rendered.props.onClick(event);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("ignores retired opt-out spellings (data-dynamic, data-hybrid-nav, data-reload)", async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const retired = [
			{ "data-dynamic": "false" },
			{ "data-hybrid-nav": "off" },
			{ "data-reload": "" },
		];

		for (const attr of retired) {
			pushMock.mockClear();
			const event = createMockEvent({
				currentTarget: {
					getAttribute: (name: string) =>
						(attr as unknown as Record<string, string>)[name] ?? null,
					hasAttribute: (name: string) => name in attr,
				} as unknown as EventTarget & HTMLAnchorElement,
			});
			const rendered = renderLink({ href: "/dashboard", ...attr });
			rendered.props.onClick(event);

			// data-dynamic-nav is the documented opt-out; the others are gone.
			expect(event.preventDefault).toHaveBeenCalled();
			expect(pushMock).toHaveBeenCalledWith("/dashboard");
		}
	});

	it("invokes user-provided onClick and respects preventDefault if called by user handler", async () => {
		const pushMock = vi.fn();
		const router = createRouter();
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/",
				search: "",
				href: "http://localhost:3000/",
			},
		});

		const userOnClick = vi.fn((e: React.MouseEvent<HTMLAnchorElement>) => {
			e.preventDefault();
		});

		const event = createMockEvent();
		const rendered = renderLink({ href: "/dashboard", onClick: userOnClick });
		rendered.props.onClick(event);

		expect(userOnClick).toHaveBeenCalledWith(event);
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("keeps native behavior for links pointing outside the application base path", async () => {
		const pushMock = vi.fn();
		const router = createRouter({
			routeTable: {
				basePath: "/portal",
				routes: [],
				routeMap: {},
				findRouteByName: () => undefined,
				findRouteGeneric: () => undefined,
				detectGhostRoutes: () => undefined,
			},
		});
		vi.spyOn(router, "push").mockImplementation(pushMock);

		vi.stubGlobal("window", {
			location: {
				origin: "http://localhost:3000",
				pathname: "/portal/home",
				search: "",
				href: "http://localhost:3000/portal/home",
			},
		});

		// Link inside base path -> intercepted
		const eventInside = createMockEvent();
		const renderedInside = renderLink({ href: "/portal/settings" });
		renderedInside.props.onClick(eventInside);
		expect(eventInside.preventDefault).toHaveBeenCalled();
		expect(pushMock).toHaveBeenCalledWith("/portal/settings");

		pushMock.mockClear();

		// Link outside base path -> native navigation (not intercepted)
		const eventOutside = createMockEvent();
		const renderedOutside = renderLink({ href: "/other-app/dashboard" });
		renderedOutside.props.onClick(eventOutside);
		expect(eventOutside.preventDefault).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});
});
