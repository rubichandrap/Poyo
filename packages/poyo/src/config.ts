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

export function getPaths(root?: string): ProjectPaths {
	const projectRoot = root ?? findProjectRoot();
	return {
		root: projectRoot,
		clientDir: path.join(projectRoot, "poyo.client"),
		serverDir: path.join(projectRoot, "Poyo.Server"),
		controllersDir: path.join(projectRoot, "Poyo.Server", "Controllers"),
		routesJsonPath: path.join(projectRoot, "routes.json"),
	};
}
