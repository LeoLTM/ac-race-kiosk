import type { RequestHandler } from "express";
import { StatusCodes } from "http-status-codes";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { env } from "@/common/utils/envConfig";
import { handleServiceResponse } from "@/common/utils/httpHandlers";

export const KIOSK_KEY_HEADER = "x-kiosk-key";

// Guards the rig app and staff endpoints with the shared KIOSK_KEY (no check when KIOSK_KEY is empty)
export const requireKioskKey: RequestHandler = (req, res, next) => {
	if (!env.KIOSK_KEY || req.get(KIOSK_KEY_HEADER) === env.KIOSK_KEY) {
		return next();
	}

	const serviceResponse = ServiceResponse.failure("Invalid or missing kiosk key", null, StatusCodes.UNAUTHORIZED);
	return handleServiceResponse(serviceResponse, res);
};
