import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	return {
		appType: "custom",
		base: "/",
		envDir: "../",
		// A development variable must not survive into a production bundle.
		// Without this, Vite's static replacement keeps the literal in the
		// dead branch, so a project's `.env` (which names the Vite dev server)
		// ships a hardcoded origin to the deployment.
		define:
			mode === "production"
				? { "import.meta.env.VITE_SERVER_URL": "undefined" }
				: undefined,
		resolve: {
			alias: {
				"~": path.resolve(__dirname, "./src"),
			},
		},
		plugins: [react(), tailwindcss()],
		build: {
			manifest: true,
			assetsDir: "generated",
			rollupOptions: {
				// No index.html: the .NET server owns every page (Razor views with
				// #react-root + the script tag), so the entry is the client module
				// itself. The emitted dist/index.html is never deployed — poyo build
				// syncs only manifest-referenced assets into wwwroot.
				input: path.resolve(__dirname, "src/main.tsx"),
				output: {
					manualChunks: (id) => {
						// Separate chunks for better caching
						// Use regex to handle both / and \ path separators
						if (id.includes("node_modules")) {
							if (id.match(/[\\/]node_modules[\\/](react|react-dom)[\\/]/)) {
								return "vendor";
							}
							return "vendor-libs";
						}
						if (id.includes("/src/pages/") || id.includes("\\src\\pages\\")) {
							return "pages";
						}
						if (
							id.includes("/src/components/") ||
							id.includes("\\src\\components\\")
						) {
							return "components";
						}
					},
				},
			},
		},
	};
});
