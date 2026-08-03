import { describe, expect, it } from "vitest";
import {
	execInFixture,
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

function fixtureWithOpenApi(
	doc: unknown = minimalOpenApi,
): ReturnType<typeof makeFixture> {
	const fixture = makeFixture();
	writeFixtureFile(fixture, "openapi.json", JSON.stringify(doc));
	return fixture;
}

describe("poyo generate", () => {
	it("produces dtos.generated.ts with the schemas as TS types", () => {
		const fixture = fixtureWithOpenApi();
		const result = execInFixture(fixture, ["generate", "openapi.json"]);

		expect(result.status).toBe(0);
		const dtos = readFixtureFile(
			fixture,
			"poyo.client/src/schemas/dtos.generated.ts",
		);
		expect(dtos).toContain("LoginRequest:");
		expect(dtos).toContain("username: string;");
		expect(dtos).toContain('"/api/Auth/Login"');
	});

	it("produces validations.generated.ts with Zod schemas", () => {
		const fixture = fixtureWithOpenApi();
		const result = execInFixture(fixture, ["generate", "openapi.json"]);

		expect(result.status).toBe(0);
		const validations = readFixtureFile(
			fixture,
			"poyo.client/src/schemas/validations.generated.ts",
		);
		expect(validations).toContain("export const schemas");
		expect(validations).toContain("username: z.string().max(150)");
		expect(validations).toContain('from "@zodios/core"');
	});

	it("fails clearly when the OpenAPI file is missing", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["generate", "nope.json"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("OpenAPI document not found");
	});

	it("fails clearly when no source is given and VITE_OPENAPI_URL is unset", () => {
		const fixture = makeFixture();
		const result = execInFixture(fixture, ["generate"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("VITE_OPENAPI_URL");
	});

	it("uses VITE_OPENAPI_URL when no argument is given", () => {
		const fixture = fixtureWithOpenApi();
		const result = execInFixture(fixture, ["generate"], {
			VITE_OPENAPI_URL: "openapi.json",
		});
		expect(result.status).toBe(0);
		expect(
			readFixtureFile(fixture, "poyo.client/src/schemas/dtos.generated.ts"),
		).toContain("LoginRequest:");
	});
});
