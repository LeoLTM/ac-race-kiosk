import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const TEST_DATABASE_URL = "file:./prisma/test.db";

// The workspace hoists prisma to the root node_modules, so resolve its CLI instead of assuming a path
const require = createRequire(import.meta.url);
const prismaCli = join(dirname(require.resolve("prisma/package.json")), "build/index.js");

// Recreates the test database from the migrations before the test run
export default function setup() {
	rmSync("prisma/test.db", { force: true });
	execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
		env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
		stdio: "ignore",
	});
}
