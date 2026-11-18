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
 * The C# reserved keywords. A contextual keyword is a legal identifier in the
 * positions this CLI writes, a reserved one is not: `public IActionResult
 * class()` does not compile.
 */
const CSHARP_KEYWORDS = new Set([
	"abstract",
	"as",
	"base",
	"bool",
	"break",
	"byte",
	"case",
	"catch",
	"char",
	"checked",
	"class",
	"const",
	"continue",
	"decimal",
	"default",
	"delegate",
	"do",
	"double",
	"else",
	"enum",
	"event",
	"explicit",
	"extern",
	"false",
	"finally",
	"fixed",
	"float",
	"for",
	"foreach",
	"goto",
	"if",
	"implicit",
	"in",
	"int",
	"interface",
	"internal",
	"is",
	"lock",
	"long",
	"namespace",
	"new",
	"null",
	"object",
	"operator",
	"out",
	"override",
	"params",
	"private",
	"protected",
	"public",
	"readonly",
	"ref",
	"return",
	"sbyte",
	"sealed",
	"short",
	"sizeof",
	"stackalloc",
	"static",
	"string",
	"struct",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"uint",
	"ulong",
	"unchecked",
	"unsafe",
	"ushort",
	"using",
	"virtual",
	"void",
	"volatile",
	"while",
]);

/**
 * Refuses a value that cannot be written into generated C# as an identifier.
 * A controller or action name reaches a file path and a source file, so
 * anything else is either a path escape or a syntax injection.
 */
export function assertCSharpIdentifier(value: string, flag: string): void {
	if (!CSHARP_IDENTIFIER.test(value) || CSHARP_KEYWORDS.has(value)) {
		throw new CliError(
			`--${flag} must be a C# identifier (letters, digits, and underscores, not starting with a digit, and not a reserved keyword), got: ${JSON.stringify(value)}`,
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

/** The file a controller name resolves to, inside the project. */
export function controllerFilePath(
	paths: ProjectPaths,
	controllerName: string,
): string {
	return containedProjectPath(
		paths.controllersDir,
		`${controllerClassName(controllerName)}.cs`,
	);
}

/**
 * The one shape `route add --controller` writes: the class wrapper around one
 * `PoyoPage(null)` action per route it scaffolded. `route remove` rebuilds a
 * controller from the actions it can read and compares the whole file, so any
 * edit — a different body, a constructor, an extra method — reads as authored
 * and is never deleted on the operator's behalf.
 */
export function scaffoldedControllerSource(
	serverNamespace: string,
	controllerName: string,
	actionNames: string[],
): string {
	const actions = actionNames
		.map(
			(actionName) => `    public IActionResult ${actionName}()
    {
        return this.PoyoPage(null);
    }`,
		)
		.join("\n\n");

	return `using Microsoft.AspNetCore.Mvc;
using Poyo.Framework;

namespace ${serverNamespace}.Controllers;

public class ${controllerName} : Controller
{
${actions}
}
`;
}

/** The action signature the CLI writes, used to read a controller back. */
const SCAFFOLDED_ACTION = /public IActionResult ([A-Za-z_][A-Za-z0-9_]*)\(\)/g;

/**
 * Whether the whole controller file is exactly what the CLI writes for the
 * actions it holds. Line endings and a BOM are the editor's, not authorship, so
 * they are normalized; every other difference means a human wrote or changed
 * something and the file is kept.
 */
export function isScaffoldedController(
	paths: ProjectPaths,
	controllerName: string,
): boolean {
	const controllerPath = controllerFilePath(paths, controllerName);
	if (!fs.existsSync(controllerPath)) return false;

	const content = fs
		.readFileSync(controllerPath, "utf-8")
		.replace(/^\uFEFF/, "")
		.replace(/\r\n/g, "\n");
	const actionNames = [...content.matchAll(SCAFFOLDED_ACTION)].map(
		(match) => match[1],
	);
	if (actionNames.length === 0) return false;

	return (
		content ===
		scaffoldedControllerSource(
			paths.serverNamespace,
			controllerClassName(controllerName),
			actionNames,
		)
	);
}

const FRAMEWORK_USING = "using Poyo.Framework;";

const LOCAL_FRAMEWORK_USING = /^[ \t]*using[ \t]+Poyo\.Framework[ \t]*;/m;
const GLOBAL_FRAMEWORK_USING =
	/^[ \t]*global[ \t]+using[ \t]+Poyo\.Framework[ \t]*;/m;

/**
 * Whether any C# source in the project declares `global using Poyo.Framework;`.
 * A global using reaches every file compiled with it, so a scaffolded action
 * needs no local directive. Build output is skipped: generated files under
 * bin/ and obj/ are not authored sources.
 */
function projectUsesGlobalFramework(dir: string): boolean {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (
			entry.name === "bin" ||
			entry.name === "obj" ||
			entry.name === "node_modules"
		) {
			continue;
		}

		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (projectUsesGlobalFramework(full)) return true;
			continue;
		}

		if (
			entry.name.endsWith(".cs") &&
			GLOBAL_FRAMEWORK_USING.test(fs.readFileSync(full, "utf-8"))
		) {
			return true;
		}
	}

	return false;
}

/**
 * Adds the framework using to an existing controller unless the project
 * already reaches the namespace, and after any `extern alias` directives,
 * which C# requires to precede using directives.
 */
function ensureFrameworkUsing(
	content: string,
	projectHasGlobalUsing: boolean,
): string {
	if (
		projectHasGlobalUsing ||
		LOCAL_FRAMEWORK_USING.test(content) ||
		GLOBAL_FRAMEWORK_USING.test(content)
	) {
		return content;
	}

	const bom = content.startsWith("\uFEFF") ? "\uFEFF" : "";
	const body = bom ? content.slice(1) : content;
	const externAlias =
		/^[ \t]*extern[ \t]+alias[ \t]+[A-Za-z_][A-Za-z0-9_.]*[ \t]*;[ \t]*(?:\/\/[^\n]*)?$/gm;
	let insertAt = 0;

	for (const match of body.matchAll(externAlias)) {
		insertAt = (match.index ?? 0) + match[0].length;
		if (body.slice(insertAt, insertAt + 2) === "\r\n") {
			insertAt += 2;
		} else if (body[insertAt] === "\n") {
			insertAt += 1;
		}
	}

	return `${bom}${body.slice(0, insertAt)}${FRAMEWORK_USING}\n${body.slice(insertAt)}`;
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

	const controllerPath = controllerFilePath(paths, controllerName);

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
		projectUsesGlobalFramework(paths.serverDir),
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
			: controllerFilePath(paths, options.controller);

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
