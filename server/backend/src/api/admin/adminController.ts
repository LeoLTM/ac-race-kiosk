import type { Request, RequestHandler, Response } from "express";
import { EndReason } from "@/api/rig/rigModel";
import { rigService } from "@/api/rig/rigService";
import { handleServiceResponse } from "@/common/utils/httpHandlers";

class AdminController {
	public getOverview: RequestHandler = async (_req: Request, res: Response) => {
		return handleServiceResponse(await rigService.getAdminOverview(), res);
	};

	public enableRig: RequestHandler = async (req: Request, res: Response) => {
		return handleServiceResponse(await rigService.setRigEnabled(Number(req.params.rigId), true), res);
	};

	public disableRig: RequestHandler = async (req: Request, res: Response) => {
		return handleServiceResponse(await rigService.setRigEnabled(Number(req.params.rigId), false), res);
	};

	public startSession: RequestHandler = async (req: Request, res: Response) => {
		const serviceResponse = await rigService.startSession(Number(req.params.rigId), req.body.queueEntryId);
		return handleServiceResponse(serviceResponse, res);
	};

	public endSession: RequestHandler = async (req: Request, res: Response) => {
		const serviceResponse = await rigService.endSession(Number(req.params.rigId), req.body.sessionId, EndReason.STAFF);
		return handleServiceResponse(serviceResponse, res);
	};

	public extendSession: RequestHandler = async (req: Request, res: Response) => {
		const { sessionId, seconds } = req.body;
		const serviceResponse = await rigService.extendSession(Number(req.params.rigId), sessionId, seconds);
		return handleServiceResponse(serviceResponse, res);
	};

	public skipCall: RequestHandler = async (req: Request, res: Response) => {
		const serviceResponse = await rigService.skipCall(Number(req.params.rigId), req.body.queueEntryId);
		return handleServiceResponse(serviceResponse, res);
	};

	public moveEntry: RequestHandler = async (req: Request, res: Response) => {
		const serviceResponse = await rigService.moveEntry(String(req.params.entryId), req.body.direction);
		return handleServiceResponse(serviceResponse, res);
	};

	public callEntry: RequestHandler = async (req: Request, res: Response) => {
		const serviceResponse = await rigService.callEntry(String(req.params.entryId), req.body.rigId);
		return handleServiceResponse(serviceResponse, res);
	};

	public removeEntry: RequestHandler = async (req: Request, res: Response) => {
		return handleServiceResponse(await rigService.removeEntry(String(req.params.entryId)), res);
	};

	public invalidateLap: RequestHandler = async (req: Request, res: Response) => {
		return handleServiceResponse(await rigService.invalidateLap(String(req.params.lapId)), res);
	};

	public deleteDriver: RequestHandler = async (req: Request, res: Response) => {
		return handleServiceResponse(await rigService.deleteDriver(String(req.params.driverId)), res);
	};
}

export const adminController = new AdminController();
