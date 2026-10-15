import { requireTenantFeature } from "../../middlewares/feature.middleware.js";
import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  createEvaluationController,
  deleteEvaluationController,
  exportEvaluationsCsvController,
  getEvaluationController,
  getEvaluationStatsController,
  listEvaluationsController,
  recomputeEvaluationIntelligenceController,
  submitManagerReviewController,
  submitSelfReviewController,
  updateEvaluationController,
  validateEvaluationHrController,
} from "./evaluation.controller.js";

export const evaluationRouter = Router();

evaluationRouter.use(requireAuth);
evaluationRouter.use(tenantContextMiddleware);
evaluationRouter.use(requireTenantFeature("evaluations"));

/**
 * Les permissions fines sont volontairement traitées dans evaluation.access.ts
 * et evaluation.service.ts afin de conserver une logique métier identique aux
 * modules Agents, Tâches, Pointage et Feuilles de route.
 */
evaluationRouter.get("/stats", getEvaluationStatsController);
evaluationRouter.get("/export.csv", exportEvaluationsCsvController);
evaluationRouter.get("/", listEvaluationsController);
evaluationRouter.post("/", createEvaluationController);

evaluationRouter.get("/:id", getEvaluationController);
evaluationRouter.patch("/:id", updateEvaluationController);
evaluationRouter.delete("/:id", deleteEvaluationController);
evaluationRouter.post("/:id/recompute", recomputeEvaluationIntelligenceController);

evaluationRouter.post("/:id/self-review", submitSelfReviewController);
evaluationRouter.post("/:id/manager-review", submitManagerReviewController);
evaluationRouter.post("/:id/hr-validation", validateEvaluationHrController);
