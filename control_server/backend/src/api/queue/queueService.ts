import { StatusCodes } from "http-status-codes";
import type { Server as SocketIOServer } from "socket.io";
import { ServiceResponse } from "@/common/models/serviceResponse";
import type {
	DashboardResponse,
	JoinQueueResponse,
	NextPlayerResponse,
	Player,
	Rig,
} from "./queueTypes";
import { RigState } from "./queueTypes";
import { queueRepository } from "./queueRepository";

export class QueueService {
	private io: SocketIOServer | null = null;

	setSocketIO(io: SocketIOServer): void {
		this.io = io;
	}

	private emitQueueUpdate(): void {
		if (this.io) {
			const rigs = queueRepository.getAllRigs();
			this.io.emit("queue-update", { rigs });
		}
	}

	// Join queue - assigns player to shortest queue
	joinQueue(playerName: string): ServiceResponse<JoinQueueResponse | null> {
		const rig = queueRepository.getShortestQueueRig();
		if (!rig) {
			return ServiceResponse.failure("No rigs available", null, StatusCodes.SERVICE_UNAVAILABLE);
		}

		const playerId = `player-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		const player: Player = {
			id: playerId,
			name: playerName,
			joinedAt: new Date(),
		};

		queueRepository.addPlayer(player);
		rig.queue.push(player);
		queueRepository.updateRig(rig.id, rig);

		this.emitQueueUpdate();

		return ServiceResponse.success("Player joined queue", {
			playerId: player.id,
			rigId: rig.id,
			queuePosition: rig.queue.length,
		});
	}

	// Get next player for a rig (called by race interceptor)
	getNextPlayer(rigId: number): ServiceResponse<NextPlayerResponse | null> {
		const rig = queueRepository.getRigById(rigId);
		if (!rig) {
			return ServiceResponse.failure("Rig not found", null, StatusCodes.NOT_FOUND);
		}

		if (rig.state !== RigState.FREE) {
			return ServiceResponse.success("Rig is busy", { player: null });
		}

		const nextPlayer = rig.queue[0] || null;
		return ServiceResponse.success("Next player retrieved", { player: nextPlayer });
	}

	// Update rig state (FREE -> RACING or RACING -> FREE)
	updateRigState(
		rigId: number,
		state: RigState,
		playerId?: string,
	): ServiceResponse<{ rig: Rig } | null> {
		const rig = queueRepository.getRigById(rigId);
		if (!rig) {
			return ServiceResponse.failure("Rig not found", null, StatusCodes.NOT_FOUND);
		}

		if (state === RigState.RACING) {
			// Starting a session
			if (!playerId) {
				return ServiceResponse.failure(
					"Player ID required when starting session",
					null,
					StatusCodes.BAD_REQUEST,
				);
			}

			const player = queueRepository.getPlayer(playerId);
			if (!player) {
				return ServiceResponse.failure("Player not found", null, StatusCodes.NOT_FOUND);
			}

			// Remove player from queue and set as current
			rig.queue = rig.queue.filter((p) => p.id !== playerId);
			rig.currentPlayer = player;
			rig.state = RigState.RACING;
		} else {
			// Ending a session
			rig.state = RigState.FREE;
			rig.currentPlayer = null;
		}

		queueRepository.updateRig(rigId, rig);
		this.emitQueueUpdate();

		return ServiceResponse.success("Rig state updated", { rig });
	}

	// Complete session - remove current player and set rig to FREE
	completeSession(rigId: number): ServiceResponse<{ rig: Rig } | null> {
		const rig = queueRepository.getRigById(rigId);
		if (!rig) {
			return ServiceResponse.failure("Rig not found", null, StatusCodes.NOT_FOUND);
		}

		if (rig.currentPlayer) {
			queueRepository.removePlayer(rig.currentPlayer.id);
		}

		rig.currentPlayer = null;
		rig.state = RigState.FREE;
		queueRepository.updateRig(rigId, rig);

		this.emitQueueUpdate();

		return ServiceResponse.success("Session completed", { rig });
	}

	// Skip player - remove first player from queue and memory
	skipPlayer(rigId: number): ServiceResponse<{ rig: Rig } | null> {
		const rig = queueRepository.getRigById(rigId);
		if (!rig) {
			return ServiceResponse.failure("Rig not found", null, StatusCodes.NOT_FOUND);
		}

		if (rig.queue.length === 0) {
			return ServiceResponse.failure("No players in queue to skip", null, StatusCodes.BAD_REQUEST);
		}

		// Remove first player from queue
		const skippedPlayer = rig.queue.shift();
		if (skippedPlayer) {
			// Remove player from memory
			queueRepository.removePlayer(skippedPlayer.id);
		}

		queueRepository.updateRig(rigId, rig);
		this.emitQueueUpdate();

		return ServiceResponse.success("Player skipped", { rig });
	}

	// Get all rigs for dashboard
	getDashboard(): ServiceResponse<DashboardResponse> {
		const rigs = queueRepository.getAllRigs();
		return ServiceResponse.success("Dashboard data retrieved", { rigs });
	}
}

export const queueService = new QueueService();
