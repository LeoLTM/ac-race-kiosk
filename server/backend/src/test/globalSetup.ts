import { rmSync } from "node:fs";
import { migrateDatabase } from "@/common/utils/migrate";

const TEST_DATABASE_URL = "file:./prisma/test.db";

// Recreates the test database from the migrations before the test run, with the same runner the server uses on startup
export default async function setup() {
	for (const suffix of ["", "-wal", "-shm"]) rmSync(`prisma/test.db${suffix}`, { force: true });
	await migrateDatabase(TEST_DATABASE_URL);
}
