import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  discardSettingsDraftController,
  exportSettingsController,
  getPublicSettingsController,
  getSettingsController,
  getSettingsImpactController,
  getSettingsRevisionController,
  listSettingsHistoryController,
  publishSettingsController,
  restoreSettingsRevisionController,
  saveSettingsSectionController,
  validateSettingsDraftController,
} from "./settings.controller.js";

export const settingsRouter = Router();

settingsRouter.use(tenantContextMiddleware);
settingsRouter.get("/public", getPublicSettingsController);
settingsRouter.use(requireAuth);

settingsRouter.get("/", getSettingsController);
settingsRouter.get("/impact", getSettingsImpactController);
settingsRouter.get("/history", listSettingsHistoryController);
settingsRouter.get("/history/:version", getSettingsRevisionController);
settingsRouter.get("/export.json", exportSettingsController);
settingsRouter.patch("/draft/:section", saveSettingsSectionController);
settingsRouter.post("/draft/validate", validateSettingsDraftController);
settingsRouter.post("/draft/discard", discardSettingsDraftController);
settingsRouter.post("/publish", publishSettingsController);
settingsRouter.post("/history/:version/restore", restoreSettingsRevisionController);
