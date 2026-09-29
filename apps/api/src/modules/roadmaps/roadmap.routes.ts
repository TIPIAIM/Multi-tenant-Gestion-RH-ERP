import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  approveRoadmapController,
  closeRoadmapController,
  createRoadmapController,
  deleteRoadmapController,
  downloadKpiFileController,
  getRoadmapController,
  getRoadmapScopeController,
  getRoadmapStatsController,
  listRoadmapActivitiesController,
  listRoadmapsController,
  returnRoadmapController,
  reviewItemKpiController,
  submitItemKpiController,
  submitRoadmapController,
  updateRoadmapController,
} from "./roadmap.controller.js";
import { roadmapKpiUpload } from "./roadmap.upload.js";

export const roadmapRouter = Router();

roadmapRouter.use(tenantContextMiddleware);
roadmapRouter.use(requireAuth);

/**
 * Routes fixes AVANT les routes dynamiques /:id.
 * Sinon /scope est interprété comme un id MongoDB et provoque une erreur 400.
 */
roadmapRouter.get("/scope", getRoadmapScopeController);
roadmapRouter.get("/stats", getRoadmapStatsController);
roadmapRouter.get("/", listRoadmapsController);
roadmapRouter.post("/", createRoadmapController);

roadmapRouter.get(
  "/:id/activity",
  listRoadmapActivitiesController,
);

roadmapRouter.post(
  "/:id/submit",
  submitRoadmapController,
);

roadmapRouter.post(
  "/:id/approve",
  approveRoadmapController,
);

roadmapRouter.post(
  "/:id/return",
  returnRoadmapController,
);

roadmapRouter.post(
  "/:id/close",
  closeRoadmapController,
);

roadmapRouter.post(
  "/:id/items/:itemId/kpi",
  roadmapKpiUpload.single("kpiFile"),
  submitItemKpiController,
);

roadmapRouter.post(
  "/:id/items/:itemId/review",
  reviewItemKpiController,
);

roadmapRouter.get(
  "/:id/items/:itemId/kpi-file",
  downloadKpiFileController,
);

roadmapRouter.get("/:id", getRoadmapController);

roadmapRouter.patch("/:id", updateRoadmapController);

roadmapRouter.delete("/:id", deleteRoadmapController);