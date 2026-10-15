import { requireTenantFeature } from "../../middlewares/feature.middleware.js";
import { agentPhotoRouter } from "./agent-photo.js";
import { Router } from "express";
import {
  requireAuth,
  requirePermissions,
} from "../../middlewares/auth.middleware.js";
import {
  tenantContextMiddleware,
} from "../../middlewares/tenant-context.middleware.js";
import {
  addAgentHistoryController,
  createAgentController,
  deleteAgentController,
  getAgentController,
  getAgentScopeController,
  getAgentStatsController,
  listAgentsController,
  runAgentContractEndAlertsController,
  updateAgentController,
} from "./agent.controller.js";
import {
  archiveAgentDocumentController,
  downloadAgentDocumentController,
  listAgentDocumentsController,
  restoreAgentDocumentController,
  uploadAgentDocumentController,
  viewAgentDocumentController,
} from "../agent-documents/agent-document.controller.js";
import {
  uploadAgentDocumentMiddleware,
} from "../agent-documents/agent-document-upload.middleware.js";
import {
  startAgentContractEndAlertScheduler,
} from "./agent-contract-alert.service.js";

export const agentRouter = Router();

agentRouter.use(requireAuth);
agentRouter.use(tenantContextMiddleware);
agentRouter.use(requireTenantFeature("agents"));

startAgentContractEndAlertScheduler();

/**
 * Lecture Agents :
 * pas de requirePermissions("AGENT_VIEW") ici afin d'éviter le 403
 * pour les rôles Direction / Chef de service dont le périmètre est déjà
 * contrôlé finement dans agent.access.ts et agent.service.ts.
 */
agentRouter.get("/scope", getAgentScopeController);
agentRouter.get("/stats", getAgentStatsController);
agentRouter.get("/", listAgentsController);

agentRouter.post("/", createAgentController);

agentRouter.post(
  "/contract-alerts/run",
  requirePermissions("AGENT_MANAGE"),
  runAgentContractEndAlertsController,
);

agentRouter.use("/:id/documents", requireTenantFeature("documents"));

agentRouter.get(
  "/:id/documents",
  requirePermissions("AGENT_VIEW"),
  listAgentDocumentsController,
);

agentRouter.post(
  "/:id/documents",
  requirePermissions("AGENT_MANAGE"),
  uploadAgentDocumentMiddleware,
  uploadAgentDocumentController,
);

agentRouter.get(
  "/:id/documents/:documentId/view",
  requirePermissions("AGENT_VIEW"),
  viewAgentDocumentController,
);

agentRouter.get(
  "/:id/documents/:documentId/download",
  requirePermissions("AGENT_VIEW"),
  downloadAgentDocumentController,
);

agentRouter.delete(
  "/:id/documents/:documentId",
  requirePermissions("AGENT_MANAGE"),
  archiveAgentDocumentController,
);

agentRouter.patch(
  "/:id/documents/:documentId/restore",
  requirePermissions("AGENT_MANAGE"),
  restoreAgentDocumentController,
);

agentRouter.use("/:id/photo", agentPhotoRouter);

agentRouter.get("/:id", getAgentController);
agentRouter.patch("/:id", updateAgentController);
agentRouter.delete("/:id", deleteAgentController);
agentRouter.post("/:id/history", addAgentHistoryController);
