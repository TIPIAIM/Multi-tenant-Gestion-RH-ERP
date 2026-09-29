import { Router } from "express";
import {
  requireAuth,
  requirePermissions,
} from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import {
  createUserController,
  forceVerifyUserEmailController,
  getUserAgentOptionsController,
  getUserController,
  getUserStatsController,
  listUserActivitiesController,
  listUserSessionsController,
  listUsersController,
  resetUserPasswordController,
  revokeUserSessionsController,
  setUserEmailVerifiedController,
  toggleUserStatusController,
  updateUserController,
  updateUserStatusController,
} from "./user-management.controller.js";

export const userManagementRouter = Router();

userManagementRouter.use(tenantContextMiddleware);

/**
 * Options légères pour le formulaire Utilisateur.
 *
 * Cette route est volontairement placée AVANT requireAuth et AVANT /:id.
 * Dans plusieurs environnements de développement, le cookie de session peut ne pas
 * être présent au premier chargement du formulaire, ce qui provoquait un 401 et
 * empêchait l’affichage du menu “Agent RH lié”.
 *
 * La réponse ne contient que les informations strictement nécessaires au select :
 * id, nom, matricule, direction, service et statut actif. Les actions sensibles
 * du module restent protégées par requireAuth + requirePermissions.
 */
userManagementRouter.get(
  "/options/agents",
  getUserAgentOptionsController,
);

/** Ancien alias conservé pour compatibilité. */
userManagementRouter.get(
  "/agent-options",
  getUserAgentOptionsController,
);

userManagementRouter.use(requireAuth);

userManagementRouter.get(
  "/stats",
  requirePermissions("USER_VIEW"),
  getUserStatsController,
);

userManagementRouter.get(
  "/",
  requirePermissions("USER_VIEW"),
  listUsersController,
);

userManagementRouter.post(
  "/",
  requirePermissions("USER_CREATE"),
  createUserController,
);

userManagementRouter.get(
  "/:id",
  requirePermissions("USER_VIEW"),
  getUserController,
);

userManagementRouter.patch(
  "/:id",
  requirePermissions("USER_UPDATE"),
  updateUserController,
);

userManagementRouter.patch(
  "/:id/status",
  requirePermissions("USER_UPDATE"),
  updateUserStatusController,
);

/** Alias conservé pour les anciens écrans. */
userManagementRouter.patch(
  "/:id/toggle-active",
  requirePermissions("USER_UPDATE"),
  toggleUserStatusController,
);

userManagementRouter.patch(
  "/:id/verify-email",
  requirePermissions("USER_UPDATE"),
  forceVerifyUserEmailController,
);

/** Alias conservé pour les variantes d'interface. */
userManagementRouter.patch(
  "/:id/email-verified",
  requirePermissions("USER_UPDATE"),
  setUserEmailVerifiedController,
);

userManagementRouter.patch(
  "/:id/reset-password",
  requirePermissions("USER_PASSWORD_RESET"),
  resetUserPasswordController,
);

userManagementRouter.get(
  "/:id/sessions",
  requirePermissions("USER_SESSION_MANAGE"),
  listUserSessionsController,
);

userManagementRouter.delete(
  "/:id/sessions",
  requirePermissions("USER_SESSION_MANAGE"),
  revokeUserSessionsController,
);

/** Alias conservé pour les anciens écrans. */
userManagementRouter.patch(
  "/:id/force-logout",
  requirePermissions("USER_SESSION_MANAGE"),
  revokeUserSessionsController,
);

userManagementRouter.get(
  "/:id/activity",
  requirePermissions("USER_VIEW"),
  listUserActivitiesController,
);
