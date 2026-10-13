import { prisma } from "@/common/utils/prismaClient";
import type { Combo } from "./leaderboardModel";

export class LeaderboardRepository {
	// Valid laps for a combo, fastest first (ties: whoever set it first)
	async findValidLaps(combo: Combo, since?: Date) {
		return prisma.lap.findMany({
			where: {
				valid: true,
				track: combo.track,
				trackConfig: combo.trackConfig,
				car: combo.car,
				...(since ? { completedAt: { gte: since } } : {}),
			},
			include: { driver: true },
			orderBy: [{ lapTimeMs: "asc" }, { completedAt: "asc" }],
		});
	}

	async findDriverBestLapMs(driverId: string, combo: Combo, excludeLapId?: string): Promise<number | null> {
		const result = await prisma.lap.aggregate({
			where: {
				driverId,
				valid: true,
				track: combo.track,
				trackConfig: combo.trackConfig,
				car: combo.car,
				...(excludeLapId ? { id: { not: excludeLapId } } : {}),
			},
			_min: { lapTimeMs: true },
		});
		return result._min.lapTimeMs ?? null;
	}

	async findCombos() {
		return prisma.lap.groupBy({
			by: ["track", "trackConfig", "car"],
			where: { valid: true },
			_count: { _all: true },
			_max: { completedAt: true },
		});
	}

	async findLatestValidLap() {
		return prisma.lap.findFirst({ where: { valid: true }, orderBy: { completedAt: "desc" } });
	}
}

export const leaderboardRepository = new LeaderboardRepository();
