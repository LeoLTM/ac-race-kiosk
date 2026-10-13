import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Router } from "express";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { validateRequest } from "@/common/utils/httpHandlers";
import { leaderboardController } from "./leaderboardController";
import { CombosViewSchema, GetLeaderboardSchema, LeaderboardViewSchema } from "./leaderboardModel";

export const leaderboardRegistry = new OpenAPIRegistry();
export const leaderboardRouter: Router = express.Router();

// GET /leaderboard - Best valid lap per driver for a track/car combo (defaults to the combo on the rigs)
leaderboardRegistry.registerPath({
	method: "get",
	path: "/leaderboard",
	tags: ["Leaderboard"],
	request: { query: GetLeaderboardSchema.shape.query },
	responses: createApiResponse(LeaderboardViewSchema, "Leaderboard retrieved"),
});

leaderboardRouter.get("/", validateRequest(GetLeaderboardSchema), leaderboardController.getLeaderboard);

// GET /leaderboard/combos - Track/car combos that have valid laps
leaderboardRegistry.registerPath({
	method: "get",
	path: "/leaderboard/combos",
	tags: ["Leaderboard"],
	responses: createApiResponse(CombosViewSchema, "Combos retrieved"),
});

leaderboardRouter.get("/combos", leaderboardController.getCombos);
