import fs from "node:fs";
import path from "node:path";

export type ProjectSide = "client" | "server";

export interface ProjectPaths {
	root: string;
	clientDir: string;
	serverDir: string;
	controllersDir: string;
	routesJsonPath: string;
	serverNamespace: string;
	resolveSide: (relative: string) => ProjectSide;
	dirOf: (side: ProjectSide) => string;
	toProjectPath: (side: ProjectSide, relative: string) => string;
}

export function findProjectRoot(startDir = process.cwd()): string {
	let dir = path.resolve(startDir);
	for (;;) {
		if (fs.existsSync(path.join(dir, "routes.json"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error(
				`No routes.json found from '${startDir}'. Is this a Poyo project?`,
			);
		}
		dir = parent;
	}
}

function findClientDir(root: string): string {
	const topLevel = fs
		.readdirSync(root)
		.filter((entry) => fs.statSync(path.join(root, entry)).isDirectory());
	const client = topLevel.find((entry) =>
		fs.existsSync(path.join(root, entry, "src", "pages")),
	);
	return path.join(root, client ?? "poyo.client");
}

/**
 * The server directory among the directories that carry a Views/Controllers
 * pair. A generated project ships its server test project beside the app, and
 * that project keeps the same pair for its fixtures; the app is the one whose
 * name does not end in `.Tests`. Directory listing order belongs to the
 * platform (Windows returned the test project first on a fresh scaffold), so
 * the answer must not depend on it. With only a test-suffixed candidate, that
 * candidate is still the best answer there is.
 */
export function selectServerDir(
	candidates: readonly string[],
): string | undefined {
	return (
		candidates.find((entry) => !entry.toLowerCase().endsWith(".tests")) ??
		candidates[0]
	);
}

function findServerDir(root: string): string {
	const topLevel = fs
		.readdirSync(root)
		.filter((entry) => fs.statSync(path.join(root, entry)).isDirectory());
	const server = selectServerDir(
		topLevel.filter(
			(entry) =>
				fs.existsSync(path.join(root, entry, "Views")) &&
				fs.existsSync(path.join(root, entry, "Controllers")),
		),
	);
	return path.join(root, server ?? "Poyo.Server");
}

function resolveServerNamespace(serverDir: string): string {
	if (!fs.existsSync(serverDir)) return path.basename(serverDir);
	const csproj = fs
		.readdirSync(serverDir)
		.find((entry) => entry.endsWith(".csproj"));
	if (csproj) {
		const content = fs.readFileSync(path.join(serverDir, csproj), "utf-8");
		const rootNamespace = content.match(
			/<RootNamespace>\s*([^<\s]+)\s*<\/RootNamespace>/,
		);
		if (rootNamespace) return rootNamespace[1].trim();
		return csproj.replace(/\.csproj$/, "");
	}
	return path.basename(serverDir);
}

export function getPaths(root?: string): ProjectPaths {
	const projectRoot = root ?? findProjectRoot();
	const serverDir = findServerDir(projectRoot);
	const clientDir = findClientDir(projectRoot);
	const dirOf = (side: ProjectSide) =>
		side === "client" ? clientDir : serverDir;
	return {
		root: projectRoot,
		clientDir,
		serverDir,
		controllersDir: path.join(serverDir, "Controllers"),
		routesJsonPath: path.join(projectRoot, "routes.json"),
		serverNamespace: resolveServerNamespace(serverDir),
		resolveSide: (relative) =>
			relative.startsWith("src") ? "client" : "server",
		dirOf,
		toProjectPath: (side, relative) =>
			`${path.basename(dirOf(side))}/${relative.replaceAll("\\", "/")}`,
	};
}
