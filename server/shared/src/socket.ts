import type { DashboardResponse } from "./api";

// Socket.IO events, for typing both ends: `new Server<ClientToServerEvents, ServerToClientEvents>()` and
// `io() as Socket<ServerToClientEvents, ClientToServerEvents>`
export interface ServerToClientEvents {
	// Rigs or queue changed; carries the full dashboard view
	"queue-update": (dashboard: DashboardResponse) => void;
	// A lap was added or invalidated; clients refetch what they show
	"leaderboard-update": (payload: Record<string, never>) => void;
}

// The frontend only listens
export type ClientToServerEvents = Record<string, never>;
