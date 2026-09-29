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

taskRouter.use(tenantContextMiddleware);
taskRouter.use(requireAuth);

/**
 * TENANT_ADMIN : lecture/écriture globale.
 * DIRECTION : lecture/écriture dans sa Direction.
 * SERVICE_MANAGER : lecture/écriture dans son Service.
 * AGENT : lecture de ses propres tâches + progression + dépôt KPI.
 * RH_MANAGER : lecture globale uniquement ; téléchargement des preuves KPI autorisé.
 */
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
