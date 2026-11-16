/**
 * A minimal document head for the router's head-parity tests: elements with
 * attributes, removal, and the handful of selectors the router queries
 * (`title`, `[attr]`, `tag[attr="value"]`). Not a DOM; just enough of one.
 */
export interface FakeElement {
	tagName: string;
	attributes: Map<string, string>;
	textContent: string;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	hasAttribute(name: string): boolean;
	remove(): void;
}

export interface FakeDocument {
	title: string;
	head: { appendChild(element: FakeElement): void };
	body: { appendChild(element: FakeElement): void };
	elements: FakeElement[];
	createElement(tag: string): FakeElement;
	querySelector(selector: string): FakeElement | null;
	querySelectorAll(selector: string): FakeElement[];
	getElementById(id: string): FakeElement | null;
	getElementsByName(name: string): FakeElement[];
}

export function createFakeDocument(): FakeDocument {
	const elements: FakeElement[] = [];
	const createElement = (tag: string): FakeElement => {
		const element: FakeElement = {
			tagName: tag.toUpperCase(),
			attributes: new Map(),
			textContent: "",
			getAttribute: (name) => element.attributes.get(name) ?? null,
			setAttribute: (name, value) => {
				element.attributes.set(name, value);
			},
			hasAttribute: (name) => element.attributes.has(name),
			remove: () => {
				const index = elements.indexOf(element);
				if (index >= 0) elements.splice(index, 1);
			},
		};
		return element;
	};
	const matches = (element: FakeElement, selector: string): boolean => {
		const bare = /^\[([\w-]+)\]$/.exec(selector);
		if (bare) return element.attributes.has(bare[1]);
		const valued = /^(\w+)\[([\w-]+)="((?:[^"\\]|\\.)*)"\]$/.exec(selector);
		if (valued) {
			return (
				element.tagName === valued[1].toUpperCase() &&
				element.attributes.get(valued[2]) === valued[3].replace(/\\(.)/g, "$1")
			);
		}
		return element.tagName === selector.toUpperCase();
	};
	const append = (element: FakeElement) => {
		elements.push(element);
	};
	return {
		title: "",
		head: { appendChild: append },
		body: { appendChild: append },
		elements,
		createElement,
		querySelector: (selector) =>
			elements.find((element) => matches(element, selector)) ?? null,
		querySelectorAll: (selector) =>
			elements.filter((element) => matches(element, selector)),
		getElementById: (id) =>
			elements.find((element) => element.attributes.get("id") === id) ?? null,
		getElementsByName: (name) =>
			elements.filter((element) => element.attributes.get("name") === name),
	};
}

/** Adds an element the way the server-rendered layout would have. */
export function seed(
	doc: FakeDocument,
	tag: string,
	attributes: Record<string, string>,
	textContent = "",
): FakeElement {
	const element = doc.createElement(tag);
	for (const [name, value] of Object.entries(attributes)) {
		element.setAttribute(name, value);
	}
	element.textContent = textContent;
	doc.head.appendChild(element);
	return element;
}
