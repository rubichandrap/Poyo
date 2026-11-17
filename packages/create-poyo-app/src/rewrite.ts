import fs from "node:fs";
import path from "node:path";

const POYO_PKG = "@rubichandrap/poyo";
const FRESH_VERSION = "0.0.1";

// Framework identifiers are fixed across generated projects: the C# server
// core ships inside @rubichandrap/poyo (ADR 0008) with the fixed
// Poyo.Framework namespace and entry points, so template files that call it
// must keep these tokens verbatim through the rename. They are recognized by
// shape, not by a hand-kept list: `Poyo` immediately followed by an uppercase
// letter (PoyoPage, PoyoPageData, PoyoHost) is a framework identifier, so a
// new entry point needs no entry here. Protection wraps the token with
// sentinels no template file contains, then unwraps after the rename rules run.
const CAMEL_CASE_FRAMEWORK_IDENTIFIER = /Poyo(?=[A-Z])/g;

// The identifiers the shape rule cannot see: `Poyo.Framework` and
// `X-Poyo-Navigation` are followed by a dot and a hyphen, and `AddPoyo` ends in
// `Poyo` rather than starting with it. All three are framework API, so they are
// protected by their own spellings.
const EXPLICIT_FRAMEWORK_IDENTIFIERS = [
	"Poyo.Framework",
	"AddPoyo",
	"X-Poyo-Navigation",
] as const;

const PROTECTED_POYO = "\u0000P\u0000";

export function protectFrameworkIdentifiers(content: string): string {
	const withExplicit = EXPLICIT_FRAMEWORK_IDENTIFIERS.reduce(
		(acc, identifier) =>
			acc.replaceAll(identifier, identifier.replace("Poyo", PROTECTED_POYO)),
		content,
	);
	return withExplicit.replaceAll(
		CAMEL_CASE_FRAMEWORK_IDENTIFIER,
		PROTECTED_POYO,
	);
}

export function unprotectFrameworkIdentifiers(content: string): string {
	return content.replaceAll(PROTECTED_POYO, "Poyo");
}

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
	// The template's publishing metadata describes the template package, not
	// the project made from it. Left in, the rename turned the repository URL
	// into github.com/rubichandrap/<Project>, a repository that does not exist.
	for (const field of ["repository", "homepage", "bugs", "keywords"]) {
		delete pkg[field];
	}
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
