import { vi } from "vitest";
import { rigService } from "@/api/rig/rigService";
import { clock } from "@/common/utils/clock";
import { configureDatabase, prisma } from "@/common/utils/prismaClient";

export async function resetDatabase(): Promise<void> {
	await configureDatabase();
	await prisma.lap.deleteMany();
	await prisma.session.deleteMany();
	await prisma.queueEntry.deleteMany();
	await prisma.driver.deleteMany();
	await prisma.rig.deleteMany();
	await rigService.init();
}

// Freezes clock.now() and lets a test move time forward explicitly
export function fakeClock(start = new Date("2026-01-01T12:00:00Z")) {
	let current = start.getTime();
	vi.spyOn(clock, "now").mockImplementation(() => new Date(current));

	return {
		advance(ms: number) {
			current += ms;
		},
		now: () => new Date(current),
	};
}
