import { defineConfig } from "tsup";

// Node bundle of the server (dist/index.js). Dependencies stay external and load from node_modules;
// workspace packages are TypeScript sources, so they're bundled in.
export default defineConfig({
	entry: ["src/index.ts"],
	outDir: "dist",
	format: ["cjs"],
	target: "node22",
	platform: "node",
	sourcemap: true,
	clean: true,
	splitting: false,
	skipNodeModulesBundle: true,
	noExternal: [/^@racekiosk\//],
});
