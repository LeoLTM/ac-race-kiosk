import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "@/common/utils/envConfig";
import { app, logger } from "@/server";
import { queueService } from "@/api/queue/queueService";

const httpServer = createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(httpServer, {
	cors: {
		origin: env.CORS_ORIGIN,
		credentials: true,
	},
});

// Connect Socket.io to queue service
queueService.setSocketIO(io);

// Socket.io connection handler
io.on("connection", (socket) => {
	logger.info(`Client connected: ${socket.id}`);

	socket.on("disconnect", () => {
		logger.info(`Client disconnected: ${socket.id}`);
	});
});

const server = httpServer.listen(env.PORT, () => {
	const { NODE_ENV, HOST, PORT } = env;
	logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
});

const onCloseSignal = () => {
	logger.info("sigint received, shutting down");
	server.close(() => {
		logger.info("server closed");
		process.exit();
	});
	setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
