import { Router } from "express";
import { userManagementRouter } from "./user-management.routes.js";

/**
 * Route officielle conservée pour le frontend : /api/v1/admin-users.
 * Le moteur métier reste mutualisé dans user-management.routes.ts.
 */
export const adminUsersRouter = Router();

adminUsersRouter.use("/", userManagementRouter);
