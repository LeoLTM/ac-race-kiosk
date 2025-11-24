import type { z } from "zod";
import type {
	DashboardResponseSchema,
	JoinQueueResponseSchema,
	NextPlayerResponseSchema,
	PlayerSchema,
	RigSchema,
} from "./queueModel";

// Enums
export enum RigState {
	FREE = "FREE",
	RACING = "RACING",
}

// Core domain types
export type Player = z.infer<typeof PlayerSchema>;
export type Rig = z.infer<typeof RigSchema>;

// API Response types
export type JoinQueueResponse = z.infer<typeof JoinQueueResponseSchema>;
export type NextPlayerResponse = z.infer<typeof NextPlayerResponseSchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
