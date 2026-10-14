import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { APP_DIR, isPackaged } from "@/paths";

dotenv.config({ path: path.join(APP_DIR, ".env") });

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("production"),

	HOST: z.string().min(1).default("localhost"),

	PORT: z.coerce.number().int().positive().default(8080),

	CORS_ORIGIN: z.string().default("http://localhost:8080"),

	COMMON_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(1000),

	COMMON_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(1000),

	NUMBER_OF_RIGS: z.coerce.number().int().positive().default(2),

	// The packaged server keeps its database next to the executable; dev uses prisma/dev.db
	DATABASE_URL: z.string().default(isPackaged ? `file:${path.join(APP_DIR, "racekiosk.db")}` : "file:./prisma/dev.db"),

	// Length of one driving session; sessions are hard-stopped when it runs out
	SESSION_DURATION_MIN: z.coerce.number().positive().default(10),

	// How long a called player has to press "Start" on the rig before counting as a no-show
	CALL_TIMEOUT_SEC: z.coerce.number().int().positive().default(120),

	// How many places a skipped player moves back (on their second skip they are dropped); 0 drops immediately
	SKIP_REQUEUE_POSITIONS: z.coerce.number().int().nonnegative().default(3),

	// A rig counts as offline when its AC app hasn't sent a heartbeat for this long
	RIG_OFFLINE_AFTER_SEC: z.coerce.number().int().positive().default(10),

	// Shared secret for the rig apps and the staff admin page (sent as X-Kiosk-Key); empty disables the check
	KIOSK_KEY: z.string().default(""),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
	console.error("❌ Invalid environment variables:", parsedEnv.error.format());
	throw new Error("Invalid environment variables");
}

export const env = {
	...parsedEnv.data,
	isDevelopment: parsedEnv.data.NODE_ENV === "development",
	isProduction: parsedEnv.data.NODE_ENV === "production",
	isTest: parsedEnv.data.NODE_ENV === "test",
};
