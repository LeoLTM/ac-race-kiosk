import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../../src/generated/prisma";

// Create adapter with database URL from environment
const adapter = new PrismaLibSql({
	url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

const COMBO = { track: "ks_brands_hatch", trackConfig: "indy", car: "ks_mercedes_amg_gt3" };
const RIG_COUNT = Number(process.env.NUMBER_OF_RIGS ?? 3);

// Generate random lap time between 48-55 seconds (in milliseconds)
function randomLapTimeMs(): number {
	const minMs = 48 * 1000;
	const maxMs = 55 * 1000;
	return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function main() {
	console.log("🌱 Seeding database with sample drivers and laps...");

	for (let id = 1; id <= RIG_COUNT; id++) {
		await prisma.rig.upsert({ where: { id }, update: {}, create: { id } });
	}

	const sampleDrivers = [
		"Player 1",
		"Player 2",
		"Player 3",
		"Player 4",
		"Player 5",
		"SpeedDemon",
		"RacingKing",
		"DriftMaster",
		"TurboTom",
		"FastLane",
	];

	for (const [index, name] of sampleDrivers.entries()) {
		const driver = await prisma.driver.upsert({
			where: { nameKey: name.toLowerCase() },
			update: {},
			create: { name, nameKey: name.toLowerCase() },
		});

		// One finished 10-minute session per driver, spread over the last few hours
		const startedAt = new Date(Date.now() - (index + 1) * 15 * 60_000);
		const endsAt = new Date(startedAt.getTime() + 10 * 60_000);
		const rigId = (index % RIG_COUNT) + 1;
		const session = await prisma.session.create({
			data: { rigId, driverId: driver.id, startedAt, endsAt, endedAt: endsAt, endReason: "TIME_UP", ...COMBO },
		});

		let completedAt = startedAt.getTime() + 60_000;
		let best = Number.POSITIVE_INFINITY;
		for (let lap = 0; lap < 8; lap++) {
			const lapTimeMs = randomLapTimeMs();
			const valid = Math.random() > 0.2;
			completedAt += lapTimeMs;
			if (valid) best = Math.min(best, lapTimeMs);

			await prisma.lap.create({
				data: {
					clientLapId: `seed-${session.id}-${lap}`,
					sessionId: session.id,
					driverId: driver.id,
					rigId,
					lapTimeMs,
					valid,
					invalidReason: valid ? null : "CUT",
					completedAt: new Date(completedAt),
					...COMBO,
				},
			});
		}

		console.log(`  ✓ ${name}: best ${Number.isFinite(best) ? (best / 1000).toFixed(3) : "-"}s on rig ${rigId}`);
	}

	console.log("\n✅ Seeding complete!");
}

main()
	.catch((e) => {
		console.error("❌ Seeding failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
