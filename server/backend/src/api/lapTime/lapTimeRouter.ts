import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Router } from "express";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { validateRequest } from "@/common/utils/httpHandlers";
import { lapTimeController } from "./lapTimeController";
import { SubmitLapTimeSchema, SubmitLapTimeResponseSchema, GetAllLapTimesResponseSchema } from "./lapTimeModel";

export const lapTimeRegistry = new OpenAPIRegistry();
export const lapTimeRouter: Router = express.Router();

// Register OpenAPI path for GET /lap-times
lapTimeRegistry.registerPath({
	method: "get",
	path: "/lap-times",
	tags: ["Lap Times"],
	responses: createApiResponse(GetAllLapTimesResponseSchema, "All lap times retrieved, sorted by fastest first"),
});

// GET /lap-times - Get all lap times
lapTimeRouter.get("/", lapTimeController.getAllLapTimes);

// Register OpenAPI path for POST /lap-times
lapTimeRegistry.registerPath({
	method: "post",
	path: "/lap-times",
	tags: ["Lap Times"],
	request: {
		body: {
			content: {
				"application/json": {
					schema: SubmitLapTimeSchema.shape.body,
				},
			},
		},
	},
	responses: createApiResponse(SubmitLapTimeResponseSchema, "Lap time submission processed"),
});

// POST /lap-times - Submit a new lap time
lapTimeRouter.post("/", validateRequest(SubmitLapTimeSchema), lapTimeController.submitLapTime);
