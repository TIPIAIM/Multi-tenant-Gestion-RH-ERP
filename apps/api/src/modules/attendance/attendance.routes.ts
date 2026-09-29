import { Router } from "express";
import {
  requireAuth,
  requirePermissions,
} from "../../middlewares/auth.middleware.js";
import {
  tenantContextMiddleware,
} from "../../middlewares/tenant-context.middleware.js";
import {
  checkInSelfController,
  checkOutSelfController,
  createManualAttendanceController,
  deleteAttendanceController,
  getAttendanceController,
  getAttendanceStatsController,
  getMyAttendanceTodayController,
  listAttendanceEventsController,
  listAttendancesController,
  updateAttendanceController,
} from "./attendance.controller.js";

export const attendanceRouter = Router();

attendanceRouter.use(tenantContextMiddleware);
attendanceRouter.use(requireAuth);

attendanceRouter.get(
  "/stats",
  requirePermissions("ATTENDANCE_VIEW"),
  getAttendanceStatsController,
);

attendanceRouter.get(
  "/me/today",
  getMyAttendanceTodayController,
);

attendanceRouter.post(
  "/check-in",
  checkInSelfController,
);

attendanceRouter.post(
  "/check-out",
  checkOutSelfController,
);

attendanceRouter.get(
  "/",
  requirePermissions("ATTENDANCE_VIEW"),
  listAttendancesController,
);

attendanceRouter.post(
  "/manual",
  requirePermissions("ATTENDANCE_MANAGE"),
  createManualAttendanceController,
);

attendanceRouter.get(
  "/:id/events",
  requirePermissions("ATTENDANCE_VIEW"),
  listAttendanceEventsController,
);

attendanceRouter.get(
  "/:id",
  requirePermissions("ATTENDANCE_VIEW"),
  getAttendanceController,
);

attendanceRouter.patch(
  "/:id",
  requirePermissions("ATTENDANCE_MANAGE"),
  updateAttendanceController,
);
attendanceRouter.delete(
  "/:id",
  requirePermissions("ATTENDANCE_MANAGE"),
  deleteAttendanceController,
);
