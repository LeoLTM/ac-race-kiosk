import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import pino from "pino";
import pinoHttp from "pino-http";

import { env } from "@/common/utils/envConfig";
import { isPackaged } from "@/paths";

const logger = pino({
	level: env.isProduction ? "info" : "debug",
	// pino-pretty is a dev dependency, so the packaged executable never has it
	transport: env.isProduction || isPackaged ? undefined : { target: "pino-pretty" },
});

const getLogLevel = (status: number) => {
	if (status >= StatusCodes.INTERNAL_SERVER_ERROR) return "error";
	if (status >= StatusCodes.BAD_REQUEST) return "warn";
	return "info";
};

const addRequestId = (req: Request, res: Response, next: NextFunction) => {
	const existingId = req.headers["x-request-id"] as string;
	const requestId = existingId || randomUUID();

	// Set for downstream use
	req.headers["x-request-id"] = requestId;
	res.setHeader("X-Request-Id", requestId);

	next();
};

const httpLogger = pinoHttp({
	logger,
	genReqId: (req) => req.headers["x-request-id"] as string,
	customLogLevel: (req, res) => {
		// Every rig app sends a heartbeat each second; only log the failing ones
		if (req.url?.endsWith("/heartbeat") && res.statusCode < StatusCodes.BAD_REQUEST) return "silent";
		return getLogLevel(res.statusCode);
	},
	customSuccessMessage: (req) => `${req.method} ${req.url} completed`,
	customErrorMessage: (_req, res) => `Request failed with status code: ${res.statusCode}`,
	// Only log response bodies in development
	serializers: {
		req: (req) => ({
			method: req.method,
			url: req.url,
			id: req.id,
		}),
	},
});

const captureResponseBody = (_req: Request, res: Response, next: NextFunction) => {
	if (!env.isProduction) {
		const originalSend = res.send;
		res.send = function (body) {
			res.locals.responseBody = body;
			return originalSend.call(this, body);
		};
	}
	next();
};

export default [addRequestId, captureResponseBody, httpLogger];
