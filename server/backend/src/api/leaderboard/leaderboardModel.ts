import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import type * as Api from "@racekiosk/shared";
import { z } from "zod";

extendZodWithOpenApi(z);

// Leaderboards are kept per track layout + car, since lap times across combos aren't comparable
export const ComboSchema = z.object({
	track: z.string().openapi({ example: "ks_brands_hatch" }),
	trackConfig: z.string().openapi({ example: "indy" }),
	car: z.string().openapi({ example: "ks_mercedes_amg_gt3" }),
}) satisfies z.ZodType<Api.Combo>;
export type Combo = z.infer<typeof ComboSchema>;

export const LeaderboardPeriodSchema = z.enum(["today", "all"]) satisfies z.ZodType<Api.LeaderboardPeriod>;
export type LeaderboardPeriod = z.infer<typeof LeaderboardPeriodSchema>;

export const LeaderboardEntrySchema = z.object({
	rank: z.number().int().positive(),
	driverId: z.string(),
	driverName: z.string().openapi({ example: "SpeedRacer42" }),
	lapTimeMs: z.number().int().positive().openapi({ example: 47256 }),
	completedAt: z.number().int(),
	rigId: z.number().int(),
	lapId: z.string(),
}) satisfies z.ZodType<Api.LeaderboardEntry>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const LeaderboardViewSchema = z.object({
	combo: ComboSchema.nullable(),
	period: LeaderboardPeriodSchema,
	entries: z.array(LeaderboardEntrySchema),
}) satisfies z.ZodType<Api.LeaderboardResponse>;
export type LeaderboardView = z.infer<typeof LeaderboardViewSchema>;

export const ComboSummarySchema = ComboSchema.extend({
	lapCount: z.number().int(),
	lastLapAt: z.number().int(),
});

export const CombosViewSchema = z.object({
	combos: z.array(ComboSummarySchema),
	current: ComboSchema.nullable().openapi({ description: "Combo loaded on the online rigs (or of the latest lap)" }),
}) satisfies z.ZodType<Api.CombosResponse>;
export type CombosView = z.infer<typeof CombosViewSchema>;

export const GetLeaderboardSchema = z.object({
	query: z.object({
		track: z.string().max(100).optional(),
		trackConfig: z.string().max(100).optional(),
		car: z.string().max(100).optional(),
		period: LeaderboardPeriodSchema.optional(),
	}),
});
