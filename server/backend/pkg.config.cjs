// yao-pkg config for `bun run package`: one executable with Node, the server bundle and these files inside.
// pkg follows the bundle's require() calls on its own; listed here is what it can't see. Paths are relative to this file.
module.exports = {
	assets: [
		// Applied on startup (src/common/utils/migrate.ts)
		"prisma/migrations/**/*",
		// Served by the backend (src/common/middleware/serveFrontend.ts); build the frontend first
		"../frontend/dist/**/*",
		// Swagger UI's static files, served from the package folder
		"../node_modules/swagger-ui-dist/{swagger-ui.css,swagger-ui-bundle.js,swagger-ui-standalone-preset.js,favicon-*.png}",
		// libsql loads its native addon via a computed require("@libsql/<platform>"). Only the build host's platform
		// package is installed, so each OS builds its own executable. pkg extracts the addon to a cache folder on first start.
		"../node_modules/@libsql/*/{index.node,package.json}",
	],
};
