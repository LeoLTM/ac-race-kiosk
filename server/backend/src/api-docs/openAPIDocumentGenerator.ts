import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { adminRegistry } from "@/api/admin/adminRouter";
import { healthCheckRegistry } from "@/api/healthCheck/healthCheckRouter";
import { leaderboardRegistry } from "@/api/leaderboard/leaderboardRouter";
import { queueRegistry } from "@/api/queue/queueRouter";
import { rigRegistry } from "@/api/rig/rigRouter";
import { userRegistry } from "@/api/user/userRouter";

export type OpenAPIDocument = ReturnType<OpenApiGeneratorV3["generateDocument"]>;

export function generateOpenAPIDocument(): OpenAPIDocument {
	const registry = new OpenAPIRegistry([
		healthCheckRegistry,
		userRegistry,
		queueRegistry,
		rigRegistry,
		adminRegistry,
		leaderboardRegistry,
	]);
	const generator = new OpenApiGeneratorV3(registry.definitions);

	return generator.generateDocument({
		openapi: "3.0.0",
		info: {
			version: "1.0.0",
			title: "Assetto Corsa Race Kiosk API",
			description: "Queue-based racing session manager for Assetto Corsa across multiple racing rigs",
		},
		// Paths below are relative to the /api prefix the routers are mounted under
		servers: [{ url: "/api" }],
		externalDocs: {
			description: "View the raw OpenAPI Specification in JSON format",
			url: "/api/docs/swagger.json",
		},
	});
}
