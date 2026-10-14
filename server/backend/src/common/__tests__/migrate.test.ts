import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { migrateDatabase } from "@/common/utils/migrate";

describe("migrateDatabase", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), "racekiosk-migrate-"));
	});

	afterEach(() => {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// libsql only releases the file once its statements are garbage-collected, so Windows may still lock it
		}
	});

	it("creates the database and applies every migration once", async () => {
		// A folder that doesn't exist yet, like ./data/ next to a freshly unpacked binary
		const url = `file:${path.join(dir, "data", "kiosk.db")}`;

		const applied = await migrateDatabase(url);
		expect(applied.length).toBeGreaterThan(0);
		expect(applied).toEqual([...applied].sort());

		expect(await migrateDatabase(url)).toEqual([]);

		const client = createClient({ url });
		const { rows } = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Lap'");
		client.close();
		expect(rows).toHaveLength(1);
	});

	it("refuses to start after a failed migration", async () => {
		const url = `file:${path.join(dir, "kiosk.db")}`;
		const client = createClient({ url });
		await client.execute('CREATE TABLE "Placeholder" (id TEXT)'); // collides with the first migration
		client.close();

		await expect(migrateDatabase(url)).rejects.toThrow(/20251201222352_initial failed/);
		await expect(migrateDatabase(url)).rejects.toThrow(/failed on an earlier start/);
	});
});
