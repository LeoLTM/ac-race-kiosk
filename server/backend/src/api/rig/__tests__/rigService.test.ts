import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it } from "vitest";
import { leaderboardService } from "@/api/leaderboard/leaderboardService";
import { prisma } from "@/common/utils/prismaClient";
import { fakeClock, resetDatabase } from "@/test/helpers";
import { EndReason, QueueStatus, RigState } from "../rigModel";
import { rigService } from "../rigService";

const COMBO = { track: "ks_brands_hatch", trackConfig: "indy", car: "ks_mercedes_amg_gt3" };
const MINUTE = 60_000;

async function goOnline(rigId: number) {
	const response = await rigService.heartbeat(rigId, { appVersion: "test", ...COMBO });
	expect(response.success).toBe(true);
	return response.responseObject!;
}

async function join(name: string) {
	const response = await rigService.joinQueue(name);
	expect(response.success).toBe(true);
	return response.responseObject!;
}

async function dashboard() {
	return (await rigService.getDashboard()).responseObject;
}

async function rig(rigId: number) {
	return (await dashboard()).rigs.find((r) => r.id === rigId)!;
}

// Calls `name` to the first free rig and presses Start there
async function startRacing(rigId: number, name: string) {
	await join(name);
	const called = (await rig(rigId)).called;
	expect(called?.driverName).toBe(name);
	const response = await rigService.startSession(rigId, called!.queueEntryId);
	expect(response.success).toBe(true);
	return response.responseObject!;
}

function lap(sessionId: string, overrides: Partial<Parameters<typeof rigService.submitLap>[1]> = {}) {
	return {
		clientLapId: `lap-${Math.random().toString(36).slice(2)}`,
		sessionId,
		lapTimeMs: 50_000,
		valid: true,
		completedAt: Date.now(),
		...COMBO,
		...overrides,
	};
}

describe("RigService", () => {
	let time: ReturnType<typeof fakeClock>;

	beforeEach(async () => {
		time = fakeClock();
		await resetDatabase();
	});

	describe("joinQueue", () => {
		it("queues players in order with no wait estimate while no rig is online", async () => {
			const first = await join("Alice");
			const second = await join("Bob");

			expect(first).toMatchObject({ position: 1, etaSec: null, calledRigId: null });
			expect(second).toMatchObject({ position: 2, etaSec: null, calledRigId: null });
		});

		it("calls the player right away when a rig is free", async () => {
			await goOnline(2);

			const result = await join("Alice");

			expect(result).toMatchObject({ position: 0, calledRigId: 2 });
			expect((await rig(2)).state).toBe(RigState.CALLING);
		});

		it("rejects a name that is already queued, ignoring case and spacing", async () => {
			await join("Max Power");

			const result = await rigService.joinQueue("  max   POWER ");

			expect(result.success).toBe(false);
			expect(result.statusCode).toBe(StatusCodes.CONFLICT);
		});

		it("rejects a name that is currently racing", async () => {
			await goOnline(1);
			await startRacing(1, "Alice");

			const result = await rigService.joinQueue("alice");

			expect(result.statusCode).toBe(StatusCodes.CONFLICT);
			expect(result.message).toBe("A player with this name is currently racing");
		});

		it("lets a returning driver join again after their session", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");
			await rigService.endSession(1, sessionId, EndReason.DRIVER);

			const result = await rigService.joinQueue("Alice");

			expect(result.success).toBe(true);
			expect(await prisma.driver.count()).toBe(1);
		});

		it("estimates waits from the running sessions", async () => {
			await goOnline(1);
			await startRacing(1, "Alice");
			time.advance(4 * MINUTE);

			const result = await join("Bob");

			// 6 minutes left + 30s handover
			expect(result.etaSec).toBe(6 * 60 + 30);
		});
	});

	describe("calling players", () => {
		it("assigns the head of the queue to free rigs in rig order once they come online", async () => {
			await join("Alice");
			await join("Bob");
			await join("Carol");

			await goOnline(2);
			await goOnline(1);

			const view = await dashboard();
			expect(view.rigs.find((r) => r.id === 2)!.called!.driverName).toBe("Alice");
			expect(view.rigs.find((r) => r.id === 1)!.called!.driverName).toBe("Bob");
			expect(view.queue.map((e) => e.driverName)).toEqual(["Carol"]);
		});

		it("does not call players to disabled rigs and releases their calls", async () => {
			await goOnline(1);
			await join("Alice");
			expect((await rig(1)).called).not.toBeNull();

			await rigService.setRigEnabled(1, false);

			expect((await rig(1)).called).toBeNull();
			expect((await dashboard()).queue.map((e) => e.driverName)).toEqual(["Alice"]);

			await rigService.setRigEnabled(1, true);
			expect((await rig(1)).called!.driverName).toBe("Alice");
		});

		it("puts a call back at its old position when the rig goes offline", async () => {
			await goOnline(1);
			await join("Alice");
			await join("Bob");

			time.advance(3601 * 1000);
			await rigService.tick();

			const view = await dashboard();
			expect(view.rigs.find((r) => r.id === 1)!.online).toBe(false);
			expect(view.queue.map((e) => [e.driverName, e.skipCount])).toEqual([
				["Alice", 0],
				["Bob", 0],
			]);
		});

		it("moves a no-show back in the queue, then drops them on the second timeout", async () => {
			await goOnline(1);
			for (const name of ["Alice", "Bob", "Carol", "Dave", "Eve"]) await join(name);

			time.advance(120 * 1000);
			await rigService.tick();

			let view = await dashboard();
			// Alice lets 3 others go first (Bob, now called, Carol and Dave)
			expect(view.rigs[0].called!.driverName).toBe("Bob");
			expect(view.queue.map((e) => e.driverName)).toEqual(["Carol", "Dave", "Alice", "Eve"]);

			// Bob, Carol and Dave don't show up either, then it's Alice's turn again
			for (let i = 0; i < 3; i++) {
				time.advance(120 * 1000);
				await rigService.tick();
			}
			view = await dashboard();
			expect(view.rigs[0].called!.driverName).toBe("Alice");

			time.advance(120 * 1000);
			await rigService.tick();

			const alice = await prisma.queueEntry.findFirst({ where: { driver: { name: "Alice" } } });
			expect(alice!.status).toBe(QueueStatus.NO_SHOW);
		});

		it("skips via the rig and calls the next player", async () => {
			await goOnline(1);
			await join("Alice");
			await join("Bob");
			const called = (await rig(1)).called!;

			const result = await rigService.skipCall(1, called.queueEntryId);

			expect(result.responseObject).toBe("REQUEUED");
			expect((await rig(1)).called!.driverName).toBe("Bob");
			expect((await dashboard()).queue.map((e) => e.driverName)).toEqual(["Alice"]);
		});

		it("rejects actions with a stale queue entry", async () => {
			await goOnline(1);
			await join("Alice");
			await join("Bob");
			const aliceCall = (await rig(1)).called!;
			await rigService.skipCall(1, aliceCall.queueEntryId);

			const result = await rigService.startSession(1, aliceCall.queueEntryId);

			expect(result.statusCode).toBe(StatusCodes.CONFLICT);
		});

		it("serializes concurrent start and skip on the same call", async () => {
			await goOnline(1);
			await join("Alice");
			await join("Bob");
			const called = (await rig(1)).called!;

			const [start, skip] = await Promise.all([
				rigService.startSession(1, called.queueEntryId),
				rigService.skipCall(1, called.queueEntryId),
			]);

			expect([start.success, skip.success]).toEqual([true, false]);
			expect(await prisma.session.count()).toBe(1);
		});
	});

	describe("sessions", () => {
		it("starts a session for the called player", async () => {
			await goOnline(1);
			await startRacing(1, "Alice");

			const view = await rig(1);
			expect(view.state).toBe(RigState.RACING);
			expect(view.session!.driverName).toBe("Alice");
			expect(view.session!.endsAt - view.session!.startedAt).toBe(10 * MINUTE);
		});

		it("hard-stops the session at the time limit and calls the next player", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");
			await join("Bob");

			time.advance(10 * MINUTE - 1000);
			await rigService.tick();
			expect((await rig(1)).state).toBe(RigState.RACING);

			time.advance(1000);
			await rigService.tick();

			const session = await prisma.session.findUnique({ where: { id: sessionId } });
			expect(session!.endReason).toBe(EndReason.TIME_UP);
			expect((await rig(1)).called!.driverName).toBe("Bob");
		});

		it("reports the last session with best lap and rank to the rig", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");
			await rigService.submitLap(1, lap(sessionId, { lapTimeMs: 49_000, completedAt: time.now().getTime() }));
			await rigService.endSession(1, sessionId, EndReason.DRIVER);

			const status = await goOnline(1);

			expect(status.lastSession).toMatchObject({
				id: sessionId,
				driverName: "Alice",
				endReason: EndReason.DRIVER,
				lapCount: 1,
				bestLapMs: 49_000,
				rankToday: 1,
			});
		});

		it("lets staff extend a session", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");

			await rigService.extendSession(1, sessionId, 120);
			time.advance(11 * MINUTE);
			await rigService.tick();

			expect((await rig(1)).state).toBe(RigState.RACING);
		});
	});

	describe("laps", () => {
		it("records a valid lap with personal best and ranks", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");

			const result = await rigService.submitLap(1, lap(sessionId, { completedAt: time.now().getTime() }));

			expect(result.responseObject).toMatchObject({
				valid: true,
				isPersonalBest: true,
				bestLapMs: 50_000,
				rankToday: 1,
				rankAllTime: 1,
			});
			expect((await rig(1)).session).toMatchObject({ lapCount: 1, bestLapMs: 50_000, lastLapMs: 50_000 });
		});

		it("marks laps completed after the time limit as invalid", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");
			const endsAt = (await rig(1)).session!.endsAt;

			const result = await rigService.submitLap(1, lap(sessionId, { completedAt: endsAt + 1 }));

			expect(result.responseObject).toMatchObject({ valid: false, invalidReason: "AFTER_TIME", isPersonalBest: false });
		});

		it("keeps the rig's reason for invalid laps", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");

			const result = await rigService.submitLap(
				1,
				lap(sessionId, { valid: false, invalidReason: "CUT", completedAt: time.now().getTime() }),
			);

			expect(result.responseObject).toMatchObject({ valid: false, invalidReason: "CUT" });
		});

		it("treats a re-sent lap as the same lap", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");
			const body = lap(sessionId, { completedAt: time.now().getTime() });

			const first = await rigService.submitLap(1, body);
			const second = await rigService.submitLap(1, body);

			expect(second.success).toBe(true);
			expect(second.responseObject!.lapId).toBe(first.responseObject!.lapId);
			expect(await prisma.lap.count()).toBe(1);
		});

		it("rejects laps for sessions of another rig", async () => {
			await goOnline(1);
			await goOnline(2);
			const sessionId = await startRacing(1, "Alice");

			const result = await rigService.submitLap(2, lap(sessionId, { completedAt: time.now().getTime() }));

			expect(result.statusCode).toBe(StatusCodes.NOT_FOUND);
		});

		it("ranks drivers by their best valid lap on the leaderboard", async () => {
			await goOnline(1);
			await goOnline(2);
			const alice = await startRacing(1, "Alice");
			const bob = await startRacing(2, "Bob");
			const now = time.now().getTime();
			await rigService.submitLap(1, lap(alice, { lapTimeMs: 51_000, completedAt: now }));
			await rigService.submitLap(1, lap(alice, { lapTimeMs: 49_500, completedAt: now + 1 }));
			await rigService.submitLap(2, lap(bob, { lapTimeMs: 50_000, completedAt: now + 2 }));
			await rigService.submitLap(
				2,
				lap(bob, { lapTimeMs: 40_000, valid: false, invalidReason: "CUT", completedAt: now + 3 }),
			);

			const board = (await leaderboardService.getLeaderboard({ period: "today" })).responseObject!;

			expect(board.combo).toEqual(COMBO);
			expect(board.entries.map((e) => [e.rank, e.driverName, e.lapTimeMs])).toEqual([
				[1, "Alice", 49_500],
				[2, "Bob", 50_000],
			]);
		});

		it("drops a lap from the leaderboard when staff invalidate it", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");
			const result = await rigService.submitLap(1, lap(sessionId, { completedAt: time.now().getTime() }));

			await rigService.invalidateLap(result.responseObject!.lapId);

			const board = (await leaderboardService.getLeaderboard({ ...COMBO })).responseObject!;
			expect(board.entries).toEqual([]);
		});
	});

	describe("staff queue management", () => {
		it("moves waiting players up and to the top", async () => {
			for (const name of ["Alice", "Bob", "Carol"]) await join(name);
			const carol = (await dashboard()).queue[2];

			await rigService.moveEntry(carol.id, "up");
			expect((await dashboard()).queue.map((e) => e.driverName)).toEqual(["Alice", "Carol", "Bob"]);

			const bob = (await dashboard()).queue[2];
			await rigService.moveEntry(bob.id, "top");
			expect((await dashboard()).queue.map((e) => e.driverName)).toEqual(["Bob", "Alice", "Carol"]);
		});

		it("calls a specific player instead, putting the previous call back at the front", async () => {
			await goOnline(1);
			await join("Alice");
			await join("Bob");
			await join("Carol");
			const carol = (await dashboard()).queue.find((e) => e.driverName === "Carol")!;

			await rigService.callEntry(carol.id, 1);

			expect((await rig(1)).called!.driverName).toBe("Carol");
			expect((await dashboard()).queue.map((e) => [e.driverName, e.skipCount])).toEqual([
				["Alice", 0],
				["Bob", 0],
			]);
		});

		it("refuses to call a player to a rig that is racing", async () => {
			await goOnline(1);
			await startRacing(1, "Alice");
			await join("Bob");

			const result = await rigService.callEntry((await dashboard()).queue[0].id, 1);

			expect(result.statusCode).toBe(StatusCodes.CONFLICT);
		});

		it("deletes a driver with their laps", async () => {
			await goOnline(1);
			const sessionId = await startRacing(1, "Alice");
			await rigService.submitLap(1, lap(sessionId, { completedAt: time.now().getTime() }));
			const driverId = (await rig(1)).session!.driverId;

			expect((await rigService.deleteDriver(driverId)).statusCode).toBe(StatusCodes.CONFLICT);

			await rigService.endSession(1, sessionId, EndReason.STAFF);
			expect((await rigService.deleteDriver(driverId)).success).toBe(true);
			expect(await prisma.lap.count()).toBe(0);
		});
	});
});
