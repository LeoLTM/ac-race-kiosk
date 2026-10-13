import { prisma } from "@/common/utils/prismaClient";
import type { Prisma } from "@/generated/prisma";
import { QueueStatus } from "./rigModel";

const withDriver = { driver: true } as const;

export type EntryWithDriver = Prisma.QueueEntryGetPayload<{ include: typeof withDriver }>;
export type SessionWithDriver = Prisma.SessionGetPayload<{ include: typeof withDriver }>;

export interface SessionLapStats {
	lapCount: number;
	validLapCount: number;
	bestLapMs: number | null;
	lastLapMs: number | null;
}

export class RigRepository {
	// ---- Rigs ----

	async ensureRigs(count: number): Promise<void> {
		for (let id = 1; id <= count; id++) {
			await prisma.rig.upsert({ where: { id }, update: {}, create: { id } });
		}
	}

	async findRigs(maxId: number) {
		return prisma.rig.findMany({ where: { id: { lte: maxId } }, orderBy: { id: "asc" } });
	}

	async findRig(id: number) {
		return prisma.rig.findUnique({ where: { id } });
	}

	async updateRig(id: number, data: Prisma.RigUpdateInput) {
		return prisma.rig.update({ where: { id }, data });
	}

	// ---- Drivers ----

	async findDriverByNameKey(nameKey: string) {
		return prisma.driver.findUnique({ where: { nameKey } });
	}

	async upsertDriver(name: string, nameKey: string) {
		return prisma.driver.upsert({ where: { nameKey }, update: { name }, create: { name, nameKey } });
	}

	async findDriver(id: string) {
		return prisma.driver.findUnique({ where: { id } });
	}

	async deleteDriver(id: string) {
		return prisma.driver.delete({ where: { id } });
	}

	// ---- Queue entries ----

	async findEntries(statuses: string[]): Promise<EntryWithDriver[]> {
		return prisma.queueEntry.findMany({
			where: { status: { in: statuses } },
			include: withDriver,
			orderBy: { sortKey: "asc" },
		});
	}

	async findEntry(id: string): Promise<EntryWithDriver | null> {
		return prisma.queueEntry.findUnique({ where: { id }, include: withDriver });
	}

	async hasActiveEntry(driverId: string): Promise<boolean> {
		const count = await prisma.queueEntry.count({
			where: { driverId, status: { in: [QueueStatus.WAITING, QueueStatus.CALLED] } },
		});
		return count > 0;
	}

	async maxSortKey(): Promise<number> {
		const result = await prisma.queueEntry.aggregate({ _max: { sortKey: true } });
		return result._max.sortKey ?? 0;
	}

	async createEntry(driverId: string, sortKey: number) {
		return prisma.queueEntry.create({ data: { driverId, sortKey } });
	}

	async updateEntry(id: string, data: Prisma.QueueEntryUncheckedUpdateInput) {
		return prisma.queueEntry.update({ where: { id }, data });
	}

	// ---- Sessions ----

	async findActiveSessions(): Promise<SessionWithDriver[]> {
		return prisma.session.findMany({ where: { endedAt: null }, include: withDriver, orderBy: { rigId: "asc" } });
	}

	async findActiveSessionForRig(rigId: number): Promise<SessionWithDriver | null> {
		return prisma.session.findFirst({ where: { rigId, endedAt: null }, include: withDriver });
	}

	async hasActiveSession(driverId: string): Promise<boolean> {
		const count = await prisma.session.count({ where: { driverId, endedAt: null } });
		return count > 0;
	}

	async findSession(id: string): Promise<SessionWithDriver | null> {
		return prisma.session.findUnique({ where: { id }, include: withDriver });
	}

	async findLastEndedSession(rigId: number): Promise<SessionWithDriver | null> {
		return prisma.session.findFirst({
			where: { rigId, endedAt: { not: null } },
			include: withDriver,
			orderBy: { endedAt: "desc" },
		});
	}

	async createSession(data: Prisma.SessionUncheckedCreateInput) {
		return prisma.session.create({ data });
	}

	async updateSession(id: string, data: Prisma.SessionUncheckedUpdateInput) {
		return prisma.session.update({ where: { id }, data });
	}

	// ---- Laps ----

	async findLapByClientId(clientLapId: string) {
		return prisma.lap.findUnique({ where: { clientLapId } });
	}

	async findLap(id: string) {
		return prisma.lap.findUnique({ where: { id } });
	}

	async createLap(data: Prisma.LapUncheckedCreateInput) {
		return prisma.lap.create({ data });
	}

	async updateLap(id: string, data: Prisma.LapUncheckedUpdateInput) {
		return prisma.lap.update({ where: { id }, data });
	}

	async findSessionBestLap(sessionId: string) {
		return prisma.lap.findFirst({ where: { sessionId, valid: true }, orderBy: { lapTimeMs: "asc" } });
	}

	async findRecentLaps(take: number) {
		return prisma.lap.findMany({ include: withDriver, orderBy: { completedAt: "desc" }, take });
	}

	async sessionLapStats(sessionIds: string[]): Promise<Map<string, SessionLapStats>> {
		const stats = new Map<string, SessionLapStats>();
		if (sessionIds.length === 0) return stats;

		const laps = await prisma.lap.findMany({
			where: { sessionId: { in: sessionIds } },
			select: { sessionId: true, lapTimeMs: true, valid: true },
			orderBy: { completedAt: "asc" },
		});

		for (const lap of laps) {
			const s = stats.get(lap.sessionId) ?? { lapCount: 0, validLapCount: 0, bestLapMs: null, lastLapMs: null };
			s.lapCount++;
			s.lastLapMs = lap.lapTimeMs;
			if (lap.valid) {
				s.validLapCount++;
				if (s.bestLapMs === null || lap.lapTimeMs < s.bestLapMs) s.bestLapMs = lap.lapTimeMs;
			}
			stats.set(lap.sessionId, s);
		}
		return stats;
	}
}

export const rigRepository = new RigRepository();
