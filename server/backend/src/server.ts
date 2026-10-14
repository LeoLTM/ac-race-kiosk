import cors from "cors";
import express, { type Express, type Router } from "express";
import helmet from "helmet";
import { pino } from "pino";
import { adminRouter } from "@/api/admin/adminRouter";
import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import { leaderboardRouter } from "@/api/leaderboard/leaderboardRouter";
import { queueRouter } from "@/api/queue/queueRouter";
import { rigRouter } from "@/api/rig/rigRouter";
import { userRouter } from "@/api/user/userRouter";
import { openAPIRouter } from "@/api-docs/openAPIRouter";
import errorHandler from "@/common/middleware/errorHandler";
import requestLogger from "@/common/middleware/requestLogger";
import { serveFrontend } from "@/common/middleware/serveFrontend";
import { env } from "@/common/utils/envConfig";

const logger = pino({ name: "server start" });
const app: Express = express();

// Set the application to trust the reverse proxy
app.set("trust proxy", true);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
// Kiosks reach the server over plain http on the LAN, where upgrading asset requests to https would break the pages
app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));

// Request logging
app.use(requestLogger);

// API routes live under /api, so they can't collide with the frontend's page routes (e.g. /admin)
const apiRouter: Router = express.Router();
apiRouter.use("/health-check", healthCheckRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/queue", queueRouter);
apiRouter.use("/rigs", rigRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/leaderboard", leaderboardRouter);
apiRouter.use("/docs", openAPIRouter);
app.use("/api", apiRouter);

// Rig apps released before the /api prefix call /rigs/... directly
app.use("/rigs", rigRouter);

// Kiosk, dashboard, leaderboard and staff pages (frontend/dist)
app.use(serveFrontend());

// Error handlers
app.use(errorHandler());

export { app, logger };
