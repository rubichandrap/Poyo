import fs from "node:fs";
import path from "node:path";
import type { ProjectPaths } from "./config.js";
import { CliError } from "./error.js";
import { containedProjectPath, routeFilePaths } from "./file-paths.js";
import type { RouteFile } from "./routes.js";
import {
	actionTemplate,
	controllerTemplate,
	pageTemplate,
	viewTemplate,
} from "./templates.js";

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CSHARP_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Refuses a value that cannot be written into generated C# as an identifier.
 * A controller or action name reaches a file path and a source file, so
 * anything else is either a path escape or a syntax injection.
 */
export function assertCSharpIdentifier(value: string, flag: string): void {
	if (!CSHARP_IDENTIFIER.test(value)) {
		throw new CliError(
			`--${flag} must be a C# identifier (letters, digits, and underscores, not starting with a digit), got: ${JSON.stringify(value)}`,
		);
	}
}

/** The class and file name for a controller: MVC's suffix belongs there. */
export function controllerClassName(controllerName: string): string {
	return controllerName.endsWith("Controller")
		? controllerName
		: `${controllerName}Controller`;
}

/**
 * The name MVC matches: the class name without its suffix. The registry stores
 * this, because an MVC route value carrying "Controller" names no controller.
 */
export function controllerRouteName(controllerName: string): string {
	const name = controllerName.endsWith("Controller")
		? controllerName.slice(0, -"Controller".length)
		: controllerName;

	if (!name) {
		throw new CliError(
			`--controller must name a controller, got: ${JSON.stringify(controllerName)}`,
		);
	}

	return name;
}

function ensureFrameworkUsing(content: string): string {
	if (/^\s*using\s+Poyo\.Framework\s*;/m.test(content)) {
		return content;
	}
	return `using Poyo.Framework;\n${content}`;
}

export function findFiles(
	dir: string,
	predicate: (filePath: string) => boolean,
	fileList: string[] = [],
	rootDir = dir,
): string[] {
	if (!fs.existsSync(dir)) return fileList;
	const entries = fs.readdirSync(dir);
	for (const entry of entries) {
		const entryPath = path.join(dir, entry);
		const stat = fs.statSync(entryPath);
		if (stat.isDirectory()) {
			findFiles(entryPath, predicate, fileList, rootDir);
		} else if (predicate(entryPath)) {
			fileList.push(path.relative(rootDir, entryPath).replaceAll("\\", "/"));
		}
	}
	return fileList;
}

export function deleteEmptyParents(filePath: string, rootDir: string): void {
	let dir = path.dirname(filePath);
	while (dir !== rootDir && path.relative(rootDir, dir).length > 0) {
		if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
			fs.rmdirSync(dir);
			dir = path.dirname(dir);
		} else {
			break;
		}
	}
}

export function ensureControllerAction(
	paths: ProjectPaths,
	controllerName: string,
	actionName: string,
): string {
	const routeName = controllerRouteName(controllerName);
	const className = controllerClassName(controllerName);

	const controllerPath = containedProjectPath(
		paths.controllersDir,
		`${className}.cs`,
	);

	if (!fs.existsSync(controllerPath)) {
		fs.mkdirSync(paths.controllersDir, { recursive: true });
		fs.writeFileSync(
			controllerPath,
			controllerTemplate(paths.serverNamespace, className, actionName),
		);
		return routeName;
	}

	const content = ensureFrameworkUsing(
		fs.readFileSync(controllerPath, "utf-8"),
	);
	const safeActionNameForRegex = escapeRegExp(actionName);
	const actionRegex = new RegExp(
		`public\\s+(async\\s+Task<)?IActionResult(>)?\\s+${safeActionNameForRegex}\\s*\\(`,
		"i",
	);
	if (actionRegex.test(content)) {
		throw new Error(`Action '${actionName}' already exists in ${className}.cs`);
	}

	const lastBraceIndex = content.lastIndexOf("}");
	if (lastBraceIndex === -1) {
		throw new Error(`Could not parse class structure in ${className}.cs`);
	}

	const newContent =
		content.slice(0, lastBraceIndex) +
		actionTemplate(actionName) +
		content.slice(lastBraceIndex);
	fs.writeFileSync(controllerPath, newContent);
	return routeName;
}

export function scaffoldRouteFiles(
	paths: ProjectPaths,
	name: string,
	files: RouteFile,
	options: { noView?: boolean; controller?: string; action?: string },
): void {
	// Both paths are resolved and checked before either file is written, so a
	// registry that names a file outside the project fails the command with
	// nothing created — not even the page beside the refused view.
	const { react: pageFullPath, view: viewFullPath } = routeFilePaths(
		paths,
		files,
	);

	if (!fs.existsSync(pageFullPath)) {
		fs.mkdirSync(path.dirname(pageFullPath), { recursive: true });
		fs.writeFileSync(pageFullPath, pageTemplate(name));
	}

	if (options.noView) {
		return;
	}

	if (!fs.existsSync(viewFullPath)) {
		fs.mkdirSync(path.dirname(viewFullPath), { recursive: true });
		fs.writeFileSync(viewFullPath, viewTemplate(name));
	}

	if (options.controller && options.action) {
		ensureControllerAction(paths, options.controller, options.action);
	}
}

/**
 * Deletes a route's files and, when the caller asks for them, its controller.
 * `files` is required so a caller states which halves it deletes: the two
 * confirmations in `route remove` are independent, and a controller deletion
 * must not take the page and view with it. Every path is resolved and checked
 * before anything is removed, so a route the registry never validated still
 * cannot delete a file outside the project.
 */
export function deleteRouteFiles(
	paths: ProjectPaths,
	files: RouteFile,
	options: { files: boolean; controller?: string },
): void {
	const filePaths = options.files ? routeFilePaths(paths, files) : undefined;
	const controllerPath =
		options.controller === undefined
			? undefined
			: containedProjectPath(
					paths.controllersDir,
					`${controllerClassName(options.controller)}.cs`,
				);

	if (controllerPath !== undefined && fs.existsSync(controllerPath)) {
		fs.unlinkSync(controllerPath);
	}

	if (filePaths === undefined) {
		return;
	}

	if (fs.existsSync(filePaths.react)) {
		fs.unlinkSync(filePaths.react);
		deleteEmptyParents(filePaths.react, paths.clientDir);
	}

	if (fs.existsSync(filePaths.view)) {
		fs.unlinkSync(filePaths.view);
		deleteEmptyParents(filePaths.view, paths.serverDir);
	}
}
