import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "@/common/utils/envConfig";
import { configureDatabase } from "@/common/utils/prismaClient";
import { app, logger } from "@/server";
import { rigService } from "@/api/rig/rigService";
import { leaderboardService } from "@/api/leaderboard/leaderboardService";

const httpServer = createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(httpServer, {
	cors: {
		origin: env.CORS_ORIGIN,
		credentials: true,
	},
});

// Connect Socket.io to services
rigService.setSocketIO(io);
leaderboardService.setSocketIO(io);

// Socket.io connection handler
io.on("connection", (socket) => {
	logger.info(`Client connected: ${socket.id}`);

	socket.on("disconnect", () => {
		logger.info(`Client disconnected: ${socket.id}`);
	});
});

if (!env.KIOSK_KEY) {
	logger.warn("KIOSK_KEY is not set - rig and admin endpoints are unprotected");
}

let server: ReturnType<typeof httpServer.listen>;

// Create the configured rigs, then start the 1s tick (session hard stops, no-shows, calling players)
configureDatabase()
	.then(() => rigService.init())
	.then(() => {
		rigService.startTicker();
		server = httpServer.listen(env.PORT, () => {
			const { NODE_ENV, HOST, PORT } = env;
			logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
		});
	})
	.catch((error) => {
		logger.error({ error }, "Failed to initialize rigs");
		process.exit(1);
	});

const onCloseSignal = () => {
	logger.info("sigint received, shutting down");
	rigService.stopTicker();
	if (!server) process.exit();
	server.close(() => {
		logger.info("server closed");
		process.exit();
	});
	setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
