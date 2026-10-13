import { StatusCodes } from "http-status-codes";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "@/server";
import { fakeClock, resetDatabase } from "@/test/helpers";

// Matches KIOSK_KEY in vite.config.mts
const KEY = "test-key";

describe("Kiosk HTTP API", () => {
	beforeEach(async () => {
		fakeClock();
		await resetDatabase();
	});

	describe("auth", () => {
		it("rejects rig and admin calls without the kiosk key", async () => {
			const heartbeat = await request(app).post("/rigs/1/heartbeat").send({});
			const overview = await request(app).get("/admin/overview");
			const wrongKey = await request(app).get("/admin/overview").set("X-Kiosk-Key", "nope");

			expect(heartbeat.status).toBe(StatusCodes.UNAUTHORIZED);
			expect(overview.status).toBe(StatusCodes.UNAUTHORIZED);
			expect(wrongKey.status).toBe(StatusCodes.UNAUTHORIZED);
		});

		it("keeps registration, dashboard and leaderboard public", async () => {
			expect((await request(app).post("/queue").send({ playerName: "Alice" })).status).toBe(StatusCodes.OK);
			expect((await request(app).get("/queue")).status).toBe(StatusCodes.OK);
			expect((await request(app).get("/leaderboard")).status).toBe(StatusCodes.OK);
			expect((await request(app).get("/leaderboard/combos")).status).toBe(StatusCodes.OK);
		});
	});

	describe("rig app flow", () => {
		it("calls, starts and reports a lap through the rig endpoints", async () => {
			await request(app).post("/queue").send({ playerName: "Alice" });

			const heartbeat = await request(app)
				.post("/rigs/1/heartbeat")
				.set("X-Kiosk-Key", KEY)
				.send({ appVersion: "1.0.0", track: "ks_vallelunga", trackConfig: "club_circuit", car: "abarth500" });
			expect(heartbeat.status).toBe(StatusCodes.OK);
			expect(heartbeat.body.responseObject).toMatchObject({ id: 1, online: true, state: "CALLING", queueLength: 0 });
			const queueEntryId = heartbeat.body.responseObject.called.queueEntryId;

			const start = await request(app).post("/rigs/1/session/start").set("X-Kiosk-Key", KEY).send({ queueEntryId });
			expect(start.status).toBe(StatusCodes.OK);
			expect(start.body.responseObject.state).toBe("RACING");
			const session = start.body.responseObject.session;

			const lap = await request(app)
				.post("/rigs/1/laps")
				.set("X-Kiosk-Key", KEY)
				.send({
					clientLapId: "1-abc",
					sessionId: session.id,
					lapTimeMs: 75_123,
					valid: true,
					sectorsMs: [25_000, 25_000, 25_123],
					track: "ks_vallelunga",
					trackConfig: "club_circuit",
					car: "abarth500",
					completedAt: session.startedAt + 80_000,
				});
			expect(lap.status).toBe(StatusCodes.OK);
			expect(lap.body.responseObject).toMatchObject({ valid: true, isPersonalBest: true, rankToday: 1 });

			const board = await request(app).get("/leaderboard?period=today");
			expect(board.body.responseObject.combo).toEqual({
				track: "ks_vallelunga",
				trackConfig: "club_circuit",
				car: "abarth500",
			});
			expect(board.body.responseObject.entries[0]).toMatchObject({ rank: 1, driverName: "Alice", lapTimeMs: 75_123 });
		});

		it("returns 404 for rigs beyond NUMBER_OF_RIGS", async () => {
			const response = await request(app).post("/rigs/3/heartbeat").set("X-Kiosk-Key", KEY).send({});

			expect(response.status).toBe(StatusCodes.NOT_FOUND);
		});

		it("returns 409 when starting a player that isn't called", async () => {
			const response = await request(app)
				.post("/rigs/1/session/start")
				.set("X-Kiosk-Key", KEY)
				.send({ queueEntryId: "does-not-exist" });

			expect(response.status).toBe(StatusCodes.CONFLICT);
			expect(response.body.success).toBe(false);
		});

		it("validates lap submissions", async () => {
			const response = await request(app)
				.post("/rigs/1/laps")
				.set("X-Kiosk-Key", KEY)
				.send({ clientLapId: "x", sessionId: "y", lapTimeMs: -5, valid: true });

			expect(response.status).toBe(StatusCodes.BAD_REQUEST);
		});
	});

	describe("queue", () => {
		it("validates the player name", async () => {
			expect((await request(app).post("/queue").send({ playerName: "" })).status).toBe(StatusCodes.BAD_REQUEST);
			expect((await request(app).post("/queue").send({ playerName: "   " })).status).toBe(StatusCodes.BAD_REQUEST);
			expect(
				(
					await request(app)
						.post("/queue")
						.send({ playerName: "x".repeat(51) })
				).status,
			).toBe(StatusCodes.BAD_REQUEST);
		});

		it("returns the dashboard with rigs, queue and config", async () => {
			await request(app).post("/queue").send({ playerName: "Alice" });

			const response = await request(app).get("/queue");

			expect(response.body.responseObject.rigs).toHaveLength(2);
			expect(response.body.responseObject.queue).toMatchObject([{ driverName: "Alice", position: 1 }]);
			expect(response.body.responseObject.config).toEqual({ sessionDurationSec: 600, callTimeoutSec: 120 });
		});
	});

	describe("admin", () => {
		it("lets staff disable a rig and remove a player", async () => {
			await request(app).post("/queue").send({ playerName: "Alice" });
			const entryId = (await request(app).get("/queue")).body.responseObject.queue[0].id;

			const disable = await request(app).post("/admin/rigs/2/disable").set("X-Kiosk-Key", KEY);
			const remove = await request(app).delete(`/admin/queue/${entryId}`).set("X-Kiosk-Key", KEY);
			const overview = await request(app).get("/admin/overview").set("X-Kiosk-Key", KEY);

			expect(disable.status).toBe(StatusCodes.OK);
			expect(remove.status).toBe(StatusCodes.OK);
			expect(overview.body.responseObject.queue).toEqual([]);
			expect(overview.body.responseObject.rigs[1].enabled).toBe(false);
			expect(overview.body.responseObject.recentLaps).toEqual([]);
		});
	});
});
