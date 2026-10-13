import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Router } from "express";
import { DashboardViewSchema, RigViewSchema } from "@/api/rig/rigModel";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { validateRequest } from "@/common/utils/httpHandlers";
import { queueController } from "./queueController";
import { JoinQueueResponseSchema, JoinQueueSchema } from "./queueModel";

export const queueRegistry = new OpenAPIRegistry();
export const queueRouter: Router = express.Router();

queueRegistry.register("Rig", RigViewSchema);

// POST /queue - Join the shared queue
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

// GET /queue - Rigs and waiting players for the dashboard (also pushed as Socket.IO "queue-update")
queueRegistry.registerPath({
	method: "get",
	path: "/queue",
	tags: ["Queue"],
	responses: createApiResponse(DashboardViewSchema, "Dashboard data retrieved"),
});

queueRouter.get("/", queueController.getDashboard);
