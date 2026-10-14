import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import type * as Api from "@racekiosk/shared";
import { z } from "zod";

extendZodWithOpenApi(z);

// Status values (stored as strings in SQLite)
export const QueueStatusSchema = z.enum(["WAITING", "CALLED", "STARTED", "REMOVED", "NO_SHOW"]);
export const QueueStatus = QueueStatusSchema.enum;

export const RigStateSchema = z.enum(["FREE", "CALLING", "RACING"]) satisfies z.ZodType<Api.RigState>;
export const RigState = RigStateSchema.enum;
export type RigState = z.infer<typeof RigStateSchema>;

export const EndReasonSchema = z.enum(["TIME_UP", "DRIVER", "STAFF"]) satisfies z.ZodType<Api.EndReason>;
export const EndReason = EndReasonSchema.enum;
export type EndReason = z.infer<typeof EndReasonSchema>;

export const InvalidReasonSchema = z.enum([
	"CUT",
	"PIT",
	"OUT_LAP",
	"TOO_SHORT",
	"AFTER_TIME",
	"STAFF",
]) satisfies z.ZodType<Api.InvalidReason>;
export const InvalidReason = InvalidReasonSchema.enum;

// ---------------------------------------------------------------------------
// Views. All timestamps are epoch milliseconds (easier to handle in AC's Python 3.3 than ISO strings).
// ---------------------------------------------------------------------------

const epochMs = z.number().int().openapi({ example: 1767225600000 });

export const SessionViewSchema = z.object({
	id: z.string(),
	driverId: z.string(),
	driverName: z.string().openapi({ example: "Max" }),
	startedAt: epochMs,
	endsAt: epochMs,
	lapCount: z.number().int(),
	validLapCount: z.number().int(),
	bestLapMs: z.number().int().nullable(),
	lastLapMs: z.number().int().nullable(),
}) satisfies z.ZodType<Api.Session>;

export const CallViewSchema = z.object({
	queueEntryId: z.string(),
	driverName: z.string().openapi({ example: "Max" }),
	calledAt: epochMs,
	timeoutAt: epochMs,
}) satisfies z.ZodType<Api.Call>;

export const RigViewSchema = z.object({
	id: z.number().int().positive().openapi({ example: 1 }),
	enabled: z.boolean(),
	online: z.boolean(),
	lastSeenAt: epochMs.nullable(),
	appVersion: z.string().nullable(),
	track: z.string().nullable().openapi({ example: "ks_brands_hatch" }),
	trackConfig: z.string().nullable().openapi({ example: "indy" }),
	car: z.string().nullable().openapi({ example: "ks_mercedes_amg_gt3" }),
	state: RigStateSchema,
	session: SessionViewSchema.nullable(),
	called: CallViewSchema.nullable(),
}) satisfies z.ZodType<Api.Rig>;
export type RigView = z.infer<typeof RigViewSchema>;

export const QueueEntryViewSchema = z.object({
	id: z.string(),
	driverName: z.string().openapi({ example: "Max" }),
	position: z.number().int().positive(),
	skipCount: z.number().int(),
	joinedAt: epochMs,
	etaSec: z.number().int().nullable().openapi({ description: "Estimated wait; null when no rig is online" }),
}) satisfies z.ZodType<Api.QueueEntry>;
export type QueueEntryView = z.infer<typeof QueueEntryViewSchema>;

export const KioskConfigViewSchema = z.object({
	sessionDurationSec: z.number().int(),
	callTimeoutSec: z.number().int(),
}) satisfies z.ZodType<Api.KioskConfig>;

export const DashboardViewSchema = z.object({
	serverTime: epochMs,
	rigs: z.array(RigViewSchema),
	queue: z.array(QueueEntryViewSchema),
	config: KioskConfigViewSchema,
}) satisfies z.ZodType<Api.DashboardResponse>;
export type DashboardView = z.infer<typeof DashboardViewSchema>;

export const LastSessionViewSchema = z.object({
	id: z.string(),
	driverName: z.string(),
	endedAt: epochMs,
	endReason: EndReasonSchema,
	lapCount: z.number().int(),
	bestLapMs: z.number().int().nullable(),
	rankToday: z.number().int().nullable(),
});

// What the AC app polls: its own rig plus what it needs for the handover screens
export const RigStatusSchema = RigViewSchema.extend({
	serverTime: epochMs,
	lastSession: LastSessionViewSchema.nullable(),
	queueLength: z.number().int(),
	nextDriverName: z.string().nullable(),
	config: KioskConfigViewSchema,
});
export type RigStatus = z.infer<typeof RigStatusSchema>;

export const LapResultSchema = z.object({
	lapId: z.string(),
	valid: z.boolean(),
	invalidReason: InvalidReasonSchema.nullable(),
	isPersonalBest: z.boolean(),
	bestLapMs: z.number().int().nullable().openapi({ description: "Driver's all-time best for this track/car" }),
	rankToday: z.number().int().nullable(),
	rankAllTime: z.number().int().nullable(),
});
export type LapResult = z.infer<typeof LapResultSchema>;

// ---------------------------------------------------------------------------
// Requests from the AC app
// ---------------------------------------------------------------------------

export const RigIdParamsSchema = z.object({
	rigId: z.coerce.number().int().positive().openapi({ example: 1 }),
});

export const HeartbeatSchema = z.object({
	params: RigIdParamsSchema,
	body: z.object({
		appVersion: z.string().max(32).optional().openapi({ example: "1.0.0" }),
		track: z.string().max(100).optional().openapi({ example: "ks_brands_hatch" }),
		trackConfig: z.string().max(100).optional().openapi({ example: "indy" }),
		car: z.string().max(100).optional().openapi({ example: "ks_mercedes_amg_gt3" }),
	}),
});
export type HeartbeatBody = z.infer<typeof HeartbeatSchema>["body"];

export const StartSessionSchema = z.object({
	params: RigIdParamsSchema,
	body: z.object({ queueEntryId: z.string().min(1) }),
});

export const EndSessionSchema = z.object({
	params: RigIdParamsSchema,
	body: z.object({ sessionId: z.string().min(1) }),
});

export const SkipCallSchema = z.object({
	params: RigIdParamsSchema,
	body: z.object({ queueEntryId: z.string().min(1) }),
});

export const SubmitLapSchema = z.object({
	params: RigIdParamsSchema,
	body: z.object({
		clientLapId: z.string().min(1).max(64).openapi({ example: "1-1767225600000-ab12cd" }),
		sessionId: z.string().min(1),
		lapTimeMs: z.number().int().positive().openapi({ example: 47256 }),
		valid: z.boolean(),
		invalidReason: InvalidReasonSchema.nullable().optional(),
		sectorsMs: z
			.array(z.number().int().nonnegative())
			.max(10)
			.optional()
			.openapi({ example: [15123, 16010, 16123] }),
		track: z.string().min(1).max(100),
		trackConfig: z.string().max(100).optional(),
		car: z.string().min(1).max(100),
		completedAt: epochMs,
	}),
});
export type SubmitLapBody = z.infer<typeof SubmitLapSchema>["body"];
