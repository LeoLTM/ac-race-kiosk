import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			exclude: ["**/node_modules/**", "src/index.ts", "src/generated/**", "*.config.*"],
		},
		globals: true,
		restoreMocks: true,
		// Tests share one SQLite file (migrated in globalSetup), so test files must not run in parallel
		globalSetup: ["./src/test/globalSetup.ts"],
		fileParallelism: false,
		env: {
			DATABASE_URL: "file:./prisma/test.db",
			NUMBER_OF_RIGS: "2",
			SESSION_DURATION_MIN: "10",
			CALL_TIMEOUT_SEC: "120",
			SKIP_REQUEUE_POSITIONS: "3",
			// Long enough that rigs stay online while tests jump the clock forward by minutes
			RIG_OFFLINE_AFTER_SEC: "3600",
			KIOSK_KEY: "test-key",
		},
	},
	plugins: [tsconfigPaths()],
});
