import React, {
	forwardRef,
	type ComponentPropsWithoutRef,
	type MouseEvent,
} from "react";
import { getActiveRouteTable, type RoutePath } from "./route-table.js";
import { getActiveRouter } from "./router.js";

export interface LinkProps extends ComponentPropsWithoutRef<"a"> {
	href: RoutePath | (string & {});
	replace?: boolean;
}

function isEligibleClick(
	event: MouseEvent<HTMLAnchorElement>,
	href: string,
	target?: string,
	download?: boolean | string,
): boolean {
	if (
		event.defaultPrevented ||
		(typeof event.isDefaultPrevented === "function" &&
			event.isDefaultPrevented())
	) {
		return false;
	}
	if (event.button !== 0) return false;
	if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
		return false;
	}
	if (target && target !== "_self") return false;
	if (download !== undefined && download !== false) return false;

	const targetEl = event.currentTarget;
	if (
		targetEl &&
		typeof targetEl.getAttribute === "function" &&
		targetEl.getAttribute("data-dynamic-nav") === "off"
	) {
		return false;
	}

	if (typeof window === "undefined") return false;

	try {
		const targetUrl = new URL(href, window.location.href);

		if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
			return false;
		}

		if (targetUrl.origin !== window.location.origin) {
			return false;
		}
		const activeTable = getActiveRouteTable();
		if (activeTable?.basePath && activeTable.basePath !== "/") {
			const normBase = activeTable.basePath.toLowerCase();
			const normPath = targetUrl.pathname.toLowerCase();
			if (normPath !== normBase && !normPath.startsWith(`${normBase}/`)) {
				return false;
			}
		}

		if (
			targetUrl.pathname === window.location.pathname &&
			targetUrl.search === window.location.search &&
			Boolean(targetUrl.hash)
		) {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
	function Link(props, ref) {
		const { href, replace, onClick, target, download, children, ...rest } =
			props;
		const router = getActiveRouter();

		const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
			if (onClick) {
				onClick(event);
			}

			if (isEligibleClick(event, href, target, download)) {
				event.preventDefault();
				if (replace) {
					router.replace(href);
				} else {
					router.push(href);
				}
			}
		};

		return (
			<a
				ref={ref}
				href={href}
				target={target}
				download={download}
				onClick={handleClick}
				{...rest}
			>
				{children}
			</a>
		);
	},
);
