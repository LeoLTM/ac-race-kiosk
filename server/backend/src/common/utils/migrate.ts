import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { MIGRATIONS_DIR } from "@/paths";

// Same table the Prisma CLI keeps, so `prisma migrate deploy` / `migrate dev` and this runner can share a database
const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

// libsql doesn't create missing folders for a file: database
function ensureDatabaseDir(url: string) {
	if (!url.startsWith("file:")) return;
	const dir = path.dirname(url.slice("file:".length));
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Applies the pending prisma/migrations on startup, so the packaged server needs no Prisma CLI.
// Returns the names of the migrations it applied.
export async function migrateDatabase(url: string, migrationsDir = MIGRATIONS_DIR): Promise<string[]> {
	ensureDatabaseDir(url);
	const client = createClient({ url });

	try {
		await client.execute(CREATE_MIGRATIONS_TABLE);
		const { rows } = await client.execute(
			"SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations WHERE rolled_back_at IS NULL",
		);

		const failed = rows.find((row) => row.finished_at === null);
		if (failed) {
			throw new Error(
				`Migration ${failed.migration_name} failed on an earlier start. Fix the database, then mark it with ` +
					"`prisma migrate resolve` (or restore a backup) before starting the server again.",
			);
		}

		const applied = new Set(rows.map((row) => String(row.migration_name)));
		const pending = readdirSync(migrationsDir)
			.filter((name) => !applied.has(name) && existsSync(path.join(migrationsDir, name, "migration.sql")))
			.sort();

		for (const name of pending) {
			// Prisma checksums the file as committed (LF); Windows checkouts may have CRLF
			const script = readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8").replace(/\r\n/g, "\n");
			const checksum = createHash("sha256").update(script).digest("hex");
			const id = randomUUID();

			await client.execute({
				sql: "INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at) VALUES (?, ?, ?, ?)",
				args: [id, checksum, name, Date.now()],
			});

			try {
				await client.executeMultiple(script);
			} catch (error) {
				await client.execute({ sql: "UPDATE _prisma_migrations SET logs = ? WHERE id = ?", args: [String(error), id] });
				throw new Error(`Migration ${name} failed: ${error}`, { cause: error });
			}

			await client.execute({
				sql: "UPDATE _prisma_migrations SET finished_at = ?, applied_steps_count = 1 WHERE id = ?",
				args: [Date.now(), id],
			});
		}

		return pending;
	} finally {
		client.close();
	}
}
