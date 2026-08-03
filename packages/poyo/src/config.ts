import fs from "node:fs";
import path from "node:path";

export interface ProjectPaths {
	root: string;
	clientDir: string;
	serverDir: string;
	controllersDir: string;
	routesJsonPath: string;
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

function findServerDir(root: string): string {
	const topLevel = fs
		.readdirSync(root)
		.filter((entry) => fs.statSync(path.join(root, entry)).isDirectory());
	const server = topLevel.find(
		(entry) =>
			fs.existsSync(path.join(root, entry, "Views")) &&
			fs.existsSync(path.join(root, entry, "Controllers")),
	);
	return path.join(root, server ?? "Poyo.Server");
}

export function getPaths(root?: string): ProjectPaths {
	const projectRoot = root ?? findProjectRoot();
	const serverDir = findServerDir(projectRoot);
	return {
		root: projectRoot,
		clientDir: findClientDir(projectRoot),
		serverDir,
		controllersDir: path.join(serverDir, "Controllers"),
		routesJsonPath: path.join(projectRoot, "routes.json"),
	};
}
