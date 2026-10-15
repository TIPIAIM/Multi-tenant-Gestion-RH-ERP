import { env } from "../../config/env.js";
import { Router, type RequestHandler } from "express";
import { AppError } from "../../core/errors/app-error.js";
import { settingsLogoUploadMiddleware } from "./settings-logo.upload.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  uploadSettingsLogoController,
  resetSettingsAppearanceController,
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

// Les lectures publiques restent possibles pour un espace explicitement choisi.
// Lorsqu’un JWT valide existe, son tenant prévaut sur le header et le cookie.
const optionalAuth: RequestHandler = (request, response, next) => {
  void requireAuth(request, response, () => next());
};
settingsRouter.get("/public", optionalAuth, tenantContextMiddleware, getPublicSettingsController);
settingsRouter.use(requireAuth, tenantContextMiddleware);
settingsRouter.use((request, _response, next) => {
  const origin = request.get("origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && origin && origin !== new URL(env.webUrl).origin) {
    next(new AppError("Origine de la requête non autorisée.", 403, "SETTINGS_ORIGIN_FORBIDDEN")); return;
  }
  next();
});
const adminOnly: RequestHandler = (request, _response, next) => {
  if (request.auth?.role !== "TENANT_ADMIN") { next(new AppError("Seul l’administrateur peut modifier l’apparence.", 403, "SETTINGS_SECTION_MANAGE_FORBIDDEN")); return; }
  next();
};
settingsRouter.post("/branding/logo", adminOnly, settingsLogoUploadMiddleware, uploadSettingsLogoController);
settingsRouter.post("/draft/branding/reset", adminOnly, resetSettingsAppearanceController);

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
