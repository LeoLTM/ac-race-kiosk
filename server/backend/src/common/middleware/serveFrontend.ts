import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Router } from "express";
import { FRONTEND_DIST_DIR } from "@/paths";

// Serves the built frontend from the same origin as the API. Page routes (/admin, /dashboard, ...) only exist in the
// client-side router, so browser requests for anything outside /api get index.html.
// Without a frontend build (dev, where Vite serves the pages) this does nothing.
export function serveFrontend(distDir = FRONTEND_DIST_DIR): Router {
	const router = express.Router();
	const indexHtml = path.join(distDir, "index.html");
	if (!existsSync(indexHtml)) return router;

	router.use(express.static(distDir, { index: false }));
	router.get("/{*path}", (req, res, next) => {
		if (req.path.startsWith("/api/") || !req.accepts("html")) return next();
		res.sendFile(indexHtml);
	});

	return router;
}
