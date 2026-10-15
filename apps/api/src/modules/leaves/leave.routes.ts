import { requireTenantFeature } from "../../middlewares/feature.middleware.js";
import { Router } from "express";
import {
  requireAuth,
  requirePermissions,
} from "../../middlewares/auth.middleware.js";
import {
  tenantContextMiddleware,
} from "../../middlewares/tenant-context.middleware.js";
import {
  cancelLeaveRequestController,
  createLeaveRequestController,
  finalReviewLeaveRequestController,
  getLeaveDashboardController,
  getLeaveRequestController,
  listLeaveActivitiesController,
  listLeaveBalancesController,
  listLeaveCalendarController,
  listLeaveRequestsController,
  listMyLeaveBalancesController,
  managerReviewLeaveRequestController,
  submitLeaveRequestController,
  updateLeaveRequestController,
  upsertLeaveBalanceController,
} from "./leave.controller.js";

export const leaveRouter = Router();

leaveRouter.use(requireAuth);
leaveRouter.use(tenantContextMiddleware);
leaveRouter.use(requireTenantFeature("leave"));

leaveRouter.get(
  "/dashboard",
  requirePermissions("LEAVE_VIEW"),
  getLeaveDashboardController,
);

leaveRouter.get(
  "/balances/me",
  requirePermissions("LEAVE_BALANCE_VIEW"),
  listMyLeaveBalancesController,
);

leaveRouter.get(
  "/balances",
  requirePermissions("LEAVE_BALANCE_VIEW"),
  listLeaveBalancesController,
);

leaveRouter.put(
  "/balances",
  requirePermissions("LEAVE_BALANCE_MANAGE"),
  upsertLeaveBalanceController,
);

leaveRouter.get(
  "/calendar",
  requirePermissions("LEAVE_VIEW"),
  listLeaveCalendarController,
);

leaveRouter.get(
  "/requests",
  requirePermissions("LEAVE_VIEW"),
  listLeaveRequestsController,
);

leaveRouter.post(
  "/requests",
  requirePermissions("LEAVE_REQUEST_CREATE"),
  createLeaveRequestController,
);

leaveRouter.get(
  "/requests/:id/activity",
  requirePermissions("LEAVE_VIEW"),
  listLeaveActivitiesController,
);

leaveRouter.post(
  "/requests/:id/submit",
  requirePermissions("LEAVE_REQUEST_CREATE"),
  submitLeaveRequestController,
);

leaveRouter.post(
  "/requests/:id/manager-review",
  requirePermissions("LEAVE_REQUEST_REVIEW"),
  managerReviewLeaveRequestController,
);

leaveRouter.post(
  "/requests/:id/final-review",
  requirePermissions("LEAVE_MANAGE"),
  finalReviewLeaveRequestController,
);

leaveRouter.post(
  "/requests/:id/cancel",
  requirePermissions("LEAVE_REQUEST_CREATE"),
  cancelLeaveRequestController,
);

leaveRouter.get(
  "/requests/:id",
  requirePermissions("LEAVE_VIEW"),
  getLeaveRequestController,
);

leaveRouter.patch(
  "/requests/:id",
  requirePermissions("LEAVE_REQUEST_CREATE"),
  updateLeaveRequestController,
);
