import fs from "node:fs";
import path from "node:path";
import type { ProjectPaths } from "./config.js";
import type { RouteFile } from "./routes.js";
import {
	actionTemplate,
	controllerTemplate,
	pageTemplate,
	viewTemplate,
} from "./templates.js";

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

	const controllerPath = path.join(
		paths.controllersDir,
		`${safeControllerName}.cs`,
	);

	if (!fs.existsSync(controllerPath)) {
		fs.mkdirSync(paths.controllersDir, { recursive: true });
		fs.writeFileSync(
			controllerPath,
			controllerTemplate(safeControllerName, actionName, viewPath),
		);
		return safeControllerName;
	}

	const content = fs.readFileSync(controllerPath, "utf-8");
	const actionRegex = new RegExp(
		`public\\s+(async\\s+Task<)?IActionResult(>)?\\s+${actionName}\\s*\\(`,
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
	const pageFullPath = path.join(paths.clientDir, files.react);
	const viewFullPath = path.join(paths.serverDir, files.view);

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
