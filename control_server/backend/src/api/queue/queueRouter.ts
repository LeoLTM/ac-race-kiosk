import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Router } from "express";
import { z } from "zod";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { validateRequest } from "@/common/utils/httpHandlers";
import { queueController } from "./queueController";
import {
	CompleteSessionSchema,
	DashboardResponseSchema,
	GetNextPlayerSchema,
	JoinQueueResponseSchema,
	JoinQueueSchema,
	NextPlayerResponseSchema,
	RigSchema,
	SkipPlayerSchema,
	UpdateRigStateSchema,
} from "./queueModel";

export const queueRegistry = new OpenAPIRegistry();
export const queueRouter: Router = express.Router();

// Register schemas
queueRegistry.register("Rig", RigSchema);

// POST /queue - Join queue
queueRegistry.registerPath({
	method: "post",
	path: "/queue",
	tags: ["Queue"],
	request: {
		body: {
			content: {
				"application/json": {
					schema: JoinQueueSchema.shape.body,
				},
			},
		},
	},
	responses: createApiResponse(JoinQueueResponseSchema, "Player joined queue successfully"),
});

queueRouter.post("/", validateRequest(JoinQueueSchema), queueController.joinQueue);

// GET /queue/next/:rigId - Get next player for rig
queueRegistry.registerPath({
	method: "get",
	path: "/queue/next/{rigId}",
	tags: ["Queue"],
	request: {
		params: GetNextPlayerSchema.shape.params,
	},
	responses: createApiResponse(NextPlayerResponseSchema, "Next player retrieved"),
});

queueRouter.get("/next/:rigId", validateRequest(GetNextPlayerSchema), queueController.getNextPlayer);

// POST /queue/complete/:rigId - Complete session
queueRegistry.registerPath({
	method: "post",
	path: "/queue/complete/{rigId}",
	tags: ["Queue"],
	request: {
		params: CompleteSessionSchema.shape.params,
	},
	responses: createApiResponse(RigSchema, "Session completed successfully"),
});

queueRouter.post(
	"/complete/:rigId",
	validateRequest(CompleteSessionSchema),
	queueController.completeSession,
);

// POST /queue/skip/:rigId - Skip current player in queue
queueRegistry.registerPath({
	method: "post",
	path: "/queue/skip/{rigId}",
	tags: ["Queue"],
	request: {
		params: SkipPlayerSchema.shape.params,
	},
	responses: createApiResponse(RigSchema, "Player skipped successfully"),
});

queueRouter.post(
	"/skip/:rigId",
	validateRequest(SkipPlayerSchema),
	queueController.skipPlayer,
);

// POST /rigs/:rigId/state - Update rig state
queueRegistry.registerPath({
	method: "post",
	path: "/rigs/{rigId}/state",
	tags: ["Queue"],
	request: {
		params: UpdateRigStateSchema.shape.params,
		body: {
			content: {
				"application/json": {
					schema: UpdateRigStateSchema.shape.body,
				},
			},
		},
	},
	responses: createApiResponse(RigSchema, "Rig state updated successfully"),
});

queueRouter.post(
	"/:rigId/state",
	validateRequest(UpdateRigStateSchema),
	queueController.updateRigState,
);

// GET /dashboard - Get all rig states
queueRegistry.registerPath({
	method: "get",
	path: "/dashboard",
	tags: ["Queue"],
	responses: createApiResponse(DashboardResponseSchema, "Dashboard data retrieved"),
});

queueRouter.get("/", queueController.getDashboard);
