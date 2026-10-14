// HTTP API contract between backend and frontend. The backend's Zod schemas (which also feed the OpenAPI docs)
// are checked against these types with `satisfies`, so a mismatch fails the backend typecheck.
// All timestamps are epoch milliseconds.

// Envelope of every JSON response (the backend's ServiceResponse)
export interface ApiResponse<T> {
	success: boolean;
	message: string;
	responseObject: T;
	statusCode: number;
}

export const RigState = {
	FREE: "FREE",
	CALLING: "CALLING",
	RACING: "RACING",
} as const;
export type RigState = (typeof RigState)[keyof typeof RigState];

export type EndReason = "TIME_UP" | "DRIVER" | "STAFF";

export type InvalidReason = "CUT" | "PIT" | "OUT_LAP" | "TOO_SHORT" | "AFTER_TIME" | "STAFF";

export interface Session {
	id: string;
	driverId: string;
	driverName: string;
	startedAt: number;
	endsAt: number;
	lapCount: number;
	validLapCount: number;
	bestLapMs: number | null;
	lastLapMs: number | null;
}

export interface Call {
	queueEntryId: string;
	driverName: string;
	calledAt: number;
	timeoutAt: number;
}

export interface Rig {
	id: number;
	enabled: boolean;
	online: boolean;
	lastSeenAt: number | null;
	appVersion: string | null;
	track: string | null;
	trackConfig: string | null;
	car: string | null;
	state: RigState;
	session: Session | null;
	called: Call | null;
}

export interface QueueEntry {
	id: string;
	driverName: string;
	position: number;
	skipCount: number;
	joinedAt: number;
	// null when no rig is online
	etaSec: number | null;
}

export interface KioskConfig {
	sessionDurationSec: number;
	callTimeoutSec: number;
}

// GET /queue, also pushed as the "queue-update" socket event
export interface DashboardResponse {
	serverTime: number;
	rigs: Array<Rig>;
	queue: Array<QueueEntry>;
	config: KioskConfig;
}

// POST /queue
export interface JoinQueueResponse {
	queueEntryId: string;
	driverName: string;
	// 1-based; 0 when already called
	position: number;
	etaSec: number | null;
	// Set when a rig was free right away
	calledRigId: number | null;
}

// Leaderboards are kept per track layout + car, since lap times across combos aren't comparable
export interface Combo {
	track: string;
	trackConfig: string;
	car: string;
}

export type LeaderboardPeriod = "today" | "all";

export interface LeaderboardEntry {
	rank: number;
	driverId: string;
	driverName: string;
	lapTimeMs: number;
	completedAt: number;
	rigId: number;
	lapId: string;
}

// GET /leaderboard
export interface LeaderboardResponse {
	combo: Combo | null;
	period: LeaderboardPeriod;
	entries: Array<LeaderboardEntry>;
}

// GET /leaderboard/combos
export interface CombosResponse {
	combos: Array<Combo & { lapCount: number; lastLapAt: number }>;
	// Combo loaded on the online rigs (or of the latest lap)
	current: Combo | null;
}

export interface RecentLap {
	id: string;
	driverId: string;
	driverName: string;
	rigId: number;
	lapTimeMs: number;
	valid: boolean;
	invalidReason: InvalidReason | null;
	track: string;
	trackConfig: string;
	car: string;
	completedAt: number;
}

// GET /admin/overview
export interface AdminOverview extends DashboardResponse {
	recentLaps: Array<RecentLap>;
}
