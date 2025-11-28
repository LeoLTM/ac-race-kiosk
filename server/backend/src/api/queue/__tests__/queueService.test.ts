import { StatusCodes } from "http-status-codes";
import type { ServiceResponse } from "@/common/models/serviceResponse";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DashboardResponse, JoinQueueResponse, NextPlayerResponse } from "../queueTypes";
import { RigState } from "../queueTypes";
import { queueRepository } from "../queueRepository";
import { queueService } from "../queueService";

const TEST_RIG_COUNT = 2;

describe("QueueService", () => {
	beforeEach(() => {
		// Reset repository state before each test
		queueRepository["rigs"].clear();
		queueRepository["players"].clear();
		queueRepository["initializeRigs"](TEST_RIG_COUNT);
	});

	afterEach(() => {
		// Clean up
		queueService.setSocketIO(null as any);
	});

	describe("joinQueue", () => {
		it("should add player to shortest queue", () => {
			const result = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;

			expect(result.success).toBe(true);
			expect(result.responseObject.rigId).toBe(1);
			expect(result.responseObject.queuePosition).toBe(1);
		});

		it("should balance players across rigs", () => {
			queueService.joinQueue("Player 1");
			queueService.joinQueue("Player 2");
			queueService.joinQueue("Player 3");

			const rigs = queueRepository.getAllRigs();
			const totalPlayers = rigs.reduce((sum, rig) => sum + rig.queue.length, 0);
			expect(totalPlayers).toBe(3);
		});

		it("should prevent duplicate player names in queue", () => {
			const firstResult = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;
			expect(firstResult.success).toBe(true);

			const duplicateResult = queueService.joinQueue(
				"John Doe",
			) as ServiceResponse<JoinQueueResponse>;
			expect(duplicateResult.success).toBe(false);
			expect(duplicateResult.statusCode).toBe(StatusCodes.CONFLICT);
			expect(duplicateResult.message).toBe("A player with this name is already in queue");
		});

		it("should prevent player from joining if currently racing", () => {
			const joinResult = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;
			expect(joinResult.success).toBe(true);

			// Start racing session
			queueService.updateRigState(1, RigState.RACING, joinResult.responseObject.playerId);

			// Try to join again while racing
			const duplicateResult = queueService.joinQueue(
				"John Doe",
			) as ServiceResponse<JoinQueueResponse>;
			expect(duplicateResult.success).toBe(false);
			expect(duplicateResult.statusCode).toBe(StatusCodes.CONFLICT);
			expect(duplicateResult.message).toBe("A player with this name is currently racing");
		});

		it("should allow player to join after completing their racing session", () => {
			const joinResult = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;
			queueService.updateRigState(1, RigState.RACING, joinResult.responseObject.playerId);
			queueService.completeSession(1);

			// Should be able to join again after session completed
			const secondJoin = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;
			expect(secondJoin.success).toBe(true);
		});
	});

	describe("getNextPlayer", () => {
		it("should return next player for FREE rig", () => {
			queueService.joinQueue("John Doe");
			const result = queueService.getNextPlayer(1) as ServiceResponse<NextPlayerResponse>;

			expect(result.success).toBe(true);
			expect(result.responseObject.player?.name).toBe("John Doe");
		});

		it("should return null when rig is RACING", () => {
			const player = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;
			queueService.updateRigState(1, RigState.RACING, player.responseObject.playerId);

			const result = queueService.getNextPlayer(1) as ServiceResponse<NextPlayerResponse>;
			expect(result.responseObject.player).toBeNull();
		});

		it("should return null when queue is empty", () => {
			const result = queueService.getNextPlayer(1) as ServiceResponse<NextPlayerResponse>;
			expect(result.responseObject.player).toBeNull();
		});
	});

	describe("updateRigState", () => {
		it("should transition rig to RACING state", () => {
			const joinResult = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;
			const result = queueService.updateRigState(
				1,
				RigState.RACING,
				joinResult.responseObject.playerId,
			);

			expect(result.success).toBe(true);
			expect(result.responseObject?.rig.state).toBe(RigState.RACING);
			expect(result.responseObject?.rig.currentPlayer?.name).toBe("John Doe");
			expect(result.responseObject?.rig.queue.length).toBe(0);
		});

		it("should transition rig back to FREE state", () => {
			const joinResult = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;
			queueService.updateRigState(1, RigState.RACING, joinResult.responseObject.playerId);

			const result = queueService.updateRigState(1, RigState.FREE);
			expect(result.success).toBe(true);
			expect(result.responseObject?.rig.state).toBe(RigState.FREE);
			expect(result.responseObject?.rig.currentPlayer).toBeNull();
		});

		it("should fail when starting session without playerId", () => {
			const result = queueService.updateRigState(1, RigState.RACING);
			expect(result.success).toBe(false);
			expect(result.statusCode).toBe(StatusCodes.BAD_REQUEST);
		});
	});

	describe("completeSession", () => {
		it("should remove current player and set rig to FREE", () => {
			const joinResult = queueService.joinQueue("John Doe") as ServiceResponse<JoinQueueResponse>;
			queueService.updateRigState(1, RigState.RACING, joinResult.responseObject.playerId);

			const result = queueService.completeSession(1);
			expect(result.success).toBe(true);
			expect(result.responseObject?.rig.state).toBe(RigState.FREE);
			expect(result.responseObject?.rig.currentPlayer).toBeNull();

			const player = queueRepository.getPlayer(joinResult.responseObject.playerId);
			expect(player).toBeUndefined();
		});
	});

	describe("getDashboard", () => {
		it("should return all rig states", () => {
			queueService.joinQueue("Player 1");
			queueService.joinQueue("Player 2");

			const result = queueService.getDashboard() as ServiceResponse<DashboardResponse>;
			expect(result.success).toBe(true);
			expect(result.responseObject.rigs).toHaveLength(TEST_RIG_COUNT);
		});
	});
});
