import type { ClientToServerEvents, ServerToClientEvents } from "@racekiosk/shared";
import type { Server } from "socket.io";

// Socket.IO server typed with the events the frontend listens to
export type SocketIOServer = Server<ClientToServerEvents, ServerToClientEvents>;
