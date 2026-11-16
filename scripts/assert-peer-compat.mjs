#!/usr/bin/env node
/**
 * Every workspace package must satisfy the peer ranges its own dependencies
 * declare. This is the gate that replaces a suppression file: the root used to
 * carry `pnpm.peerDependencyRules.allowedVersions.typescript: "6.0.3"`, which
 * silences the warning while proving nothing.
 *
 * The check reads installed metadata, not intent: `pnpm list --depth 0` gives
 * the versions actually resolved for each package, and each dependency's own
 * manifest gives the range it asks for. A range the model cannot parse fails
 * the gate instead of being skipped.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { satisfiesRange } from "./peer-ranges.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const WORKSPACE_PACKAGES = [
	path.join(ROOT, "packages", "poyo"),
	path.join(ROOT, "packages", "create-poyo-app"),
	path.join(ROOT, "packages", "poyo-template", "poyo.client"),
];

function listDependencies(packageDir) {
	const result = spawnSync("pnpm", ["list", "--depth", "0", "--json"], {
		cwd: packageDir,
		encoding: "utf-8",
	});
	if (result.status !== 0) {
		throw new Error(
			`pnpm list failed in ${packageDir}: ${result.stderr || result.stdout}`,
		);
	}
	const [entry] = JSON.parse(result.stdout);
	const collected = new Map();
	for (const group of [entry.dependencies, entry.devDependencies]) {
		for (const [name, info] of Object.entries(group ?? {})) {
			collected.set(name, info);
		}
	}
	return collected;
}

function manifestOf(dependencyInfo, packageDir) {
	const candidates = [];
	if (dependencyInfo.path) candidates.push(dependencyInfo.path);
	candidates.push(
		path.join(packageDir, "node_modules", dependencyInfo.from ?? ""),
	);
	for (const candidate of candidates) {
		const manifest = path.join(candidate, "package.json");
		if (fs.existsSync(manifest)) {
			return JSON.parse(fs.readFileSync(manifest, "utf-8"));
		}
	}
	return null;
}

/**
 * Resolves the version a package sees for `peerName`: the workspace listing
 * first, then Node resolution from the package that declares the peer.
 */
function installedVersionOf(peerName, dependencyInfo, packageDir, listing) {
	const direct = listing.get(peerName);
	if (direct?.version) return direct.version;
	const fromPath = dependencyInfo.path
		? path.join(dependencyInfo.path, "node_modules", peerName, "package.json")
		: null;
	if (fromPath && fs.existsSync(fromPath)) {
		return JSON.parse(fs.readFileSync(fromPath, "utf-8")).version;
	}
	const fallback = path.join(
		packageDir,
		"node_modules",
		peerName,
		"package.json",
	);
	if (fs.existsSync(fallback)) {
		return JSON.parse(fs.readFileSync(fallback, "utf-8")).version;
	}
	return null;
}

export function findPeerMismatches(
	packageDirs = WORKSPACE_PACKAGES,
	readListing = listDependencies,
) {
	const mismatches = [];
	for (const packageDir of packageDirs) {
		const listing = readListing(packageDir);
		for (const [name, info] of listing) {
			const manifest = manifestOf(info, packageDir);
			const peers = manifest?.peerDependencies;
			if (!peers) continue;
			const optionalPeers = manifest.peerDependenciesMeta ?? {};
			for (const [peerName, range] of Object.entries(peers)) {
				const version = installedVersionOf(peerName, info, packageDir, listing);
				if (version === null) {
					if (optionalPeers[peerName]?.optional) continue;
					mismatches.push({
						packageDir,
						dependency: name,
						peer: peerName,
						range,
						version: "(absent)",
					});
					continue;
				}
				let satisfied;
				try {
					satisfied = satisfiesRange(version, range);
				} catch (error) {
					throw new Error(
						`${name} declares peer ${peerName}@${range}, which the model cannot read: ${error.message}`,
					);
				}
				if (!satisfied) {
					mismatches.push({
						packageDir,
						dependency: name,
						peer: peerName,
						range,
						version,
					});
				}
			}
		}
	}
	return mismatches;
}

const isDirectRun =
	process.argv[1] &&
	import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isDirectRun) {
	try {
		const mismatches = findPeerMismatches();
		if (mismatches.length > 0) {
			process.stderr.write("[ERROR] Peer ranges are not satisfied:\n");
			for (const mismatch of mismatches) {
				process.stderr.write(
					`  - ${path.relative(ROOT, mismatch.packageDir)}: ${mismatch.dependency} needs ${mismatch.peer}@${mismatch.range}, resolved ${mismatch.version}\n`,
				);
			}
			process.exit(1);
		}
		process.stdout.write("[OK] Every declared peer range is satisfied\n");
	} catch (error) {
		process.stderr.write(`[ERROR] ${error.message}\n`);
		process.exit(2);
	}
}
