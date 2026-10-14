import { PrismaLibSql } from "@prisma/adapter-libsql";
import { env } from "@/common/utils/envConfig";
import { PrismaClient } from "@/generated/prisma";

// Create adapter with database URL from environment
const adapter = new PrismaLibSql({ url: env.DATABASE_URL });

// Prevent multiple instances of Prisma Client in development due to hot-reloading
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		adapter,
	});

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

// SQLite's default rollback journal costs ~100ms per write on Windows; with several rigs heartbeating every
// second that saturates the serialized queue transitions. WAL + synchronous=NORMAL brings writes down to a few ms.
export async function configureDatabase(): Promise<void> {
	await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
	await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
}
