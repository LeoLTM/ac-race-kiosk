import { createServer } from "node:http";
import { Server } from "socket.io";
import { leaderboardService } from "@/api/leaderboard/leaderboardService";
import { rigService } from "@/api/rig/rigService";
import type { SocketIOServer } from "@/common/models/socketServer";
import { env } from "@/common/utils/envConfig";
import { migrateDatabase } from "@/common/utils/migrate";
import { configureDatabase } from "@/common/utils/prismaClient";
import { app, logger } from "@/server";

const httpServer = createServer(app);

// Initialize Socket.io
const io: SocketIOServer = new Server(httpServer, {
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

// Bring the database schema up to date, create the configured rigs, then start the 1s tick
// (session hard stops, no-shows, calling players)
migrateDatabase(env.DATABASE_URL)
	.then((applied) => {
		if (applied.length) logger.info(`Applied database migrations: ${applied.join(", ")}`);
		return configureDatabase();
	})
	.then(() => rigService.init())
	.then(() => {
		rigService.startTicker();
		server = httpServer.listen(env.PORT, () => {
			const { NODE_ENV, HOST, PORT } = env;
			logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
		});
	})
	.catch((error) => {
		logger.error({ err: error }, "Failed to initialize the database");
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
