import { StatusCodes } from "http-status-codes";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ServiceResponse } from "@/common/models/serviceResponse";
import { app } from "@/server";
import type { DashboardResponse, JoinQueueResponse, NextPlayerResponse } from "../queueTypes";
import { RigState } from "../queueTypes";
import { queueRepository } from "../queueRepository";

const TEST_RIG_COUNT = 2;

describe("Queue API", () => {
	beforeAll(() => {
		// Reset repository
		queueRepository["rigs"].clear();
		queueRepository["players"].clear();
		queueRepository["initializeRigs"](TEST_RIG_COUNT);
	});

	beforeEach(() => {
		// Reset before each test
		queueRepository["rigs"].clear();
		queueRepository["players"].clear();
		queueRepository["initializeRigs"](TEST_RIG_COUNT);
	});

	describe("POST /queue", () => {
		it("should join queue successfully", async () => {
			const response = await request(app).post("/queue").send({ playerName: "John Doe" });

			expect(response.status).toBe(StatusCodes.OK);
			const body = response.body as ServiceResponse<JoinQueueResponse>;
			expect(body.success).toBe(true);
			expect(body.responseObject.rigId).toBeDefined();
			expect(body.responseObject.playerId).toBeDefined();
			expect(body.responseObject.queuePosition).toBe(1);
		});

		it("should validate playerName", async () => {
			const response = await request(app).post("/queue").send({ playerName: "" });

			expect(response.status).toBe(StatusCodes.BAD_REQUEST);
		});
	});

	describe("GET /queue/next/:rigId", () => {
		it("should return next player in queue", async () => {
			// Add a player first
			const joinResponse = await request(app).post("/queue").send({ playerName: "John Doe" });
			const joinBody = joinResponse.body as ServiceResponse<JoinQueueResponse>;

			const response = await request(app).get(`/queue/next/${joinBody.responseObject.rigId}`);

			expect(response.status).toBe(StatusCodes.OK);
			const body = response.body as ServiceResponse<NextPlayerResponse>;
			expect(body.success).toBe(true);
			expect(body.responseObject.player?.name).toBe("John Doe");
		});

		it("should return null when queue is empty", async () => {
			const response = await request(app).get("/queue/next/1");

			expect(response.status).toBe(StatusCodes.OK);
			const body = response.body as ServiceResponse<NextPlayerResponse>;
			expect(body.responseObject.player).toBeNull();
		});
	});

	describe("POST /rigs/:rigId/state", () => {
		it("should update rig state to RACING", async () => {
			// Add a player first
			const joinResponse = await request(app).post("/queue").send({ playerName: "John Doe" });
			const joinBody = joinResponse.body as ServiceResponse<JoinQueueResponse>;

			const response = await request(app).post(`/rigs/${joinBody.responseObject.rigId}/state`).send({
				state: RigState.RACING,
				playerId: joinBody.responseObject.playerId,
			});

			expect(response.status).toBe(StatusCodes.OK);
			expect(response.body.responseObject.rig.state).toBe(RigState.RACING);
		});

		it("should update rig state to FREE", async () => {
			const response = await request(app).post("/rigs/1/state").send({
				state: RigState.FREE,
			});

			expect(response.status).toBe(StatusCodes.OK);
			expect(response.body.responseObject.rig.state).toBe(RigState.FREE);
		});
	});

	describe("POST /queue/complete/:rigId", () => {
		it("should complete session successfully", async () => {
			// Setup: Add player and start session
			const joinResponse = await request(app).post("/queue").send({ playerName: "John Doe" });
			const joinBody = joinResponse.body as ServiceResponse<JoinQueueResponse>;

			await request(app).post(`/rigs/${joinBody.responseObject.rigId}/state`).send({
				state: RigState.RACING,
				playerId: joinBody.responseObject.playerId,
			});

			// Complete session
			const response = await request(app).post(`/queue/complete/${joinBody.responseObject.rigId}`);

			expect(response.status).toBe(StatusCodes.OK);
			expect(response.body.responseObject.rig.state).toBe(RigState.FREE);
			expect(response.body.responseObject.rig.currentPlayer).toBeNull();
		});
	});

	describe("GET /dashboard", () => {
		it("should return all rig states", async () => {
			const response = await request(app).get("/dashboard");

			expect(response.status).toBe(StatusCodes.OK);
			const body = response.body as ServiceResponse<DashboardResponse>;
			expect(body.success).toBe(true);
			expect(body.responseObject.rigs).toHaveLength(TEST_RIG_COUNT);
		});

		it("should show players in queues", async () => {
			await request(app).post("/queue").send({ playerName: "Player 1" });
			await request(app).post("/queue").send({ playerName: "Player 2" });

			const response = await request(app).get("/dashboard");
			const body = response.body as ServiceResponse<DashboardResponse>;

			const totalPlayers = body.responseObject.rigs.reduce(
				(sum, rig) => sum + rig.queue.length,
				0,
			);
			expect(totalPlayers).toBe(2);
		});
	});
});
