import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app.tsx";

// Render React app and replace the entire content
const rootElement = document.getElementById("root");
if (rootElement) {
	// Clear the existing content
	rootElement.innerHTML = "";

	createRoot(rootElement).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}
