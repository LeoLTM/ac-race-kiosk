import type { Request, RequestHandler, Response } from "express";
import { handleServiceResponse } from "@/common/utils/httpHandlers";
import type { LeaderboardPeriod } from "./leaderboardModel";
import { leaderboardService } from "./leaderboardService";

class LeaderboardController {
	public getLeaderboard: RequestHandler = async (req: Request, res: Response) => {
		const { track, trackConfig, car, period } = req.query as Record<string, string | undefined>;
		const serviceResponse = await leaderboardService.getLeaderboard({
			track,
			trackConfig,
			car,
			period: period as LeaderboardPeriod | undefined,
		});
		return handleServiceResponse(serviceResponse, res);
	};

	public getCombos: RequestHandler = async (_req: Request, res: Response) => {
		const serviceResponse = await leaderboardService.getCombos();
		return handleServiceResponse(serviceResponse, res);
	};
}

export const leaderboardController = new LeaderboardController();
