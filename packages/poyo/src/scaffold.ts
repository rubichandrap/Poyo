import fs from "node:fs";
import path from "node:path";
import type { ProjectPaths } from "./config.js";
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
	viewPath: string,
): string {
	let safeControllerName = controllerName;
	if (!safeControllerName.endsWith("Controller")) {
		safeControllerName += "Controller";
	}

	const controllerPath = containedProjectPath(
		paths.controllersDir,
		`${safeControllerName}.cs`,
	);

	if (!fs.existsSync(controllerPath)) {
		fs.mkdirSync(paths.controllersDir, { recursive: true });
		fs.writeFileSync(
			controllerPath,
			controllerTemplate(
				paths.serverNamespace,
				safeControllerName,
				actionName,
				viewPath,
			),
		);
		return safeControllerName;
	}

	const content = fs.readFileSync(controllerPath, "utf-8");
	const safeActionNameForRegex = escapeRegExp(actionName);
	const actionRegex = new RegExp(
		`public\\s+(async\\s+Task<)?IActionResult(>)?\\s+${safeActionNameForRegex}\\s*\\(`,
		"i",
	);
	if (actionRegex.test(content)) {
		throw new Error(
			`Action '${actionName}' already exists in ${safeControllerName}.cs`,
		);
	}

	const lastBraceIndex = content.lastIndexOf("}");
	if (lastBraceIndex === -1) {
		throw new Error(
			`Could not parse class structure in ${safeControllerName}.cs`,
		);
	}

	const newContent =
		content.slice(0, lastBraceIndex) +
		actionTemplate(actionName, viewPath) +
		content.slice(lastBraceIndex);
	fs.writeFileSync(controllerPath, newContent);
	return safeControllerName;
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
		ensureControllerAction(
			paths,
			options.controller,
			options.action,
			files.view,
		);
	}
}

/**
 * Deletes a route's files, and its controller when one is named, resolving and
 * checking every path before anything is removed. `route remove` reaches the
 * filesystem through here, so a route the registry never validated still
 * cannot delete a file outside the project: the check is at the operation, not
 * only at the read that usually precedes it.
 */
export function deleteRouteFiles(
	paths: ProjectPaths,
	files: RouteFile,
	options: { controller?: string } = {},
): void {
	const { react: pageFullPath, view: viewFullPath } = routeFilePaths(
		paths,
		files,
	);
	const controllerPath =
		options.controller === undefined
			? undefined
			: containedProjectPath(paths.controllersDir, `${options.controller}.cs`);

	if (controllerPath !== undefined && fs.existsSync(controllerPath)) {
		fs.unlinkSync(controllerPath);
	}

	if (fs.existsSync(pageFullPath)) {
		fs.unlinkSync(pageFullPath);
		deleteEmptyParents(pageFullPath, paths.clientDir);
	}

	if (fs.existsSync(viewFullPath)) {
		fs.unlinkSync(viewFullPath);
		deleteEmptyParents(viewFullPath, paths.serverDir);
	}
}
