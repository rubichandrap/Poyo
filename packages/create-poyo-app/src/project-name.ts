/**
 * The project-name grammar, as a finite automaton.
 *
 * A name is used three ways at once, and the grammar is the intersection of
 * what all three accept:
 *
 * - a C# namespace segment (`<Name>.Server`, `<Name>.Server.Controllers`),
 * - an npm package name (`<name>.client`), which is lowercase and URL-safe,
 * - a single path segment under the current directory.
 *
 * Stated as one automaton rather than three checks, because three checks is
 * how a name passes two and breaks the third: `my-app` is a legal npm name and
 * a legal directory, and an illegal C# namespace; `1App` is a legal directory
 * and an illegal namespace; `app.name` is legal as text and becomes two
 * directories; `..` is a legal npm name and escapes the target directory.
 *
 * The automaton is written out (states, transitions, accept set) so the model
 * check in `test/project-name.test.ts` can exhaustively compare it against an
 * independent oracle, and so the accepted set has one readable source.
 *
 * Two refusals sit on top of the automaton, because they are about specific
 * words rather than characters:
 *
 * - a name the generated C# uses as a simple name. The root namespace
 *   `<Name>` is found before any `using` import, so a project named `Task`
 *   turns every `Task` in the server into a reference to the namespace and the
 *   project does not compile. The list is derived from the shipped C#
 *   (`scripts/reserved-names.mjs`), not written by hand;
 * - a Windows reserved device name (`CON`, `NUL`, `COM1` …), which cannot be a
 *   directory there, with or without the `.client` suffix.
 */
import { RESERVED_TYPE_NAMES } from "./reserved-names.generated.js";

/** Accepted only in the initial state: the C# identifier start class. */
const IDENTIFIER_START = /^[A-Za-z]$/;
/** Accepted in the body state: the C# identifier part class. */
const IDENTIFIER_PART = /^[A-Za-z0-9_]$/;

/**
 * A path segment has a filesystem limit; 64 is far below every common one
 * (255 on ext4/NTFS/APFS) and far above any real project name. The bound is
 * what makes the automaton finite: a counter is 65 states.
 */
export const MAX_PROJECT_NAME_LENGTH = 64;

export type NameState = "start" | "body" | "reject";

/**
 * One transition. The explicit `reject` state is a sink: every character that
 * is not in the current state's class leaves the automaton there, and no
 * transition leaves it again.
 */
export function stepName(state: NameState, character: string): NameState {
	if (state === "reject") return "reject";
	if (state === "start") {
		return IDENTIFIER_START.test(character) ? "body" : "reject";
	}
	return IDENTIFIER_PART.test(character) ? "body" : "reject";
}

/** Runs the automaton over a whole name and reports whether it accepts. */
export function isProjectNameGrammatical(name: string): boolean {
	if (name.length === 0 || name.length > MAX_PROJECT_NAME_LENGTH) return false;
	let state: NameState = "start";
	for (const character of name) {
		state = stepName(state, character);
		if (state === "reject") return false;
	}
	return state === "body";
}

/** The namespace and project-directory form of a name: first letter upper. */
export function pascalProjectName(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1);
}

const WINDOWS_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;

/** Whether the generated server compiles under the name's root namespace. */
export function shadowsGeneratedType(name: string): boolean {
	return RESERVED_TYPE_NAMES.has(pascalProjectName(name));
}

export function isWindowsDeviceName(name: string): boolean {
	return WINDOWS_DEVICE_NAME.test(name);
}

/** The complete acceptance check the scaffolder runs before writing a file. */
export function isProjectNameValid(name: string): boolean {
	return (
		isProjectNameGrammatical(name) &&
		!shadowsGeneratedType(name) &&
		!isWindowsDeviceName(name)
	);
}

/**
 * The message a refused name earns. It names the rule the name broke, because
 * "invalid name" sends the author guessing at which of the three consumers
 * refused it.
 */
export function projectNameError(name: string): string {
	if (name.length === 0) {
		return "Project name must not be empty.";
	}
	if (name.length > MAX_PROJECT_NAME_LENGTH) {
		return `Project name must be at most ${MAX_PROJECT_NAME_LENGTH} characters; '${name}' is ${name.length}.`;
	}
	const first = String.fromCodePoint(name.codePointAt(0) as number);
	if (!IDENTIFIER_START.test(first)) {
		return `Project name must start with an ASCII letter; '${name}' starts with '${first}'. It becomes a C# namespace segment and a directory name.`;
	}
	const offending = [...name].slice(1).find((character) => {
		return !IDENTIFIER_PART.test(character);
	});
	if (offending !== undefined) {
		return `Project name may contain only ASCII letters, digits and underscores; '${name}' contains '${offending}'. It becomes a C# namespace segment and a directory name.`;
	}
	if (isWindowsDeviceName(name)) {
		return `Project name '${name}' is a reserved device name on Windows and cannot be a directory there.`;
	}
	if (shadowsGeneratedType(name)) {
		const pascal = pascalProjectName(name);
		return `Project name '${name}' would make '${pascal}' the root namespace, and the generated server uses '${pascal}' as a C# name, so it would not compile. Choose another name, for example '${pascal}App'.`;
	}
	return `Project name '${name}' is not accepted.`;
}
