import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Router } from "express";
import { z } from "zod";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { requireKioskKey } from "@/common/middleware/requireKioskKey";
import { validateRequest } from "@/common/utils/httpHandlers";
import { adminController } from "./adminController";
import {
	AdminCallEntrySchema,
	AdminDeleteDriverSchema,
	AdminEndSchema,
	AdminExtendSchema,
	AdminInvalidateLapSchema,
	AdminMoveEntrySchema,
	AdminOverviewSchema,
	AdminRemoveEntrySchema,
	AdminRigSchema,
	AdminSkipSchema,
	AdminStartSchema,
} from "./adminModel";

// Staff endpoints for the /admin page. All require the X-Kiosk-Key header (when KIOSK_KEY is set).
export const adminRegistry = new OpenAPIRegistry();
export const adminRouter: Router = express.Router();

adminRouter.use(requireKioskKey);

const okResponse = createApiResponse(z.null(), "Success");

// GET /admin/overview - Rigs, queue and recent laps
adminRegistry.registerPath({
	method: "get",
	path: "/admin/overview",
	tags: ["Admin"],
	responses: createApiResponse(AdminOverviewSchema, "Rigs, queue and recent laps"),
});

adminRouter.get("/overview", adminController.getOverview);

// ---- Rigs ----

adminRegistry.registerPath({
	method: "post",
	path: "/admin/rigs/{rigId}/enable",
	tags: ["Admin"],
	request: { params: AdminRigSchema.shape.params },
	responses: okResponse,
});

adminRouter.post("/rigs/:rigId/enable", validateRequest(AdminRigSchema), adminController.enableRig);

adminRegistry.registerPath({
	method: "post",
	path: "/admin/rigs/{rigId}/disable",
	tags: ["Admin"],
	description: "Maintenance mode: no players get called to this rig",
	request: { params: AdminRigSchema.shape.params },
	responses: okResponse,
});

adminRouter.post("/rigs/:rigId/disable", validateRequest(AdminRigSchema), adminController.disableRig);

adminRegistry.registerPath({
	method: "post",
	path: "/admin/rigs/{rigId}/start",
	tags: ["Admin"],
	request: {
		params: AdminStartSchema.shape.params,
		body: { content: { "application/json": { schema: AdminStartSchema.shape.body } } },
	},
	responses: createApiResponse(z.string(), "Session started"),
});

adminRouter.post("/rigs/:rigId/start", validateRequest(AdminStartSchema), adminController.startSession);

adminRegistry.registerPath({
	method: "post",
	path: "/admin/rigs/{rigId}/end",
	tags: ["Admin"],
	request: {
		params: AdminEndSchema.shape.params,
		body: { content: { "application/json": { schema: AdminEndSchema.shape.body } } },
	},
	responses: createApiResponse(z.string(), "Session ended"),
});

adminRouter.post("/rigs/:rigId/end", validateRequest(AdminEndSchema), adminController.endSession);

adminRegistry.registerPath({
	method: "post",
	path: "/admin/rigs/{rigId}/extend",
	tags: ["Admin"],
	request: {
		params: AdminExtendSchema.shape.params,
		body: { content: { "application/json": { schema: AdminExtendSchema.shape.body } } },
	},
	responses: createApiResponse(z.number(), "New session end (epoch ms)"),
});

adminRouter.post("/rigs/:rigId/extend", validateRequest(AdminExtendSchema), adminController.extendSession);

adminRegistry.registerPath({
	method: "post",
	path: "/admin/rigs/{rigId}/skip",
	tags: ["Admin"],
	request: {
		params: AdminSkipSchema.shape.params,
		body: { content: { "application/json": { schema: AdminSkipSchema.shape.body } } },
	},
	responses: createApiResponse(z.enum(["REQUEUED", "DROPPED"]), "Player skipped"),
});

adminRouter.post("/rigs/:rigId/skip", validateRequest(AdminSkipSchema), adminController.skipCall);

// ---- Queue ----

adminRegistry.registerPath({
	method: "post",
	path: "/admin/queue/{entryId}/move",
	tags: ["Admin"],
	request: {
		params: AdminMoveEntrySchema.shape.params,
		body: { content: { "application/json": { schema: AdminMoveEntrySchema.shape.body } } },
	},
	responses: okResponse,
});

adminRouter.post("/queue/:entryId/move", validateRequest(AdminMoveEntrySchema), adminController.moveEntry);

adminRegistry.registerPath({
	method: "post",
	path: "/admin/queue/{entryId}/call",
	tags: ["Admin"],
	description: "Call a waiting player to a specific free rig",
	request: {
		params: AdminCallEntrySchema.shape.params,
		body: { content: { "application/json": { schema: AdminCallEntrySchema.shape.body } } },
	},
	responses: okResponse,
});

adminRouter.post("/queue/:entryId/call", validateRequest(AdminCallEntrySchema), adminController.callEntry);

adminRegistry.registerPath({
	method: "delete",
	path: "/admin/queue/{entryId}",
	tags: ["Admin"],
	request: { params: AdminRemoveEntrySchema.shape.params },
	responses: okResponse,
});

adminRouter.delete("/queue/:entryId", validateRequest(AdminRemoveEntrySchema), adminController.removeEntry);

// ---- Moderation ----

adminRegistry.registerPath({
	method: "post",
	path: "/admin/laps/{lapId}/invalidate",
	tags: ["Admin"],
	request: { params: AdminInvalidateLapSchema.shape.params },
	responses: okResponse,
});

adminRouter.post("/laps/:lapId/invalidate", validateRequest(AdminInvalidateLapSchema), adminController.invalidateLap);

adminRegistry.registerPath({
	method: "delete",
	path: "/admin/drivers/{driverId}",
	tags: ["Admin"],
	description: "Removes a driver together with all their laps (e.g. inappropriate names)",
	request: { params: AdminDeleteDriverSchema.shape.params },
	responses: okResponse,
});

adminRouter.delete("/drivers/:driverId", validateRequest(AdminDeleteDriverSchema), adminController.deleteDriver);
