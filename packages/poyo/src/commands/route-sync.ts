import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { getPaths, type ProjectPaths } from "../config.js";
import { toRouteName, toRoutePath } from "../naming.js";
import { readRoutes, writeRoutes } from "../registry.js";
import { DEFAULT_ACCESS, type Route } from "../routes.js";
import {
	deleteEmptyParents,
	findFiles,
	scaffoldRouteFiles,
} from "../scaffold.js";
import { defaultSeo, viewTemplate } from "../templates.js";

interface SyncReport {
	missingRoutes: { route: Route; missingFiles: string[] }[];
	untrackedReact: string[];
	untrackedViews: string[];
}

function detect(paths: ProjectPaths): SyncReport {
	const routes = readRoutes(paths);

	const missingRoutes: SyncReport["missingRoutes"] = [];
	for (const route of routes) {
		const missingFiles: string[] = [];
		if (!fs.existsSync(`${paths.clientDir}/${route.files.react}`)) {
			missingFiles.push("React Page");
		}
		if (!fs.existsSync(`${paths.serverDir}/${route.files.view}`)) {
			missingFiles.push("MVC View");
		}
		if (missingFiles.length > 0) {
			missingRoutes.push({ route, missingFiles });
		}
	}

	const reactPages = findFiles(
		`${paths.clientDir}/src/pages`,
		(file) => file.endsWith(".page.tsx"),
		[],
		paths.clientDir,
	);
	const viewPages = findFiles(
		`${paths.serverDir}/Views`,
		(file) => {
			const name = file.split("/").pop() ?? "";
			return (
				file.endsWith(".cshtml") &&
				!file.includes("Shared") &&
				!name.startsWith("_")
			);
		},
		[],
		paths.serverDir,
	);

	const trackedReactFiles = new Set(
		routes.map((r) => r.files.react.replaceAll("\\", "/")),
	);
	const trackedViewFiles = new Set(
		routes.map((r) => r.files.view.replaceAll("\\", "/")),
	);

	const untrackedReact = reactPages.filter((f) => !trackedReactFiles.has(f));
	const untrackedViews = viewPages.filter((f) => !trackedViewFiles.has(f));

	return { missingRoutes, untrackedReact, untrackedViews };
}

interface UntrackedCandidate {
	route: Route;
}

function inferRoutesFromUntracked(report: SyncReport): UntrackedCandidate[] {
	const candidates: UntrackedCandidate[] = [];
	for (const reactFile of report.untrackedReact) {
		const relativePath = reactFile.replace(/^src\/pages\//, "");
		let routeName: string;
		if (relativePath.endsWith("/index.page.tsx")) {
			routeName = relativePath.replace(/\/index\.page\.tsx$/, "");
		} else {
			routeName = relativePath.replace(/\.page\.tsx$/, "");
		}

		const name = toRouteName(routeName);
		const viewCandidate = `Views/${name}/Index.cshtml`;
		const viewCandidateFlat = `Views/${name}.cshtml`;

		let finalView = viewCandidate;
		if (report.untrackedViews.includes(viewCandidateFlat)) {
			finalView = viewCandidateFlat;
		}

		candidates.push({
			route: {
				path: toRoutePath(name),
				name,
				files: { react: reactFile, view: finalView },
				access: DEFAULT_ACCESS,
				seo: defaultSeo(name),
			},
		});
	}
	return candidates;
}

function writeDiscrepancyReport(paths: ProjectPaths, report: SyncReport): void {
	process.stdout.write("[WARN] Discrepancies found:\n");
	for (const { route, missingFiles } of report.missingRoutes) {
		process.stdout.write(
			`  - ${route.path} is missing: ${missingFiles.join(", ")}\n`,
		);
	}
	for (const file of report.untrackedReact) {
		process.stdout.write(
			`  - untracked React page: ${paths.toProjectPath("client", file)}\n`,
		);
	}
	for (const file of report.untrackedViews) {
		process.stdout.write(
			`  - untracked MVC view: ${paths.toProjectPath("server", file)}\n`,
		);
	}
}

export function syncCommand(): Command {
	return new Command("sync")
		.description("Verify consistency between routes.json and file system")
		.option("--rescaffold", "Re-create missing files for broken routes")
		.option("--prune", "Remove broken routes from routes.json")
		.option(
			"--add",
			"Add untracked pages to routes.json (non-interactive, adds all)",
		)
		.option(
			"--delete",
			"Delete untracked files from disk (non-interactive, deletes all)",
		)
		.action(async (options) => {
			const paths = getPaths();
			const routes = readRoutes(paths);
			const report = detect(paths);

			if (
				report.missingRoutes.length === 0 &&
				report.untrackedReact.length === 0 &&
				report.untrackedViews.length === 0
			) {
				process.stdout.write(
					`[OK] All ${routes.length} routes indicate valid files, and no untracked files found.\n`,
				);
				return;
			}

			const action =
				(options.rescaffold && "rescaffold") ||
				(options.prune && "prune") ||
				(options.add && "add_untracked") ||
				(options.delete && "delete_untracked");

			if (!action) {
				writeDiscrepancyReport(paths, report);
				const { select } = await import("@inquirer/prompts");
				const choice = await select({
					message: "How should we resolve these discrepancies?",
					choices: [
						...(report.missingRoutes.length > 0
							? [
									{
										name: "Rescaffold: Re-create missing files for broken routes",
										value: "rescaffold",
									},
									{
										name: "Prune: Remove broken routes from routes.json",
										value: "prune",
									},
								]
							: []),
						...(report.untrackedReact.length > 0 ||
						report.untrackedViews.length > 0
							? [
									{
										name: "Add: Add untracked files to routes.json",
										value: "add_untracked",
									},
									{
										name: "Delete: Delete untracked files from disk",
										value: "delete_untracked",
									},
								]
							: []),
						{ name: "Ignore: Do nothing for now", value: "ignore" },
					],
				});
				await runAction(paths, routes, report, choice as Action, false);
				return;
			}

			await runAction(paths, routes, report, action as Action, true);
		});
}

type Action =
	| "rescaffold"
	| "prune"
	| "add_untracked"
	| "delete_untracked"
	| "ignore";

async function runAction(
	paths: ProjectPaths,
	routes: Route[],
	report: SyncReport,
	action: Action,
	nonInteractive: boolean,
): Promise<void> {
	switch (action) {
		case "rescaffold":
			for (const { route } of report.missingRoutes) {
				scaffoldRouteFiles(paths, route.name, route.files, {
					noView: false,
					controller: route.controller,
					action: route.action,
				});
			}
			break;

		case "prune": {
			const pathsToRemove = new Set(
				report.missingRoutes.map((m) => m.route.path),
			);
			writeRoutes(
				paths,
				routes.filter((r) => !pathsToRemove.has(r.path)),
			);
			break;
		}

		case "add_untracked": {
			const candidates = inferRoutesFromUntracked(report);
			let selected: UntrackedCandidate[] = candidates;

			if (!nonInteractive && candidates.length > 0) {
				const { checkbox } = await import("@inquirer/prompts");
				selected = await checkbox({
					message: "Select routes to add:",
					choices: candidates.map((c) => ({
						name: `${c.route.path} (${c.route.files.react})`,
						value: c,
						checked: true,
					})),
				});
			}

			const coveredViews = new Set(candidates.map((c) => c.route.files.view));
			const orphanViews = report.untrackedViews.filter(
				(v) => !coveredViews.has(v),
			);
			if (orphanViews.length > 0) {
				process.stdout.write(
					`[INFO] Untracked MVC views with no matching React page (manual intervention needed):\n`,
				);
				for (const view of orphanViews) {
					process.stdout.write(`  - ${paths.toProjectPath("server", view)}\n`);
				}
			}

			for (const { route } of selected) {
				if (!routes.some((r) => r.path === route.path)) {
					routes.push(route);
				}
				if (!fs.existsSync(`${paths.serverDir}/${route.files.view}`)) {
					const viewPath = `${paths.serverDir}/${route.files.view}`;
					fs.mkdirSync(path.dirname(viewPath), { recursive: true });
					fs.writeFileSync(viewPath, viewTemplate(route.name));
				}
			}
			writeRoutes(paths, routes);
			break;
		}

		case "delete_untracked": {
			const filesToDelete = [
				...report.untrackedReact,
				...report.untrackedViews,
			];
			let selected: string[] = filesToDelete;

			if (!nonInteractive && filesToDelete.length > 0) {
				const { checkbox } = await import("@inquirer/prompts");
				selected = await checkbox({
					message: "Select files to PERMANENTLY DELETE:",
					choices: filesToDelete.map((f) => ({
						name: paths.toProjectPath(paths.resolveSide(f), f),
						value: f,
						checked: true,
					})),
				});
			}

			for (const file of selected) {
				const side = paths.resolveSide(file);
				const full = path.join(paths.dirOf(side), file);
				if (fs.existsSync(full)) {
					fs.unlinkSync(full);
					deleteEmptyParents(full, paths.dirOf(side));
				}
			}
			break;
		}

		case "ignore":
			break;
	}
}
