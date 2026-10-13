import { StatusCodes } from "http-status-codes";
import { pino } from "pino";
import type { Server as SocketIOServer } from "socket.io";
import type { AdminOverview, MoveDirection } from "@/api/admin/adminModel";
import { leaderboardService } from "@/api/leaderboard/leaderboardService";
import type { JoinQueueResponse } from "@/api/queue/queueModel";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { clock } from "@/common/utils/clock";
import { env } from "@/common/utils/envConfig";
import { createLock } from "@/common/utils/lock";
import type { Lap } from "@/generated/prisma";
import {
	type DashboardView,
	EndReason,
	type HeartbeatBody,
	InvalidReason,
	type LapResult,
	QueueStatus,
	RigState,
	type RigStatus,
	type RigView,
	type SubmitLapBody,
} from "./rigModel";
import { isRigOnline } from "./rigPresence";
import { type EntryWithDriver, rigRepository } from "./rigRepository";

const logger = pino({ name: "rig-service" });

// Gap between sortKeys of consecutively joined players, leaves room to move entries in between
const SORT_KEY_GAP = 1000;

// Rough time between two sessions on one rig (walking over, adjusting the seat); only used for wait estimates
const HANDOVER_MS = 30_000;

export type SkipOutcome = "REQUEUED" | "DROPPED";

// Thrown inside a transition to reject it with a client error
class TransitionError extends Error {
	constructor(
		message: string,
		readonly statusCode: number = StatusCodes.CONFLICT,
	) {
		super(message);
	}
}

const sessionDurationMs = () => env.SESSION_DURATION_MIN * 60_000;
const callTimeoutMs = () => env.CALL_TIMEOUT_SEC * 1000;

const kioskConfig = () => ({
	sessionDurationSec: Math.round(env.SESSION_DURATION_MIN * 60),
	callTimeoutSec: env.CALL_TIMEOUT_SEC,
});

// A sortKey that places an entry right behind the first `n` entries of an ordered list
function sortKeyAfter(ordered: { sortKey: number }[], n: number, fallback: number): number {
	if (ordered.length === 0) return fallback;
	if (n >= ordered.length) return ordered[ordered.length - 1].sortKey + SORT_KEY_GAP;
	return (ordered[n - 1].sortKey + ordered[n].sortKey) / 2;
}

// Simulates which rig frees up next for each waiting player; null when no rig is online
function estimateWaits(rigs: RigView[], waitingCount: number, nowMs: number): (number | null)[] {
	const availableAt = rigs
		.filter((rig) => rig.enabled && rig.online)
		.map((rig) => {
			if (rig.session) return Math.max(rig.session.endsAt, nowMs) + HANDOVER_MS;
			if (rig.called) return nowMs + sessionDurationMs() + HANDOVER_MS;
			return nowMs;
		});

	if (availableAt.length === 0) return Array(waitingCount).fill(null);

	const etas: number[] = [];
	for (let i = 0; i < waitingCount; i++) {
		const next = availableAt.indexOf(Math.min(...availableAt));
		etas.push(Math.round((availableAt[next] - nowMs) / 1000));
		availableAt[next] += sessionDurationMs() + HANDOVER_MS;
	}
	return etas;
}

/**
 * Owns the shared queue, rig calls, driving sessions and lap ingest.
 *
 * Every state change runs through `transition()`, which serializes it with a lock and broadcasts the new
 * dashboard over Socket.IO afterwards. `tick()` runs every second to hard-stop expired sessions, time out
 * no-shows, release calls to rigs that went offline and call waiting players to free rigs.
 */
export class RigService {
	private io: SocketIOServer | null = null;
	private readonly withLock = createLock();
	private ticker: ReturnType<typeof setInterval> | null = null;
	private ticking = false;
	// Set by any mutation inside a transition; the dashboard is broadcast once the transition completes
	private dirty = false;
	private readonly onlineState = new Map<number, boolean>();

	setSocketIO(io: SocketIOServer | null): void {
		this.io = io;
	}

	async init(): Promise<void> {
		await rigRepository.ensureRigs(env.NUMBER_OF_RIGS);
	}

	startTicker(intervalMs = 1000): void {
		this.stopTicker();
		this.ticker = setInterval(() => {
			this.tick().catch((error) => logger.error({ error }, "Rig tick failed"));
		}, intervalMs);
	}

	stopTicker(): void {
		if (this.ticker) clearInterval(this.ticker);
		this.ticker = null;
	}

	// -------------------------------------------------------------------------
	// Public queue
	// -------------------------------------------------------------------------

	async joinQueue(playerName: string): Promise<ServiceResponse<JoinQueueResponse | null>> {
		const name = playerName.trim().replace(/\s+/g, " ");
		if (name.length < 1 || name.length > 50) {
			return ServiceResponse.failure("Name must be 1-50 characters", null, StatusCodes.BAD_REQUEST);
		}
		const nameKey = name.toLowerCase();

		const result = await this.transition("Player joined queue", async (now) => {
			const existing = await rigRepository.findDriverByNameKey(nameKey);
			if (existing && (await rigRepository.hasActiveEntry(existing.id))) {
				throw new TransitionError("A player with this name is already in queue");
			}
			if (existing && (await rigRepository.hasActiveSession(existing.id))) {
				throw new TransitionError("A player with this name is currently racing");
			}

			const driver = await rigRepository.upsertDriver(name, nameKey);
			const entry = await rigRepository.createEntry(driver.id, (await rigRepository.maxSortKey()) + SORT_KEY_GAP);
			this.dirty = true;
			await this.assignFreeRigs(now);
			return entry.id;
		});
		if (!result.success || !result.responseObject) {
			return ServiceResponse.failure(result.message, null, result.statusCode);
		}

		const entryId = result.responseObject;
		const dashboard = await this.buildDashboard(clock.now());
		const waiting = dashboard.queue.find((entry) => entry.id === entryId);
		const calledRig = dashboard.rigs.find((rig) => rig.called?.queueEntryId === entryId);

		return ServiceResponse.success(result.message, {
			queueEntryId: entryId,
			driverName: name,
			position: waiting?.position ?? 0,
			etaSec: waiting ? waiting.etaSec : 0,
			calledRigId: calledRig?.id ?? null,
		});
	}

	async getDashboard(): Promise<ServiceResponse<DashboardView>> {
		return ServiceResponse.success("Dashboard data retrieved", await this.buildDashboard(clock.now()));
	}

	// -------------------------------------------------------------------------
	// Rig app (also used by staff)
	// -------------------------------------------------------------------------

	async heartbeat(rigId: number, body: HeartbeatBody): Promise<ServiceResponse<RigStatus | null>> {
		const result = await this.transition("Heartbeat received", async (now) => {
			const rig = await this.requireRig(rigId);
			const wasOnline = isRigOnline(rig, now);

			const trackChanged =
				(body.track !== undefined && body.track !== rig.track) ||
				(body.trackConfig !== undefined && body.trackConfig !== rig.trackConfig) ||
				(body.car !== undefined && body.car !== rig.car);

			await rigRepository.updateRig(rigId, {
				lastSeenAt: now,
				...(body.appVersion !== undefined && { appVersion: body.appVersion }),
				...(body.track !== undefined && { track: body.track, trackConfig: body.trackConfig ?? "" }),
				...(body.car !== undefined && { car: body.car }),
			});

			if (trackChanged) this.dirty = true;
			if (!wasOnline) {
				this.dirty = true;
				await this.assignFreeRigs(now);
			}
			return null;
		});
		return this.withRigStatus(rigId, result);
	}

	async startSession(rigId: number, queueEntryId: string): Promise<ServiceResponse<string | null>> {
		return this.transition("Session started", async (now) => {
			const rig = await this.requireRig(rigId);
			if (await rigRepository.findActiveSessionForRig(rigId)) {
				throw new TransitionError("Rig already has an active session");
			}

			const entry = await rigRepository.findEntry(queueEntryId);
			if (!entry || entry.status !== QueueStatus.CALLED || entry.rigId !== rigId) {
				throw new TransitionError("This player is not called to this rig (anymore)");
			}

			const session = await rigRepository.createSession({
				rigId,
				driverId: entry.driverId,
				queueEntryId: entry.id,
				startedAt: now,
				endsAt: new Date(now.getTime() + sessionDurationMs()),
				track: rig.track,
				trackConfig: rig.trackConfig,
				car: rig.car,
			});
			await rigRepository.updateEntry(entry.id, { status: QueueStatus.STARTED });
			this.dirty = true;
			return session.id;
		});
	}

	async endSession(rigId: number, sessionId: string, reason: EndReason): Promise<ServiceResponse<string | null>> {
		return this.transition("Session ended", async (now) => {
			await this.requireRig(rigId);
			const session = await rigRepository.findSession(sessionId);
			if (!session || session.rigId !== rigId || session.endedAt) {
				throw new TransitionError("Session is not active on this rig");
			}

			await this.endSessionNow(session.id, reason, now);
			await this.assignFreeRigs(now);
			return session.id;
		});
	}

	async skipCall(rigId: number, queueEntryId: string): Promise<ServiceResponse<SkipOutcome | null>> {
		return this.transition("Player skipped", async (now) => {
			await this.requireRig(rigId);
			const entry = await rigRepository.findEntry(queueEntryId);
			if (!entry || entry.status !== QueueStatus.CALLED || entry.rigId !== rigId) {
				throw new TransitionError("This player is not called to this rig (anymore)");
			}

			const outcome = await this.skipEntry(entry);
			await this.assignFreeRigs(now);
			return outcome;
		});
	}

	async submitLap(rigId: number, body: SubmitLapBody): Promise<ServiceResponse<LapResult | null>> {
		const result = await this.transition("Lap recorded", async () => {
			await this.requireRig(rigId);

			// Re-sent after a network error: answer as if it was the first time
			const existing = await rigRepository.findLapByClientId(body.clientLapId);
			if (existing) {
				if (existing.rigId !== rigId) throw new TransitionError("Lap id already used by another rig");
				return existing;
			}

			const session = await rigRepository.findSession(body.sessionId);
			if (!session || session.rigId !== rigId) {
				throw new TransitionError("Session not found", StatusCodes.NOT_FOUND);
			}

			// Hard stop: laps completed after the time limit (or after an early end) don't count
			const completedAt = new Date(body.completedAt);
			const cutoff = session.endedAt && session.endedAt < session.endsAt ? session.endedAt : session.endsAt;
			let valid = body.valid;
			let invalidReason: string | null = valid ? null : (body.invalidReason ?? null);
			if (valid && completedAt > cutoff) {
				valid = false;
				invalidReason = InvalidReason.AFTER_TIME;
			}

			const lap = await rigRepository.createLap({
				clientLapId: body.clientLapId,
				sessionId: session.id,
				driverId: session.driverId,
				rigId,
				lapTimeMs: body.lapTimeMs,
				valid,
				invalidReason,
				sectorsMs: body.sectorsMs ? JSON.stringify(body.sectorsMs) : null,
				track: body.track,
				trackConfig: body.trackConfig ?? "",
				car: body.car,
				completedAt,
			});
			this.dirty = true;
			if (lap.valid) leaderboardService.emitLeaderboardUpdate();
			return lap;
		});
		if (!result.success || !result.responseObject) {
			return ServiceResponse.failure(result.message, null, result.statusCode);
		}

		return ServiceResponse.success(result.message, await this.lapResult(result.responseObject));
	}

	// Replaces a successful rig action's response with the rig's fresh status, so the app can update immediately
	async withRigStatus<T>(rigId: number, response: ServiceResponse<T>): Promise<ServiceResponse<RigStatus | null>> {
		if (!response.success) return ServiceResponse.failure(response.message, null, response.statusCode);
		return ServiceResponse.success(response.message, await this.buildRigStatus(rigId, clock.now()));
	}

	// -------------------------------------------------------------------------
	// Staff
	// -------------------------------------------------------------------------

	async setRigEnabled(rigId: number, enabled: boolean): Promise<ServiceResponse<null>> {
		return this.transition(enabled ? "Rig enabled" : "Rig disabled", async (now) => {
			await this.requireRig(rigId);
			await rigRepository.updateRig(rigId, { enabled });
			this.dirty = true;
			await this.releaseUnavailableCalls(now);
			await this.assignFreeRigs(now);
			return null;
		});
	}

	async extendSession(rigId: number, sessionId: string, seconds: number): Promise<ServiceResponse<number | null>> {
		return this.transition("Session time changed", async () => {
			const session = await rigRepository.findSession(sessionId);
			if (!session || session.rigId !== rigId || session.endedAt) {
				throw new TransitionError("Session is not active on this rig");
			}

			// If this moves the end into the past, the next tick ends the session
			const endsAt = new Date(session.endsAt.getTime() + seconds * 1000);
			await rigRepository.updateSession(session.id, { endsAt });
			this.dirty = true;
			return endsAt.getTime();
		});
	}

	async moveEntry(entryId: string, direction: MoveDirection): Promise<ServiceResponse<null>> {
		return this.transition("Queue entry moved", async () => {
			const waiting = await rigRepository.findEntries([QueueStatus.WAITING]);
			const index = waiting.findIndex((entry) => entry.id === entryId);
			if (index === -1) throw new TransitionError("Player is not waiting in the queue");

			if (direction === "top") {
				if (index > 0) {
					await rigRepository.updateEntry(entryId, { sortKey: waiting[0].sortKey - SORT_KEY_GAP });
					this.dirty = true;
				}
				return null;
			}

			const target = direction === "up" ? index - 1 : index + 1;
			if (target < 0 || target >= waiting.length) return null;

			await rigRepository.updateEntry(waiting[index].id, { sortKey: waiting[target].sortKey });
			await rigRepository.updateEntry(waiting[target].id, { sortKey: waiting[index].sortKey });
			this.dirty = true;
			return null;
		});
	}

	// Calls a specific waiting player to a rig; whoever that rig was calling goes back to their old spot
	async callEntry(entryId: string, rigId: number): Promise<ServiceResponse<null>> {
		return this.transition("Player called", async (now) => {
			const rig = await this.requireRig(rigId);
			if (!rig.enabled || !isRigOnline(rig, now)) throw new TransitionError("Rig is disabled or offline");
			if (await rigRepository.findActiveSessionForRig(rigId)) throw new TransitionError("Rig is busy");

			const entry = await rigRepository.findEntry(entryId);
			if (!entry || entry.status !== QueueStatus.WAITING) {
				throw new TransitionError("Player is not waiting in the queue");
			}

			const called = await rigRepository.findEntries([QueueStatus.CALLED]);
			for (const previous of called.filter((e) => e.rigId === rigId)) {
				await rigRepository.updateEntry(previous.id, { status: QueueStatus.WAITING, rigId: null, calledAt: null });
			}

			await rigRepository.updateEntry(entry.id, { status: QueueStatus.CALLED, rigId, calledAt: now });
			this.dirty = true;
			return null;
		});
	}

	async removeEntry(entryId: string): Promise<ServiceResponse<null>> {
		return this.transition("Player removed from queue", async (now) => {
			const entry = await rigRepository.findEntry(entryId);
			if (!entry || (entry.status !== QueueStatus.WAITING && entry.status !== QueueStatus.CALLED)) {
				throw new TransitionError("Player is not in the queue", StatusCodes.NOT_FOUND);
			}

			await rigRepository.updateEntry(entry.id, { status: QueueStatus.REMOVED, rigId: null, calledAt: null });
			this.dirty = true;
			await this.assignFreeRigs(now);
			return null;
		});
	}

	async invalidateLap(lapId: string): Promise<ServiceResponse<null>> {
		return this.transition("Lap invalidated", async () => {
			const lap = await rigRepository.findLap(lapId);
			if (!lap) throw new TransitionError("Lap not found", StatusCodes.NOT_FOUND);

			await rigRepository.updateLap(lapId, { valid: false, invalidReason: InvalidReason.STAFF });
			this.dirty = true;
			leaderboardService.emitLeaderboardUpdate();
			return null;
		});
	}

	async deleteDriver(driverId: string): Promise<ServiceResponse<null>> {
		return this.transition("Driver deleted", async (now) => {
			const driver = await rigRepository.findDriver(driverId);
			if (!driver) throw new TransitionError("Driver not found", StatusCodes.NOT_FOUND);
			if (await rigRepository.hasActiveSession(driverId)) {
				throw new TransitionError("Driver is currently racing - end the session first");
			}

			// Cascades to the driver's queue entries, sessions and laps
			await rigRepository.deleteDriver(driverId);
			this.dirty = true;
			leaderboardService.emitLeaderboardUpdate();
			await this.assignFreeRigs(now);
			return null;
		});
	}

	async getAdminOverview(): Promise<ServiceResponse<AdminOverview>> {
		const dashboard = await this.buildDashboard(clock.now());
		const laps = await rigRepository.findRecentLaps(50);

		return ServiceResponse.success("Admin overview retrieved", {
			...dashboard,
			recentLaps: laps.map((lap) => ({
				id: lap.id,
				driverId: lap.driverId,
				driverName: lap.driver.name,
				rigId: lap.rigId,
				lapTimeMs: lap.lapTimeMs,
				valid: lap.valid,
				invalidReason: lap.invalidReason as LapResult["invalidReason"],
				track: lap.track,
				trackConfig: lap.trackConfig,
				car: lap.car,
				completedAt: lap.completedAt.getTime(),
			})),
		});
	}

	// -------------------------------------------------------------------------
	// Background tick
	// -------------------------------------------------------------------------

	async tick(): Promise<void> {
		if (this.ticking) return;
		this.ticking = true;

		try {
			await this.withLock(async () => {
				const now = clock.now();

				// Hard stop at the time limit
				for (const session of await rigRepository.findActiveSessions()) {
					if (session.endsAt <= now) await this.endSessionNow(session.id, EndReason.TIME_UP, now);
				}

				await this.releaseUnavailableCalls(now);

				// Called players who never pressed Start count as skipped
				for (const entry of await rigRepository.findEntries([QueueStatus.CALLED])) {
					if (entry.calledAt && now.getTime() - entry.calledAt.getTime() >= callTimeoutMs()) {
						await this.skipEntry(entry);
					}
				}

				await this.assignFreeRigs(now);
				await this.trackOnlineChanges(now);
			});
			this.flushUpdates();
		} finally {
			this.ticking = false;
		}
	}

	// -------------------------------------------------------------------------
	// Internals (call only inside a transition / the lock)
	// -------------------------------------------------------------------------

	private async transition<T>(message: string, fn: (now: Date) => Promise<T>): Promise<ServiceResponse<T | null>> {
		try {
			const value = await this.withLock(() => fn(clock.now()));
			return ServiceResponse.success(message, value);
		} catch (error) {
			if (error instanceof TransitionError) return ServiceResponse.failure(error.message, null, error.statusCode);

			logger.error({ error }, `Transition "${message}" failed`);
			return ServiceResponse.failure("Internal server error", null, StatusCodes.INTERNAL_SERVER_ERROR);
		} finally {
			this.flushUpdates();
		}
	}

	private async requireRig(rigId: number) {
		const rig = rigId <= env.NUMBER_OF_RIGS ? await rigRepository.findRig(rigId) : null;
		if (!rig) throw new TransitionError("Rig not found", StatusCodes.NOT_FOUND);
		return rig;
	}

	private async endSessionNow(sessionId: string, reason: EndReason, now: Date): Promise<void> {
		await rigRepository.updateSession(sessionId, { endedAt: now, endReason: reason });
		this.dirty = true;
	}

	// First skip moves the player back SKIP_REQUEUE_POSITIONS places, the second one drops them
	private async skipEntry(entry: EntryWithDriver): Promise<SkipOutcome> {
		this.dirty = true;

		if (entry.skipCount >= 1 || env.SKIP_REQUEUE_POSITIONS === 0) {
			await rigRepository.updateEntry(entry.id, { status: QueueStatus.NO_SHOW, rigId: null, calledAt: null });
			return "DROPPED";
		}

		const waiting = await rigRepository.findEntries([QueueStatus.WAITING]);
		await rigRepository.updateEntry(entry.id, {
			status: QueueStatus.WAITING,
			rigId: null,
			calledAt: null,
			skipCount: entry.skipCount + 1,
			sortKey: sortKeyAfter(waiting, env.SKIP_REQUEUE_POSITIONS, entry.sortKey),
		});
		return "REQUEUED";
	}

	// Calls to rigs that went offline or were disabled go back to the queue at their old position
	private async releaseUnavailableCalls(now: Date): Promise<void> {
		const rigs = new Map((await rigRepository.findRigs(env.NUMBER_OF_RIGS)).map((rig) => [rig.id, rig]));

		for (const entry of await rigRepository.findEntries([QueueStatus.CALLED])) {
			const rig = entry.rigId !== null ? rigs.get(entry.rigId) : undefined;
			if (rig?.enabled && isRigOnline(rig, now)) continue;

			await rigRepository.updateEntry(entry.id, { status: QueueStatus.WAITING, rigId: null, calledAt: null });
			this.dirty = true;
		}
	}

	// Calls the head of the queue to every free, enabled, online rig (in rig id order)
	private async assignFreeRigs(now: Date): Promise<void> {
		const rigs = await rigRepository.findRigs(env.NUMBER_OF_RIGS);
		const busy = new Set<number>();
		for (const session of await rigRepository.findActiveSessions()) busy.add(session.rigId);
		for (const entry of await rigRepository.findEntries([QueueStatus.CALLED])) {
			if (entry.rigId !== null) busy.add(entry.rigId);
		}

		const freeRigs = rigs.filter((rig) => rig.enabled && isRigOnline(rig, now) && !busy.has(rig.id));
		if (freeRigs.length === 0) return;

		const waiting = await rigRepository.findEntries([QueueStatus.WAITING]);
		for (let i = 0; i < Math.min(freeRigs.length, waiting.length); i++) {
			await rigRepository.updateEntry(waiting[i].id, {
				status: QueueStatus.CALLED,
				rigId: freeRigs[i].id,
				calledAt: now,
			});
			this.dirty = true;
		}
	}

	private async trackOnlineChanges(now: Date): Promise<void> {
		for (const rig of await rigRepository.findRigs(env.NUMBER_OF_RIGS)) {
			const online = isRigOnline(rig, now);
			if (this.onlineState.get(rig.id) !== online) {
				this.onlineState.set(rig.id, online);
				this.dirty = true;
			}
		}
	}

	private flushUpdates(): void {
		if (!this.dirty) return;
		this.dirty = false;

		const io = this.io;
		if (!io) return;
		this.buildDashboard(clock.now())
			.then((view) => io.emit("queue-update", view))
			.catch((error) => logger.error({ error }, "Failed to broadcast queue update"));
	}

	// -------------------------------------------------------------------------
	// Views
	// -------------------------------------------------------------------------

	async buildDashboard(now: Date): Promise<DashboardView> {
		const rigs = await rigRepository.findRigs(env.NUMBER_OF_RIGS);
		const sessions = await rigRepository.findActiveSessions();
		const called = await rigRepository.findEntries([QueueStatus.CALLED]);
		const waiting = await rigRepository.findEntries([QueueStatus.WAITING]);
		const stats = await rigRepository.sessionLapStats(sessions.map((session) => session.id));

		const rigViews: RigView[] = rigs.map((rig) => {
			const session = sessions.find((s) => s.rigId === rig.id);
			const call = called.find((entry) => entry.rigId === rig.id);
			const sessionStats = session ? stats.get(session.id) : undefined;

			return {
				id: rig.id,
				enabled: rig.enabled,
				online: isRigOnline(rig, now),
				lastSeenAt: rig.lastSeenAt?.getTime() ?? null,
				appVersion: rig.appVersion,
				track: rig.track,
				trackConfig: rig.trackConfig,
				car: rig.car,
				state: session ? RigState.RACING : call ? RigState.CALLING : RigState.FREE,
				session: session
					? {
							id: session.id,
							driverId: session.driverId,
							driverName: session.driver.name,
							startedAt: session.startedAt.getTime(),
							endsAt: session.endsAt.getTime(),
							lapCount: sessionStats?.lapCount ?? 0,
							validLapCount: sessionStats?.validLapCount ?? 0,
							bestLapMs: sessionStats?.bestLapMs ?? null,
							lastLapMs: sessionStats?.lastLapMs ?? null,
						}
					: null,
				called:
					call?.calledAt != null
						? {
								queueEntryId: call.id,
								driverName: call.driver.name,
								calledAt: call.calledAt.getTime(),
								timeoutAt: call.calledAt.getTime() + callTimeoutMs(),
							}
						: null,
			};
		});

		const etas = estimateWaits(rigViews, waiting.length, now.getTime());

		return {
			serverTime: now.getTime(),
			rigs: rigViews,
			queue: waiting.map((entry, index) => ({
				id: entry.id,
				driverName: entry.driver.name,
				position: index + 1,
				skipCount: entry.skipCount,
				joinedAt: entry.createdAt.getTime(),
				etaSec: etas[index],
			})),
			config: kioskConfig(),
		};
	}

	async buildRigStatus(rigId: number, now: Date): Promise<RigStatus> {
		const dashboard = await this.buildDashboard(now);
		const rig = dashboard.rigs.find((r) => r.id === rigId);
		if (!rig) throw new Error(`Rig ${rigId} not found`);

		return {
			...rig,
			serverTime: dashboard.serverTime,
			lastSession: await this.lastSessionView(rigId),
			queueLength: dashboard.queue.length,
			nextDriverName: dashboard.queue[0]?.driverName ?? null,
			config: dashboard.config,
		};
	}

	private async lastSessionView(rigId: number): Promise<RigStatus["lastSession"]> {
		const session = await rigRepository.findLastEndedSession(rigId);
		if (!session?.endedAt) return null;

		const stats = (await rigRepository.sessionLapStats([session.id])).get(session.id);
		const bestLap = await rigRepository.findSessionBestLap(session.id);
		const rankToday = bestLap
			? await leaderboardService.rankFor(
					session.driverId,
					{ track: bestLap.track, trackConfig: bestLap.trackConfig, car: bestLap.car },
					"today",
				)
			: null;

		return {
			id: session.id,
			driverName: session.driver.name,
			endedAt: session.endedAt.getTime(),
			endReason: (session.endReason ?? EndReason.STAFF) as EndReason,
			lapCount: stats?.lapCount ?? 0,
			bestLapMs: bestLap?.lapTimeMs ?? null,
			rankToday,
		};
	}

	private async lapResult(lap: Lap): Promise<LapResult> {
		const combo = { track: lap.track, trackConfig: lap.trackConfig, car: lap.car };
		const bestLapMs = await leaderboardService.driverBestLapMs(lap.driverId, combo);

		let isPersonalBest = false;
		let rankToday: number | null = null;
		let rankAllTime: number | null = null;
		if (lap.valid) {
			const previousBest = await leaderboardService.driverBestLapMs(lap.driverId, combo, lap.id);
			isPersonalBest = previousBest === null || lap.lapTimeMs < previousBest;
			rankToday = await leaderboardService.rankFor(lap.driverId, combo, "today");
			rankAllTime = await leaderboardService.rankFor(lap.driverId, combo, "all");
		}

		return {
			lapId: lap.id,
			valid: lap.valid,
			invalidReason: lap.invalidReason as LapResult["invalidReason"],
			isPersonalBest,
			bestLapMs,
			rankToday,
			rankAllTime,
		};
	}
}

export const rigService = new RigService();
