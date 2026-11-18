import path from "node:path";
import type { ProjectPaths, ProjectSide } from "./config.js";
import { CliError } from "./error.js";
import type { RouteFile } from "./routes.js";

/** Why a declared route file path may not be used as written. */
export interface FilePathRefusal {
	readonly kind: "absolute" | "drive-rooted" | "dot";
	/** The path as written, so a message quotes text the author can edit. */
	readonly written: string;
}

/**
 * The first property that puts a declared file path outside the project, or
 * `undefined` when it has none. The order is the order the server applies them:
 * an absolute path is relative to nothing, a drive-rooted path names a volume,
 * and a `..` segment climbs out of the directory its path is resolved against.
 *
 * A `..` reached through either separator counts: a registry is authored once
 * and deployed anywhere, and Windows reads a backslash as one.
 */
export function filePathRefusal(declared: string): FilePathRefusal | undefined {
	if (declared.startsWith("/") || declared.startsWith("\\")) {
		return { kind: "absolute", written: declared };
	}
	if (/^[A-Za-z]:/.test(declared)) {
		return { kind: "drive-rooted", written: declared };
	}
	if (declared.split(/[\\/]/).includes("..")) {
		return { kind: "dot", written: declared };
	}
	return undefined;
}

/**
 * What is wrong with a refused file path, as one sentence the registry reader
 * and the route manager's file operations both report. The kinds fail for
 * different reasons and so are told apart: an absolute path replaces the
 * project directory it is resolved against, a drive-rooted path names a volume
 * instead, and a `..` segment walks out of the directory.
 */
export function filePathRefusalClause(refusal: FilePathRefusal): string {
	const mechanism = "a route file path is relative to the project";

	if (refusal.kind === "absolute") {
		return `declares the absolute path "${refusal.written}" — ${mechanism}, so an absolute path reaches outside it`;
	}
	if (refusal.kind === "drive-rooted") {
		return `declares the drive-rooted path "${refusal.written}" — ${mechanism}, so a drive-rooted path reaches outside it`;
	}
	return `declares the ".." segment — ${mechanism}, so ".." reaches outside it`;
}

/**
 * The path a route's declared file path names under `root`, refusing one that
 * leaves it. Both halves of the rule run here, so a caller cannot reach a
 * write or a delete without passing both: the declared form is refused before
 * anything is resolved — an absolute path is absolute on every platform — and
 * the resolved path is checked against `root` so a spelling the declared-form
 * rule does not know cannot put the operation outside the project.
 */
export function containedProjectPath(root: string, declared: string): string {
	const refusal = filePathRefusal(declared);
	if (refusal !== undefined) {
		throw new CliError(
			`Refusing route file path "${declared}": it ${filePathRefusalClause(refusal)}.`,
		);
	}

	const resolvedRoot = path.resolve(root);
	const resolved = path.resolve(resolvedRoot, declared);
	const relative = path.relative(resolvedRoot, resolved);

	if (
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new CliError(
			`Refusing route file path "${declared}": it resolves outside "${resolvedRoot}".`,
		);
	}

	return resolved;
}

export function projectFilePath(
	paths: ProjectPaths,
	side: ProjectSide,
	declared: string,
): string {
	return containedProjectPath(paths.dirOf(side), declared);
}

/**
 * Both of a route's files, resolved and checked before either is used. A route
 * command computes these before it writes or deletes anything, so one file
 * outside the project fails the command with neither file touched.
 */
export function routeFilePaths(
	paths: ProjectPaths,
	files: RouteFile,
): { react: string; view: string } {
	return {
		react: projectFilePath(paths, "client", files.react),
		view: projectFilePath(paths, "server", files.view),
	};
}
