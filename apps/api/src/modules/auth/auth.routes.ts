import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  changePasswordController,
  getMeController,
  loginController,
  logoutController,
  refreshController,
  restoreSessionController,
} from "./auth.controller.js";

export const authRouter = Router();

/**
 * Restauration silencieuse de session.
 *
 * Cette route renvoie toujours 200 lorsqu'aucune session n'existe :
 * { authenticated: false, user: null }
 *
 * Elle évite les 401 normaux de /me puis /refresh à chaque ouverture
 * de l'application lorsqu'un utilisateur n'est simplement pas connecté.
 */
authRouter.get("/session", restoreSessionController);

/**
 * Login public : le tenant est résolu à partir de x-tenant-slug,
 * du cookie de sélection, puis du tenant historique par défaut.
 */
authRouter.post(
  "/login",
  tenantContextMiddleware,
  loginController,
);

authRouter.post(
  "/refresh",
  tenantContextMiddleware,
  refreshController,
);

/**
 * Pour les routes authentifiées, requireAuth passe avant le contexte tenant.
 * Le tenant contenu dans le JWT devient ainsi la source de vérité.
 */
authRouter.get(
  "/me",
  requireAuth,
  tenantContextMiddleware,
  getMeController,
);

authRouter.post(
  "/change-password",
  requireAuth,
  tenantContextMiddleware,
  changePasswordController,
);

authRouter.post(
  "/logout",
  tenantContextMiddleware,
  logoutController,
);
