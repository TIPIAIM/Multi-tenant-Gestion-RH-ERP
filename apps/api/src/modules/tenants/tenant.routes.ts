import { Router } from "express";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  checkTenantSlugAvailabilityController,
  getCurrentTenantController,
  getPublicTenantController,
  registerTenantController,
  selectTenantController,
} from "./tenant.controller.js";
import { tenantSelfRegistrationGuard } from "./tenant-registration.guard.js";

export const tenantRouter = Router();

// IMPORTANT : toutes les routes fixes restent avant /:slug.
tenantRouter.get(
  "/availability/:slug",
  checkTenantSlugAvailabilityController,
);

tenantRouter.post(
  "/register",
  tenantSelfRegistrationGuard,
  registerTenantController,
);

tenantRouter.post(
  "/select",
  selectTenantController,
);

tenantRouter.get(
  "/current",
  tenantContextMiddleware,
  getCurrentTenantController,
);

tenantRouter.get("/:slug", getPublicTenantController);
