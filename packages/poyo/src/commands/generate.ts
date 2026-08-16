import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import type { OpenAPI3 } from "openapi-typescript";
import { getPaths } from "../config.js";
import { CliError } from "../error.js";
import { writeRouteManifest } from "../route-manifest.js";

type ZodOpenApiDoc = Parameters<
	typeof import("openapi-zod-client").generateZodClientFromOpenAPI
>[0]["openApiDoc"];

export function generateCommand(): Command {
	return new Command("generate")
		.description(
			"Generate the typed route table plus TypeScript DTOs and Zod schemas from the OpenAPI document",
		)
		.argument(
			"[openapiSource]",
			"OpenAPI document file path or URL (defaults to VITE_OPENAPI_URL)",
		)
		.action(async (openapiSource?: string) => {
			const paths = getPaths();
			// The route table never needs the OpenAPI document; emit it first
			// so a missing or failing OpenAPI source cannot leave it stale.
			writeRouteManifest(paths);
			await generateClient(paths.clientDir, openapiSource);
		});
}

export async function generateClient(
	clientDir: string,
	openapiSource?: string,
): Promise<void> {
	loadProjectEnv(clientDir);
	const source = openapiSource ?? process.env.VITE_OPENAPI_URL;
	if (!source) {
		process.stdout.write(
			"[INFO] No OpenAPI source provided — route manifest written, OpenAPI codegen skipped.\n",
		);
		return;
	}

	// An explicitly passed source is the user's stated intent: failures stay
	// loud. A source resolved from VITE_OPENAPI_URL is ambient config — in a
	// fresh clone the dev server it points at is usually down, and predev/
	// prebuild must survive that, so its failures degrade to a notice.
	const explicit = openapiSource !== undefined;

	let document: OpenAPI3;
	try {
		document = await readOpenApiDocument(source);
	} catch (error) {
		if (explicit) throw error;
		noticeSkip(source, error);
		return;
	}
	if (!(document.components as { schemas?: unknown } | undefined)?.schemas) {
		const message = "OpenAPI document has no components.schemas";
		if (explicit) throw new CliError(message);
		process.stderr.write(
			`[WARN] OpenAPI codegen skipped (source from VITE_OPENAPI_URL): ${message}\n`,
		);
		return;
	}

	const {
		default: openapiTS,
		astToString,
		COMMENT_HEADER,
	} = await import("openapi-typescript");
	const { generateZodClientFromOpenAPI } = await import("openapi-zod-client");

	const schemasDir = path.join(clientDir, "src", "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });

	const ast = await openapiTS(document, {});
	fs.writeFileSync(
		path.join(schemasDir, "dtos.generated.ts"),
		`${COMMENT_HEADER}${astToString(ast)}`,
	);

	const zodSource = await generateZodClientFromOpenAPI({
		openApiDoc: document as ZodOpenApiDoc,
		disableWriteToFile: true,
	});
	fs.writeFileSync(
		path.join(schemasDir, "validations.generated.ts"),
		zodSource,
	);
}

function noticeSkip(source: string, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(
		`[WARN] OpenAPI codegen skipped (could not read VITE_OPENAPI_URL source ${source}): ${message}\n`,
	);
}

function loadProjectEnv(clientDir: string): void {
	const projectRoot = path.dirname(clientDir);
	const envPath = path.join(projectRoot, ".env");
	if (fs.existsSync(envPath)) {
		process.loadEnvFile(envPath);
	}
}

async function readOpenApiDocument(source: string): Promise<OpenAPI3> {
	let raw: string;
	if (/^https?:\/\//.test(source)) {
		const response = await fetch(source);
		if (!response.ok) {
			throw new CliError(
				`Failed to fetch OpenAPI document from ${source}: ${response.status}`,
			);
		}
		raw = await response.text();
	} else {
		if (!fs.existsSync(source)) {
			throw new CliError(`OpenAPI document not found: ${source}`);
		}
		raw = fs.readFileSync(source, "utf-8");
	}
	try {
		return JSON.parse(raw) as OpenAPI3;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliError(`Invalid OpenAPI document JSON: ${message}`);
	}
}
