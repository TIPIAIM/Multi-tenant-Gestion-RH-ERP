import { Router } from "express";
import {
  requireAuth,
  requirePermissions,
} from "../../middlewares/auth.middleware.js";
import {
  tenantContextMiddleware,
} from "../../middlewares/tenant-context.middleware.js";
import {
  createOrganizationUnitController,
  deleteOrganizationUnitController,
  getOrganizationTreeController,
  listOrganizationUnitsController,
  updateOrganizationUnitController,
} from "./organization.controller.js";

export const organizationRouter = Router();

organizationRouter.use(tenantContextMiddleware);
organizationRouter.use(requireAuth);

organizationRouter.get(
  "/",
  requirePermissions("ORG_VIEW"),
  listOrganizationUnitsController,
);

organizationRouter.get(
  "/tree",
  requirePermissions("ORG_VIEW"),
  getOrganizationTreeController,
);

organizationRouter.post(
  "/",
  requirePermissions("ORG_MANAGE"),
  createOrganizationUnitController,
);

organizationRouter.patch(
  "/:id",
  requirePermissions("ORG_MANAGE"),
  updateOrganizationUnitController,
);

organizationRouter.delete(
  "/:id",
  deleteOrganizationUnitController,
);
