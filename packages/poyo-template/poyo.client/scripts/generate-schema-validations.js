import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
config({ path: path.resolve(__dirname, "../../.env") });

const requiredEnvVars = ["VITE_OPENAPI_URL"];
requiredEnvVars.forEach((varName) => {
	if (!process.env[varName]) {
		console.error(`❌ Missing required environment variable: ${varName}`);
		process.exit(1);
	}
});

const OPENAPI_URL = process.env.VITE_OPENAPI_URL;
const OUTPUT_FILE = path.resolve(
	process.cwd(),
	"src/schemas/validations.generated.ts",
);

try {
	// Generate Zod Schemas
	console.log(`🔧 Generating Zod Validations from ${OPENAPI_URL}...`);
	execSync(`npx openapi-zod-client "${OPENAPI_URL}" -o "${OUTPUT_FILE}"`, {
		stdio: "inherit",
	});
	console.log(`✅ Successfully generated validations at ${OUTPUT_FILE}`);
} catch (error) {
	console.error("❌ Error:", error.message);
	console.error("⚠️  Make sure the backend server is running!");
	process.exit(1);
}
