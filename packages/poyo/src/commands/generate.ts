import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import type { OpenAPI3 } from "openapi-typescript";
import { getPaths } from "../config.js";
import { CliError } from "../error.js";

type ZodOpenApiDoc = Parameters<
	typeof import("openapi-zod-client").generateZodClientFromOpenAPI
>[0]["openApiDoc"];

export function generateCommand(): Command {
	return new Command("generate")
		.description(
			"Generate TypeScript DTOs and Zod schemas from the server OpenAPI document",
		)
		.argument(
			"[openapiSource]",
			"OpenAPI document file path or URL (defaults to VITE_OPENAPI_URL)",
		)
		.action(async (openapiSource?: string) => {
			const paths = getPaths();
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
		throw new CliError(
			"Missing OpenAPI source. Pass it as an argument or set VITE_OPENAPI_URL.",
		);
	}

	const document = await readOpenApiDocument(source);
	if (!(document.components as { schemas?: unknown } | undefined)?.schemas) {
		throw new CliError("OpenAPI document has no components.schemas");
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
