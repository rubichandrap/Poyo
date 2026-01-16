#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { input } from "@inquirer/prompts";

// Utilities
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_ROOT = path.resolve(__dirname, "..");

// Read version from package.json
const packageJson = JSON.parse(
	fs.readFileSync(path.join(SOURCE_ROOT, "package.json"), "utf-8"),
);
const VERSION = packageJson.version;

const EXCLUDED_FILES = [
	".git",
	".idea",
	".vscode",
	"node_modules",
	"bin",
	"dist",
	"publish",
	"package-lock.json",
	"cli",
];

const BINARY_EXTENSIONS = [
	".dll",
	".exe",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".ico",
	".webp",
	".pdf",
	".woff",
	".woff2",
	".ttf",
	".eot",
];

function isBinary(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	return BINARY_EXTENSIONS.includes(ext);
}

// Recursive Copy
function copyRecursive(src, dest) {
	const stats = fs.statSync(src);
	if (stats.isDirectory()) {
		if (!fs.existsSync(dest)) {
			fs.mkdirSync(dest, { recursive: true });
		}
		const children = fs.readdirSync(src);
		for (const child of children) {
			if (EXCLUDED_FILES.includes(child)) continue;
			copyRecursive(path.join(src, child), path.join(dest, child));
		}
	} else {
		fs.copyFileSync(src, dest);
	}
}

// Rename Content
function renameContent(filePath, rules) {
	if (isBinary(filePath)) return;

	try {
		let content = fs.readFileSync(filePath, "utf-8");
		let changed = false;

		for (const rule of rules) {
			// Use global regex to replace all occurrences
			const regex = new RegExp(rule.from, "g");
			if (regex.test(content)) {
				// Reset regex lastIndex after test
				regex.lastIndex = 0;
				content = content.replace(regex, rule.to);
				changed = true;
			}
		}

		if (changed) {
			fs.writeFileSync(filePath, content, "utf-8");
		}
	} catch (e) {
		console.warn(`[WARN] Failed to read/write ${filePath}:`, e.message);
	}
}

// Apply all replacements to a name at once
function applyReplacements(name, rules) {
	let result = name;
	for (const rule of rules) {
		// Use global replace for all occurrences
		result = result.split(rule.fromRaw).join(rule.toRaw);
	}
	return result;
}

// Traverse and Process
function processProject(dir, rules) {
	const items = fs.readdirSync(dir);

	for (const item of items) {
		const fullPath = path.join(dir, item);
		const stats = fs.statSync(fullPath);

		if (stats.isDirectory()) {
			// Check if directory name needs renaming
			const newName = applyReplacements(item, rules);
			const newPath = path.join(dir, newName);

			// Only rename if the name actually changed
			if (newName !== item) {
				fs.renameSync(fullPath, newPath);
			}

			// Recurse into the directory (using the new path if renamed)
			processProject(newPath, rules);
		} else {
			// Check file name renaming
			const newName = applyReplacements(item, rules);
			const newPath = path.join(dir, newName);

			let currentPath = fullPath;

			// Only rename if the name actually changed
			if (newName !== item) {
				fs.renameSync(fullPath, newPath);
				currentPath = newPath;
			}

			// Rename content
			renameContent(currentPath, rules);
		}
	}
}

// Main Action
async function create(options) {
	let projectName = options.project;

	if (!projectName) {
		projectName = await input({
			message: "Project Name:",
			default: "MyPoyoApp",
		});
	}

	// Sanitize Project Name
	const projectPascal =
		projectName.charAt(0).toUpperCase() + projectName.slice(1);
	const projectLower = projectName.toLowerCase();

	// Replacement Rules (order matters - do case-sensitive first)
	const rules = [
		{ from: "Poyo", to: projectPascal, fromRaw: "Poyo", toRaw: projectPascal },
		{ from: "poyo", to: projectLower, fromRaw: "poyo", toRaw: projectLower },
	];

	const targetDir = path.resolve(process.cwd(), projectName);

	console.log(`\n🚀 Creating new project: ${projectName}`);
	console.log(`📦 Poyo version: ${VERSION}`);
	console.log(`📂 Source: ${SOURCE_ROOT}`);
	console.log(`📂 Destination: ${targetDir}`);

	if (fs.existsSync(targetDir)) {
		console.error(`\n❌ Error: Directory '${projectName}' already exists.`);
		process.exit(1);
	}

	console.log("\nSTEP 1: Copying files...");
	copyRecursive(SOURCE_ROOT, targetDir);

	console.log("\nSTEP 2: Renaming project...");
	processProject(targetDir, rules);

	console.log("\nSTEP 3: Cleaning up...");
	try {
		const pkgPath = path.join(targetDir, "package.json");
		if (fs.existsSync(pkgPath)) {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			delete pkg.bin;
			delete pkg.private;
			delete pkg.files; // Remove files whitelist
			pkg.name = projectLower;
			pkg.description = `Project ${projectPascal} created from Poyo starter`;
			pkg.version = "0.0.1";

			// Remove the CLI deps from dest package.json
			if (pkg.dependencies) {
				delete pkg.dependencies.commander;
				delete pkg.dependencies["@inquirer/prompts"];
			}

			fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
		}
	} catch (e) {
		console.warn("Failed to update package.json:", e);
	}

	console.log("\n✅ Project created successfully!");
	console.log(`\nNext steps:`);
	console.log(`  cd ${projectName}`);
	console.log(`  npm install`);
	console.log(`  npm run restore  (Restores .NET dependencies)`);
	console.log(`  npm run dev      (Starts development servers)`);
}

const program = new Command();

program
	.name("create-poyo-app")
	.description("Scaffold a new Poyo project")
	.argument("[project-directory]", "Directory to create the project in")
	.option(
		"--project <name>",
		"Name of the project (deprecated, use argument instead)",
	)
	.action((projectDirectory, options) => {
		// If positional argument is provided, use it as project name
		if (projectDirectory) {
			options.project = projectDirectory;
		}
		create(options);
	});

program.parse();
