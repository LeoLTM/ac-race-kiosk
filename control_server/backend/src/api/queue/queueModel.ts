import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { RigState } from "./queueTypes";

extendZodWithOpenApi(z);

// Core domain models
export const PlayerSchema = z.object({
	id: z.string().openapi({ example: "player-123" }),
	name: z.string().min(1).max(50).openapi({ example: "John Doe" }),
	joinedAt: z.date().openapi({ example: new Date().toISOString() }),
});

export const RigSchema = z.object({
	id: z.number().int().positive().openapi({ example: 1 }),
	state: z.nativeEnum(RigState).openapi({ example: RigState.FREE }),
	currentPlayer: PlayerSchema.nullable().openapi({ example: null }),
	queue: z.array(PlayerSchema).openapi({ example: [] }),
});

// API Request/Response schemas
export const JoinQueueSchema = z.object({
	body: z.object({
		playerName: z.string().min(1).max(50).openapi({ example: "John Doe" }),
	}),
});

export const JoinQueueResponseSchema = z.object({
	playerId: z.string().openapi({ example: "player-123" }),
	rigId: z.number().int().positive().openapi({ example: 1 }),
	queuePosition: z.number().openapi({ example: 3 }),
});

export const GetNextPlayerSchema = z.object({
	params: z.object({
		rigId: z.coerce.number().int().positive().openapi({ example: 1 }),
	}),
});

export const NextPlayerResponseSchema = z.object({
	player: PlayerSchema.nullable().openapi({ example: null }),
});

export type NextPlayerResponse = z.infer<typeof NextPlayerResponseSchema>;

export const CompleteSessionSchema = z.object({
	params: z.object({
		rigId: z.coerce.number().int().positive().openapi({ example: 1 }),
	}),
});

export const SkipPlayerSchema = z.object({
	params: z.object({
		rigId: z.coerce.number().int().positive().openapi({ example: 1 }),
	}),
});

export const UpdateRigStateSchema = z.object({
	params: z.object({
		rigId: z.coerce.number().int().positive().openapi({ example: 1 }),
	}),
	body: z.object({
		state: z.nativeEnum(RigState).openapi({ example: RigState.RACING }),
		playerId: z.string().optional().openapi({ example: "player-123" }),
	}),
});

export const DashboardResponseSchema = z.object({
	rigs: z.array(RigSchema).openapi({ example: [] }),
});

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
