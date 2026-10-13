import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { DashboardViewSchema, InvalidReasonSchema, RigIdParamsSchema } from "@/api/rig/rigModel";

extendZodWithOpenApi(z);

export const RecentLapViewSchema = z.object({
	id: z.string(),
	driverId: z.string(),
	driverName: z.string(),
	rigId: z.number().int(),
	lapTimeMs: z.number().int(),
	valid: z.boolean(),
	invalidReason: InvalidReasonSchema.nullable(),
	track: z.string(),
	trackConfig: z.string(),
	car: z.string(),
	completedAt: z.number().int(),
});
export type RecentLapView = z.infer<typeof RecentLapViewSchema>;

export const AdminOverviewSchema = DashboardViewSchema.extend({
	recentLaps: z.array(RecentLapViewSchema),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;

export const AdminRigSchema = z.object({ params: RigIdParamsSchema });

export const AdminStartSchema = z.object({
	params: RigIdParamsSchema,
	body: z.object({ queueEntryId: z.string().min(1) }),
});

export const AdminEndSchema = z.object({
	params: RigIdParamsSchema,
	body: z.object({ sessionId: z.string().min(1) }),
});

export const AdminExtendSchema = z.object({
	params: RigIdParamsSchema,
	body: z.object({
		sessionId: z.string().min(1),
		seconds: z.number().int().min(-3600).max(3600).openapi({ example: 120, description: "Negative values shorten" }),
	}),
});

export const AdminSkipSchema = AdminStartSchema;

const EntryIdParamsSchema = z.object({ entryId: z.string().min(1) });

export const MoveDirectionSchema = z.enum(["up", "down", "top"]);
export type MoveDirection = z.infer<typeof MoveDirectionSchema>;

export const AdminMoveEntrySchema = z.object({
	params: EntryIdParamsSchema,
	body: z.object({ direction: MoveDirectionSchema }),
});

export const AdminCallEntrySchema = z.object({
	params: EntryIdParamsSchema,
	body: z.object({ rigId: z.number().int().positive() }),
});

export const AdminRemoveEntrySchema = z.object({ params: EntryIdParamsSchema });

export const AdminInvalidateLapSchema = z.object({ params: z.object({ lapId: z.string().min(1) }) });

export const AdminDeleteDriverSchema = z.object({ params: z.object({ driverId: z.string().min(1) }) });
