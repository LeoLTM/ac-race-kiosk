import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Router } from "express";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { requireKioskKey } from "@/common/middleware/requireKioskKey";
import { validateRequest } from "@/common/utils/httpHandlers";
import { rigController } from "./rigController";
import {
	EndSessionSchema,
	HeartbeatSchema,
	LapResultSchema,
	RigStatusSchema,
	SkipCallSchema,
	StartSessionSchema,
	SubmitLapSchema,
} from "./rigModel";

// Endpoints for the racekiosk AC app. All require the X-Kiosk-Key header (when KIOSK_KEY is set).
export const rigRegistry = new OpenAPIRegistry();
export const rigRouter: Router = express.Router();

rigRegistry.register("RigStatus", RigStatusSchema);
rigRouter.use(requireKioskKey);

// POST /rigs/:rigId/heartbeat - polled every second by the AC app
rigRegistry.registerPath({
	method: "post",
	path: "/rigs/{rigId}/heartbeat",
	tags: ["Rig App"],
	description: "Marks the rig online, reports track/car and returns what the in-game app should show",
	request: {
		params: HeartbeatSchema.shape.params,
		body: { content: { "application/json": { schema: HeartbeatSchema.shape.body } } },
	},
	responses: createApiResponse(RigStatusSchema, "Rig status"),
});

rigRouter.post("/:rigId/heartbeat", validateRequest(HeartbeatSchema), rigController.heartbeat);

// POST /rigs/:rigId/session/start - the called player pressed Start
rigRegistry.registerPath({
	method: "post",
	path: "/rigs/{rigId}/session/start",
	tags: ["Rig App"],
	request: {
		params: StartSessionSchema.shape.params,
		body: { content: { "application/json": { schema: StartSessionSchema.shape.body } } },
	},
	responses: createApiResponse(RigStatusSchema, "Session started"),
});

rigRouter.post("/:rigId/session/start", validateRequest(StartSessionSchema), rigController.startSession);

// POST /rigs/:rigId/session/end - the driver ended early
rigRegistry.registerPath({
	method: "post",
	path: "/rigs/{rigId}/session/end",
	tags: ["Rig App"],
	request: {
		params: EndSessionSchema.shape.params,
		body: { content: { "application/json": { schema: EndSessionSchema.shape.body } } },
	},
	responses: createApiResponse(RigStatusSchema, "Session ended"),
});

rigRouter.post("/:rigId/session/end", validateRequest(EndSessionSchema), rigController.endSession);

// POST /rigs/:rigId/call/skip - the called player didn't show up
rigRegistry.registerPath({
	method: "post",
	path: "/rigs/{rigId}/call/skip",
	tags: ["Rig App"],
	request: {
		params: SkipCallSchema.shape.params,
		body: { content: { "application/json": { schema: SkipCallSchema.shape.body } } },
	},
	responses: createApiResponse(RigStatusSchema, "Player skipped"),
});

rigRouter.post("/:rigId/call/skip", validateRequest(SkipCallSchema), rigController.skipCall);

// POST /rigs/:rigId/laps - a completed lap (idempotent per clientLapId)
rigRegistry.registerPath({
	method: "post",
	path: "/rigs/{rigId}/laps",
	tags: ["Rig App"],
	request: {
		params: SubmitLapSchema.shape.params,
		body: { content: { "application/json": { schema: SubmitLapSchema.shape.body } } },
	},
	responses: createApiResponse(LapResultSchema, "Lap recorded"),
});

rigRouter.post("/:rigId/laps", validateRequest(SubmitLapSchema), rigController.submitLap);
