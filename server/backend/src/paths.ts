import path from "node:path";

// This file sits directly in src/, just like the bundle in dist/, so these paths resolve the same in dev (src),
// the Node build (dist) and the pkg binary (dist inside its snapshot, where these folders are packaged as assets)
const backendDir = path.resolve(__dirname, "..");

export const MIGRATIONS_DIR = path.join(backendDir, "prisma", "migrations");

export const FRONTEND_DIST_DIR = path.resolve(backendDir, "..", "frontend", "dist");

// pkg sets process.pkg inside the packaged executable
export const isPackaged = "pkg" in process;

// Where the server keeps its .env and (by default) its database: next to the executable when packaged, no matter
// which folder it was started from; the working directory otherwise (backend/ in dev and for `bun run start`)
export const APP_DIR = isPackaged ? path.dirname(process.execPath) : process.cwd();
