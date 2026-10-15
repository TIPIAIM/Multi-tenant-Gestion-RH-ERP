import { UserModel } from "../users/user.model.js";
import { requireTenantFeature } from "../../middlewares/feature.middleware.js";
import { TaskModel } from "./task.models.js";
import { AgentModel } from "../agents/agent.model.js";
import { AppError } from "../../core/errors/app-error.js";
import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import {
  tenantContextMiddleware,
} from "../../middlewares/tenant-context.middleware.js";
import {
  addTaskCommentController,
  createTaskController,
  downloadTaskKpiFileController,
  getTaskBoardController,
  getTaskController,
  getTaskScopeController,
  getTaskStatsController,
  listTaskActivitiesController,
  listTaskCommentsController,
  listTasksController,
  submitTaskKpiValueController,
  updateTaskController,
  updateTaskProgressController,
  uploadTaskKpiFileController,
} from "./task.controller.js";
import {
  uploadTaskKpiFileMiddleware,
} from "./task-kpi.upload.js";

export const taskRouter = Router();

taskRouter.use(requireAuth);
taskRouter.use(tenantContextMiddleware);
taskRouter.use(requireTenantFeature("tasks"));

/**
 * TENANT_ADMIN : lecture/écriture globale.
 * DIRECTION : lecture/écriture dans sa Direction.
 * SERVICE_MANAGER : lecture/écriture dans son Service.
 * AGENT : lecture de ses propres tâches + progression + dépôt KPI.
 * RH_MANAGER : lecture globale uniquement ; téléchargement des preuves KPI autorisé.
 */
taskRouter.get("/notifications", async (request, response, next) => {
  try {
    if (!request.tenant || !request.auth) throw new AppError("Authentification requise.",401,"AUTH_REQUIRED");
    const user = await (UserModel as any).findOne({ _id: request.auth.userId, tenantId: request.tenant._id, isActive: true }).select("agentId").lean().exec();
    const personalAgent = await (AgentModel as any).findOne({ tenantId: request.tenant._id, ...(user?.agentId ? { _id: user.agentId } : { userId: request.auth.userId }) }).select("_id").lean().exec();
    const openTasks = personalAgent ? await TaskModel.countDocuments({ tenantId: request.tenant._id,
      assignedToAgentId: personalAgent._id, status: { $in: ["TODO", "IN_PROGRESS", "BLOCKED"] } }).exec() : 0;
    response.json({ success: true, data: { openTasks } });
  } catch (error) { next(error); }
});
taskRouter.get("/scope", getTaskScopeController);
taskRouter.get("/stats", getTaskStatsController);
taskRouter.get("/board", getTaskBoardController);
taskRouter.get("/", listTasksController);
taskRouter.post("/", createTaskController);

taskRouter.patch(
  "/:id/progress",
  updateTaskProgressController,
);

taskRouter.patch(
  "/:id/kpis/:kpiId/value",
  submitTaskKpiValueController,
);

taskRouter.post(
  "/:id/kpis/:kpiId/file",
  uploadTaskKpiFileMiddleware,
  uploadTaskKpiFileController,
);

taskRouter.get(
  "/:id/kpis/:kpiId/file",
  downloadTaskKpiFileController,
);

taskRouter.get(
  "/:id/comments",
  listTaskCommentsController,
);

taskRouter.post(
  "/:id/comments",
  addTaskCommentController,
);

taskRouter.get(
  "/:id/activity",
  listTaskActivitiesController,
);

taskRouter.get(
  "/:id",
  getTaskController,
);

taskRouter.patch(
  "/:id",
  updateTaskController,
);
