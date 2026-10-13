import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const JoinQueueSchema = z.object({
	body: z.object({
		playerName: z.string().trim().min(1).max(50).openapi({ example: "John Doe" }),
	}),
});

export const JoinQueueResponseSchema = z.object({
	queueEntryId: z.string(),
	driverName: z.string().openapi({ example: "John Doe" }),
	position: z
		.number()
		.int()
		.openapi({ example: 3, description: "1-based position in the queue; 0 when already called" }),
	etaSec: z
		.number()
		.int()
		.nullable()
		.openapi({ example: 900, description: "Estimated wait; null when no rig is online" }),
	calledRigId: z
		.number()
		.int()
		.nullable()
		.openapi({ example: null, description: "Set when a rig was free right away" }),
});
export type JoinQueueResponse = z.infer<typeof JoinQueueResponseSchema>;
