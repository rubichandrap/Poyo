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
			"Generate the typed route table plus TypeScript DTOs and Zod schemas from the OpenAPI snapshot",
		)
		.argument(
			"[openapiSource]",
			"OpenAPI document file path (defaults to openapi/openapi.json snapshot)",
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
	const defaultSnapshot = path.join(clientDir, "openapi", "openapi.json");
	const source = openapiSource
		? path.resolve(process.cwd(), openapiSource)
		: defaultSnapshot;

	if (!fs.existsSync(source)) {
		throw new CliError(`OpenAPI document not found: ${source}`);
	}

	let raw: string;
	try {
		raw = fs.readFileSync(source, "utf-8");
	} catch (error) {
		throw new CliError(
			`Could not read OpenAPI document: ${errorMessage(error)}`,
		);
	}

	let document: OpenAPI3;
	try {
		document = JSON.parse(raw) as OpenAPI3;
	} catch (error) {
		throw new CliError(`Invalid OpenAPI document JSON: ${errorMessage(error)}`);
	}

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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
