import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const TEST_DATABASE_URL = "file:./prisma/test.db";

// Recreates the test database from the migrations before the test run
export default function setup() {
	rmSync("prisma/test.db", { force: true });
	execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
		env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
		stdio: "ignore",
	});
}
