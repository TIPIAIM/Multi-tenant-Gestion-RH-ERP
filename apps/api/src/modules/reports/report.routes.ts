import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  archiveManagementReportController,
  deleteManagementReportController,
  exportManagementReportsCsvController,
  generateManagementReportController,
  getManagementReportController,
  getManagementReportScopeController,
  getManagementReportStatsController,
  listManagementReportsController,
  previewManagementReportController,
  recomputeManagementReportController,
  updateManagementReportController,
  validateManagementReportController,
} from "./report.controller.js";

export const managementReportRouter = Router();
managementReportRouter.use(tenantContextMiddleware);
managementReportRouter.use(requireAuth);

// Toujours déclarer les routes fixes avant /:id.
managementReportRouter.get("/stats", getManagementReportStatsController);
managementReportRouter.get("/scope", getManagementReportScopeController);
managementReportRouter.post("/preview", previewManagementReportController);
managementReportRouter.get("/export.csv", exportManagementReportsCsvController);
managementReportRouter.get("/", listManagementReportsController);
managementReportRouter.post("/generate", generateManagementReportController);

managementReportRouter.get("/:id", getManagementReportController);
managementReportRouter.patch("/:id", updateManagementReportController);
managementReportRouter.delete("/:id", deleteManagementReportController);
managementReportRouter.post("/:id/recompute", recomputeManagementReportController);
managementReportRouter.post("/:id/validate", validateManagementReportController);
managementReportRouter.post("/:id/archive", archiveManagementReportController);
