import { StatusCodes } from "http-status-codes";
import type { Server as SocketIOServer } from "socket.io";
import { isRigOnline } from "@/api/rig/rigPresence";
import { rigRepository } from "@/api/rig/rigRepository";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { clock } from "@/common/utils/clock";
import { env } from "@/common/utils/envConfig";
import type { Combo, CombosView, LeaderboardEntry, LeaderboardPeriod, LeaderboardView } from "./leaderboardModel";
import { leaderboardRepository } from "./leaderboardRepository";

export function startOfToday(now: Date): Date {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	return start;
}

export class LeaderboardService {
	private io: SocketIOServer | null = null;

	setSocketIO(io: SocketIOServer | null): void {
		this.io = io;
	}

	emitLeaderboardUpdate(): void {
		this.io?.emit("leaderboard-update", {});
	}

	async getLeaderboard(query: {
		track?: string;
		trackConfig?: string;
		car?: string;
		period?: LeaderboardPeriod;
	}): Promise<ServiceResponse<LeaderboardView | null>> {
		try {
			const period = query.period ?? "all";
			const combo =
				query.track && query.car
					? { track: query.track, trackConfig: query.trackConfig ?? "", car: query.car }
					: await this.currentCombo();

			const entries = combo ? await this.entries(combo, period) : [];
			return ServiceResponse.success("Leaderboard retrieved", { combo, period, entries });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return ServiceResponse.failure(`Failed to load leaderboard: ${message}`, null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	}

	async getCombos(): Promise<ServiceResponse<CombosView | null>> {
		try {
			const groups = await leaderboardRepository.findCombos();
			const combos = groups
				.map((g) => ({
					track: g.track,
					trackConfig: g.trackConfig,
					car: g.car,
					lapCount: g._count._all,
					lastLapAt: g._max.completedAt?.getTime() ?? 0,
				}))
				.sort((a, b) => b.lastLapAt - a.lastLapAt);

			return ServiceResponse.success("Combos retrieved", { combos, current: await this.currentCombo() });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return ServiceResponse.failure(`Failed to load combos: ${message}`, null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	}

	// Best valid lap per driver for a combo, ranked
	async entries(combo: Combo, period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
		const since = period === "today" ? startOfToday(clock.now()) : undefined;
		const laps = await leaderboardRepository.findValidLaps(combo, since);

		const seen = new Set<string>();
		const entries: LeaderboardEntry[] = [];
		for (const lap of laps) {
			if (seen.has(lap.driverId)) continue;
			seen.add(lap.driverId);
			entries.push({
				rank: entries.length + 1,
				driverId: lap.driverId,
				driverName: lap.driver.name,
				lapTimeMs: lap.lapTimeMs,
				completedAt: lap.completedAt.getTime(),
				rigId: lap.rigId,
				lapId: lap.id,
			});
		}
		return entries;
	}

	async rankFor(driverId: string, combo: Combo, period: LeaderboardPeriod): Promise<number | null> {
		const entries = await this.entries(combo, period);
		return entries.find((e) => e.driverId === driverId)?.rank ?? null;
	}

	async driverBestLapMs(driverId: string, combo: Combo, excludeLapId?: string): Promise<number | null> {
		return leaderboardRepository.findDriverBestLapMs(driverId, combo, excludeLapId);
	}

	// The combo most online rigs are running; falls back to the combo of the latest valid lap
	async currentCombo(): Promise<Combo | null> {
		const now = clock.now();
		const rigs = await rigRepository.findRigs(env.NUMBER_OF_RIGS);
		const counts = new Map<string, { combo: Combo; count: number }>();

		for (const rig of rigs) {
			if (!isRigOnline(rig, now) || !rig.track || !rig.car) continue;
			const combo = { track: rig.track, trackConfig: rig.trackConfig ?? "", car: rig.car };
			const key = JSON.stringify(combo);
			const existing = counts.get(key);
			counts.set(key, { combo, count: (existing?.count ?? 0) + 1 });
		}

		const mostCommon = [...counts.values()].sort((a, b) => b.count - a.count)[0];
		if (mostCommon) return mostCommon.combo;

		const latest = await leaderboardRepository.findLatestValidLap();
		return latest ? { track: latest.track, trackConfig: latest.trackConfig, car: latest.car } : null;
	}
}

export const leaderboardService = new LeaderboardService();
