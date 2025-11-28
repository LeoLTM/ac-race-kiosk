import type { Request, RequestHandler, Response } from "express";
import { queueService } from "./queueService";
import { handleServiceResponse } from "@/common/utils/httpHandlers";

class QueueController {
	public joinQueue: RequestHandler = async (req: Request, res: Response) => {
		const { playerName } = req.body;
		const serviceResponse = queueService.joinQueue(playerName);
		return handleServiceResponse(serviceResponse, res);
	};

	public getNextPlayer: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const serviceResponse = queueService.getNextPlayer(rigId);
		return handleServiceResponse(serviceResponse, res);
	};

	public completeSession: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const serviceResponse = queueService.completeSession(rigId);
		return handleServiceResponse(serviceResponse, res);
	};

	public skipPlayer: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const serviceResponse = queueService.skipPlayer(rigId);
		return handleServiceResponse(serviceResponse, res);
	};

	public updateRigState: RequestHandler = async (req: Request, res: Response) => {
		const rigId = Number(req.params.rigId);
		const { state, playerId } = req.body;
		const serviceResponse = queueService.updateRigState(rigId, state, playerId);
		return handleServiceResponse(serviceResponse, res);
	};

	public getDashboard: RequestHandler = async (_req: Request, res: Response) => {
		const serviceResponse = queueService.getDashboard();
		return handleServiceResponse(serviceResponse, res);
	};
}

export const queueController = new QueueController();
