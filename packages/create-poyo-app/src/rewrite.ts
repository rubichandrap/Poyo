import fs from "node:fs";
import path from "node:path";

const POYO_PKG = "@rubichandrap/poyo";
const FRESH_VERSION = "0.0.1";

function pinPoyoDevDep(
	pkg: Record<string, unknown>,
	poyoVersion: string,
): void {
	const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
	devDeps[POYO_PKG] = poyoVersion;
	pkg.devDependencies = devDeps;
}

export function rewritePackageJson(
	targetDir: string,
	projectPascal: string,
	projectLower: string,
	poyoVersion: string,
): void {
	const pkgPath = path.join(targetDir, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
		string,
		unknown
	>;
	pkg.name = projectLower;
	pkg.version = FRESH_VERSION;
	pkg.description = `Project ${projectPascal} created from the Poyo template`;
	pkg.private = true;
	delete pkg.bin;
	delete pkg.files;
	pinPoyoDevDep(pkg, poyoVersion);
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

export function rewriteClientPackageJson(
	targetDir: string,
	projectLower: string,
	poyoVersion: string,
): void {
	const pkgPath = path.join(
		targetDir,
		`${projectLower}.client`,
		"package.json",
	);
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
		string,
		unknown
	>;
	// Silent-skip: pin only a dependency the template actually declares, and
	// never rewrite a manifest that needs no change.
	const devDeps = pkg.devDependencies;
	if (
		typeof devDeps !== "object" ||
		devDeps === null ||
		!(POYO_PKG in devDeps)
	) {
		return;
	}
	(devDeps as Record<string, string>)[POYO_PKG] = poyoVersion;
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
