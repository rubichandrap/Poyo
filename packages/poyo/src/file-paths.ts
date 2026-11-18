import fs from "node:fs";
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
 * leaves it. The declared form is refused before anything is resolved — an
 * absolute path is absolute on every platform — and the resolved path is then
 * checked twice: once against `root` as written, and once against its real
 * path, so a symbolic link inside the project cannot point a write or a delete
 * outside it. Symbolic links are followed for the target and for its nearest
 * existing ancestor, which is what lets a file that does not exist yet be
 * checked: its future directory is resolved, not the file's own absence.
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

	if (leavesRoot(path.relative(resolvedRoot, resolved))) {
		throw new CliError(
			`Refusing route file path "${declared}": it resolves outside "${resolvedRoot}".`,
		);
	}

	const realRoot = realPathOfNearestExisting(resolvedRoot) ?? resolvedRoot;
	const realTarget = realPathOfNearestExisting(resolved);

	if (realTarget === undefined) {
		throw new CliError(
			`Refusing route file path "${declared}": it cannot be resolved, because a symbolic link in it targets nothing.`,
		);
	}

	if (leavesRoot(path.relative(realRoot, realTarget))) {
		throw new CliError(
			`Refusing route file path "${declared}": it resolves outside "${resolvedRoot}" through a symbolic link.`,
		);
	}

	return resolved;
}

function leavesRoot(relative: string): boolean {
	return (
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	);
}

/**
 * The real path of `target`, following symbolic links for every part of it
 * that exists, or `undefined` when a link in it resolves nowhere. The missing
 * tail is appended to the real path of its nearest existing ancestor, so a
 * file that has not been created yet is judged by the directory it would land
 * in — and a root that has not been created yet resolves the same way, which
 * is what keeps `route add --controller` working before `Controllers/` exists.
 */
function realPathOfNearestExisting(target: string): string | undefined {
	let existing = target;
	const missing: string[] = [];

	for (;;) {
		try {
			fs.lstatSync(existing);
			break;
		} catch {
			const parent = path.dirname(existing);
			if (parent === existing) {
				break;
			}
			missing.unshift(path.basename(existing));
			existing = parent;
		}
	}

	let real: string;
	try {
		real = fs.realpathSync(existing);
	} catch {
		return undefined;
	}

	return missing.length === 0 ? real : path.join(real, ...missing);
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
