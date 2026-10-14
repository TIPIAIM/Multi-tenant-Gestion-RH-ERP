import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";

import { getDatabaseStatus } from "./config/database.js";
import {
  errorMiddleware,
  notFoundMiddleware,
} from "./middlewares/error.middleware.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { tenantRouter } from "./modules/tenants/tenant.routes.js";
import { organizationRouter } from "./modules/organisation/organization.routes.js";
import { agentRouter } from "./modules/agents/agent.routes.js";
import { taskRouter } from "./modules/tasks/task.routes.js";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import { userManagementRouter } from "./modules/users/user-management.routes.js";
import { leaveRouter } from "./modules/leaves/leave.routes.js";
import { roadmapRouter } from "./modules/roadmaps/roadmap.routes.js";
import { evaluationRouter } from "./modules/evaluations/evaluation.routes.js";
import { managementReportRouter } from "./modules/reports/report.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
 
import { pieceTransferRouter } from "./modules/piece-transfers/piece-transfer.routes.js";

export const app = express();

app.disable("x-powered-by");

if (env.nodeEnv === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());

app.use(
  cors({
    origin: env.webUrl,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "x-tenant-slug"],
  })
);

app.use(cookieParser());

app.use(express.json({ limit: "1mb" }));
app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

app.get("/api/v1/health", (_request, response) => {
  response.status(200).json({
    success: true,
    service: "fades-rh-api",
    message: "API opérationnelle",
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/tenants", tenantRouter);
app.use("/api/v1/organisation", organizationRouter);
app.use("/api/v1/agents", agentRouter);
app.use("/api/v1/tasks", taskRouter);
app.use("/api/v1/attendance", attendanceRouter);
app.use("/api/v1/admin-users", userManagementRouter);
app.use("/api/v1/leaves", leaveRouter);
app.use("/api/v1/roadmaps", roadmapRouter);
app.use("/api/v1/evaluations", evaluationRouter);
app.use("/api/v1/reports", managementReportRouter);
app.use("/api/v1/settings", settingsRouter);

app.use("/api/v1/piece-transfers", pieceTransferRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
