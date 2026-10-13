import type { Request, RequestHandler, Response } from "express";
import { rigService } from "@/api/rig/rigService";
import { handleServiceResponse } from "@/common/utils/httpHandlers";

class QueueController {
	public joinQueue: RequestHandler = async (req: Request, res: Response) => {
		const { playerName } = req.body;
		const serviceResponse = await rigService.joinQueue(playerName);
		return handleServiceResponse(serviceResponse, res);
	};

	public getDashboard: RequestHandler = async (_req: Request, res: Response) => {
		const serviceResponse = await rigService.getDashboard();
		return handleServiceResponse(serviceResponse, res);
	};
}

export const queueController = new QueueController();
