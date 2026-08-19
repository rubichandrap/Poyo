import { describe, expect, it } from "vitest";
import {
	execInFixture,
	existsFixtureFile,
	makeFixture,
	readFixtureFile,
	writeFixtureFile,
} from "./helpers.js";

const minimalOpenApi = {
	openapi: "3.0.1",
	info: { title: "Test", version: "1.0.0" },
	paths: {
		"/api/Auth/Login": {
			post: {
				operationId: "login",
				requestBody: {
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/LoginRequest" },
						},
					},
				},
				responses: {
					200: {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/JSendResponseOfLoginResponse",
								},
							},
						},
					},
				},
			},
		},
	},
	components: {
		schemas: {
			LoginRequest: {
				type: "object",
				required: ["username", "password"],
				properties: {
					username: { type: "string", maxLength: 150 },
					password: { type: "string", minLength: 2, maxLength: 100 },
					rememberMe: { type: "boolean" },
				},
			},
			LoginResponse: {
				type: "object",
				properties: {
					token: { type: "string" },
					expiration: { type: "string", format: "date-time" },
				},
			},
			JSendResponseOfLoginResponse: {
				type: "object",
				properties: {
					status: { type: "string" },
					data: { $ref: "#/components/schemas/LoginResponse" },
					message: { type: "string", nullable: true },
				},
			},
		},
	},
};

function fixtureWithSnapshot(
	doc: unknown = minimalOpenApi,
	routes: Parameters<typeof makeFixture>[0] = [],
): ReturnType<typeof makeFixture> {
	const fixture = makeFixture(routes);
	writeFixtureFile(
		fixture,
		"poyo.client/openapi/openapi.json",
		JSON.stringify(doc),
	);
	return fixture;
}

describe("poyo generate", () => {
	it("produces dtos.generated.ts with the schemas as TS types from snapshot by default", () => {
		const fixture = fixtureWithSnapshot();
		const result = execInFixture(fixture, ["generate"]);

		expect(result.status).toBe(0);
		const dtos = readFixtureFile(
			fixture,
			"poyo.client/src/schemas/dtos.generated.ts",
		);
		expect(dtos).toContain("LoginRequest:");
		expect(dtos).toContain("username: string;");
		expect(dtos).toContain('"/api/Auth/Login"');
	});

	it("produces validations.generated.ts with Zod schemas from snapshot by default", () => {
		const fixture = fixtureWithSnapshot();
		const result = execInFixture(fixture, ["generate"]);

		expect(result.status).toBe(0);
		const validations = readFixtureFile(
			fixture,
			"poyo.client/src/schemas/validations.generated.ts",
		);
		expect(validations).toContain("export const schemas");
		expect(validations).toContain("username: z.string().max(150)");
		expect(validations).toContain('from "@zodios/core"');
	});

	it("supports positional argument override for one-off documents", () => {
		const fixture = makeFixture();
		writeFixtureFile(
			fixture,
			"custom-spec.json",
			JSON.stringify(minimalOpenApi),
		);
		const result = execInFixture(fixture, ["generate", "custom-spec.json"]);

		expect(result.status).toBe(0);
		const dtos = readFixtureFile(
			fixture,
			"poyo.client/src/schemas/dtos.generated.ts",
		);
		expect(dtos).toContain("LoginRequest:");
	});

	it("fails clearly when the snapshot is missing", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["generate"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("OpenAPI document not found");
	});

	it("fails clearly when an explicit positional OpenAPI file is missing", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["generate", "nope.json"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("OpenAPI document not found");
	});

	it("runs 100% offline and ignores VITE_OPENAPI_URL in environment", () => {
		const fixture = fixtureWithSnapshot();
		const result = execInFixture(fixture, ["generate"], {
			VITE_OPENAPI_URL: "http://invalid-dead-host:99999/spec.json",
		});
		expect(result.status).toBe(0);
		const dtos = readFixtureFile(
			fixture,
			"poyo.client/src/schemas/dtos.generated.ts",
		);
		expect(dtos).toContain("LoginRequest:");
	});

	it("fails when OpenAPI document has no components.schemas", () => {
		const fixture = fixtureWithSnapshot({
			openapi: "3.0.1",
			info: { title: "Test", version: "1.0.0" },
			paths: {},
		});
		const result = execInFixture(fixture, ["generate"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"OpenAPI document has no components.schemas",
		);
	});

	it("emits routes.generated.ts with literal unions and a routePath helper", () => {
		const fixture = fixtureWithSnapshot(minimalOpenApi, [
			{
				path: "/Dashboard",
				name: "Dashboard",
				files: {
					react: "src/pages/Dashboard/index.page.tsx",
					view: "Views/Dashboard/Index.cshtml",
				},
				access: "protected",
			},
			{
				path: "/Login",
				name: "Login",
				files: {
					react: "src/pages/Login/index.page.tsx",
					view: "Views/Login/Index.cshtml",
				},
				access: "guest",
			},
		]);
		const result = execInFixture(fixture, ["generate"]);
		expect(result.status).toBe(0);

		const manifest = readFixtureFile(
			fixture,
			"poyo.client/routes.generated.ts",
		);
		expect(manifest).toContain("export const routeManifest =");
		expect(manifest).toContain("as const satisfies readonly RouteEntry[]");
		expect(manifest).toContain(
			'export type RouteName = "Dashboard" | "Login";',
		);
		expect(manifest).toContain(
			'export type RoutePath = "/Dashboard" | "/Login";',
		);
		expect(manifest).toContain(
			"export function routePath(name: RouteName): RoutePath",
		);
		expect(manifest).toContain('"Dashboard": "/Dashboard",');
		expect(manifest).toContain(
			'import type { RouteEntry } from "@rubichandrap/poyo/runtime";',
		);
	});

	it("emits never unions for an empty registry", () => {
		const fixture = fixtureWithSnapshot();
		const result = execInFixture(fixture, ["generate"]);
		expect(result.status).toBe(0);

		const manifest = readFixtureFile(
			fixture,
			"poyo.client/routes.generated.ts",
		);
		expect(manifest).toContain("export type RouteName = never;");
		expect(manifest).toContain("export type RoutePath = never;");
	});
});
