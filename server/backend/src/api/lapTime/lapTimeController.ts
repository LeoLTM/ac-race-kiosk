import type { Request, RequestHandler, Response } from "express";
import { lapTimeService } from "./lapTimeService";
import { handleServiceResponse } from "@/common/utils/httpHandlers";

class LapTimeController {
	public getAllLapTimes: RequestHandler = async (_req: Request, res: Response) => {
		const serviceResponse = await lapTimeService.getAllLapTimes();
		return handleServiceResponse(serviceResponse, res);
	};

	public submitLapTime: RequestHandler = async (req: Request, res: Response) => {
		const { nickName, bestLapTimeMs, formattedTime } = req.body;
		const serviceResponse = await lapTimeService.submitLapTime({
			nickName,
			bestLapTimeMs,
			formattedTime,
		});
		return handleServiceResponse(serviceResponse, res);
	};
}

export const lapTimeController = new LapTimeController();
