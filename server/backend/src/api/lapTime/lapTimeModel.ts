import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Schema for the LapTime entity stored in the database
export const LapTimeSchema = z.object({
	id: z.number().int().positive().openapi({ example: 1 }),
	nickName: z.string().min(1).max(100).openapi({ example: "SpeedRacer42" }),
	bestLapTimeMs: z.number().int().positive().openapi({ example: 47256 }),
	formattedTime: z.string().openapi({ example: "00:47.256" }),
	createdAt: z.date().openapi({ example: "2025-12-01T21:49:26.000Z" }),
	updatedAt: z.date().openapi({ example: "2025-12-01T21:49:26.000Z" }),
});

export type LapTime = z.infer<typeof LapTimeSchema>;

// Schema for POST request body validation
export const SubmitLapTimeSchema = z.object({
	body: z.object({
		nickName: z.string().min(1).max(100).openapi({ example: "SpeedRacer42" }),
		bestLapTimeMs: z.number().int().positive().openapi({ example: 47256 }),
		formattedTime: z.string().openapi({ example: "00:47.256" }),
	}),
});

export type SubmitLapTimeRequest = z.infer<typeof SubmitLapTimeSchema>["body"];

// Schema for the response when submitting a lap time
export const SubmitLapTimeResponseSchema = z.object({
	lapTime: LapTimeSchema,
	wasUpdated: z.boolean().openapi({ example: true, description: "Whether the lap time was updated (true) or unchanged (false)" }),
});

export type SubmitLapTimeResponse = z.infer<typeof SubmitLapTimeResponseSchema>;

// Schema for GET all lap times response
export const GetAllLapTimesResponseSchema = z.array(LapTimeSchema);

export type GetAllLapTimesResponse = z.infer<typeof GetAllLapTimesResponseSchema>;
