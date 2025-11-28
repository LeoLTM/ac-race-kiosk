import type { Player, Rig } from "./queueTypes";
import { RigState } from "./queueTypes";
import { env } from "@/common/utils/envConfig";

export class QueueRepository {
	private rigs: Map<number, Rig> = new Map();
	private players: Map<string, Player> = new Map();

	constructor() {
		// Initialize with configured number of rigs
		this.initializeRigs(env.NUMBER_OF_RIGS);
	}

	private initializeRigs(count: number): void {
		for (let i = 1; i <= count; i++) {
			this.rigs.set(i, {
				id: i,
				state: RigState.FREE,
				currentPlayer: null,
				queue: [],
			});
		}
	}

	getAllRigs(): Rig[] {
		return Array.from(this.rigs.values());
	}

	getRigById(rigId: number): Rig | undefined {
		return this.rigs.get(rigId);
	}

	updateRig(rigId: number, rig: Rig): void {
		this.rigs.set(rigId, rig);
	}

	getPlayer(playerId: string): Player | undefined {
		return this.players.get(playerId);
	}

	addPlayer(player: Player): void {
		this.players.set(player.id, player);
	}

	removePlayer(playerId: string): void {
		this.players.delete(playerId);
	}

	// Find rig with shortest queue
	getShortestQueueRig(): Rig | undefined {
		const rigs = this.getAllRigs();
		if (rigs.length === 0) return undefined;

		return rigs.reduce((shortest, current) => {
			return current.queue.length < shortest.queue.length ? current : shortest;
		});
	}

	// Check if a player name is already in any queue
	isPlayerNameInQueue(playerName: string): boolean {
		const rigs = this.getAllRigs();
		return rigs.some((rig) => rig.queue.some((player) => player.name === playerName));
	}

	// Check if a player name is currently racing
	isPlayerNameRacing(playerName: string): boolean {
		const rigs = this.getAllRigs();
		return rigs.some((rig) => rig.currentPlayer?.name === playerName);
	}
}

export const queueRepository = new QueueRepository();
