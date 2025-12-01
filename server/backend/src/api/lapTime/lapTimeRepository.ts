import { prisma } from "@/common/utils/prismaClient";
import type { LapTime } from "@/generated/prisma";

export class LapTimeRepository {
	async findAll(): Promise<LapTime[]> {
		return prisma.lapTime.findMany({
			orderBy: { bestLapTimeMs: "asc" },
		});
	}

	async findByNickName(nickName: string): Promise<LapTime | null> {
		return prisma.lapTime.findUnique({
			where: { nickName },
		});
	}

	async createLapTime(data: { nickName: string; bestLapTimeMs: number; formattedTime: string }): Promise<LapTime> {
		return prisma.lapTime.create({
			data,
		});
	}

	async updateLapTime(
		nickName: string,
		data: { bestLapTimeMs: number; formattedTime: string },
	): Promise<LapTime> {
		return prisma.lapTime.update({
			where: { nickName },
			data,
		});
	}
}

export const lapTimeRepository = new LapTimeRepository();
