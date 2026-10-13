import type { Request, RequestHandler, Response } from "express";
import { handleServiceResponse } from "@/common/utils/httpHandlers";
import { EndReason } from "./rigModel";
import { rigService } from "./rigService";

// Endpoints called by the racekiosk AC app. Every action answers with the rig's fresh status.
class RigController {
	public heartbeat: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const serviceResponse = await rigService.heartbeat(rigId, req.body);
		return handleServiceResponse(serviceResponse, res);
	};

	public startSession: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const result = await rigService.startSession(rigId, req.body.queueEntryId);
		return handleServiceResponse(await rigService.withRigStatus(rigId, result), res);
	};

	public endSession: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const result = await rigService.endSession(rigId, req.body.sessionId, EndReason.DRIVER);
		return handleServiceResponse(await rigService.withRigStatus(rigId, result), res);
	};

	public skipCall: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const result = await rigService.skipCall(rigId, req.body.queueEntryId);
		return handleServiceResponse(await rigService.withRigStatus(rigId, result), res);
	};

	public submitLap: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const serviceResponse = await rigService.submitLap(rigId, req.body);
		return handleServiceResponse(serviceResponse, res);
	};
}

export const rigController = new RigController();
