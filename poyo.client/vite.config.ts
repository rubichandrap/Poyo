import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	appType: "custom",
	base: "/",
	envDir: "../",
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
});
