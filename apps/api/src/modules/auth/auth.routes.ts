import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  changePasswordController, getMeController, loginController,
  logoutController, refreshController, restoreSessionController,
} from "./auth.controller.js";

export const authRouter = Router();
authRouter.get("/session", restoreSessionController);
// Le login résout son tenant depuis les identifiants, sans cookie ni défaut.
authRouter.post("/login", loginController);
authRouter.post("/refresh", tenantContextMiddleware, refreshController);
authRouter.get("/me", requireAuth, tenantContextMiddleware, getMeController);
authRouter.post("/change-password", requireAuth, tenantContextMiddleware, changePasswordController);
authRouter.post("/logout", tenantContextMiddleware, logoutController);
