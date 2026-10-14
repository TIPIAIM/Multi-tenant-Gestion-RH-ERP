import {
  Router,
} from "express";
import {
  requireAuth,
} from "../../middlewares/auth.middleware.js";
import {
  tenantContextMiddleware,
} from "../../middlewares/tenant-context.middleware.js";
import {
  setPieceTransferReactionController,
  forwardPieceTransferToAgentsController,
  getPieceTransferNotificationsController,
  markPieceTransferReadController,
  createPieceTransferController,
  deleteMessageFileAsAdminController,
  deletePieceTransferMessageAsAdminController,
  deleteTransferRootFileAsAdminController,
  downloadPieceTransferController,
  downloadPieceTransferMessageFileController,
  getAdminCommunicationOverviewController,
  getPieceTransferController,
  getPieceTransferStatsController,
  listAdminCommunicationFilesController,
  listMyCommunicationFilesController,
  listMyCommunicationMessagesController,
  listAdminCommunicationMessagesController,
  listPieceTransferInboxController,
  listPieceTransferMessagesController,
  listPieceTransferRecipientsController,
  listPieceTransferSentController,
  revokePieceTransferController,
  sendPieceTransferMessageController,
  updatePieceTransferMessageController,
  viewPieceTransferController,
  viewPieceTransferMessageFileController,
} from "./piece-transfer.controller.js";
import {
  uploadPieceTransferMessageMiddleware,
  uploadPieceTransferMiddleware,
} from "./piece-transfer-upload.middleware.js";

export const pieceTransferRouter =
  Router();

pieceTransferRouter.use(
  tenantContextMiddleware,
);

pieceTransferRouter.use(
  requireAuth,
);

/* Routes fixes avant /:id */
pieceTransferRouter.get("/notifications", getPieceTransferNotificationsController);
pieceTransferRouter.post("/:id/read", markPieceTransferReadController);
pieceTransferRouter.get(
  "/recipients",
  listPieceTransferRecipientsController,
);

pieceTransferRouter.get(
  "/stats",
  getPieceTransferStatsController,
);

pieceTransferRouter.get(
  "/inbox",
  listPieceTransferInboxController,
);

pieceTransferRouter.get(
  "/sent",
  listPieceTransferSentController,
);

pieceTransferRouter.get(
  "/files",
  listMyCommunicationFilesController,
);

pieceTransferRouter.get(
  "/messages",
  listMyCommunicationMessagesController,
);

/* Supervision TENANT_ADMIN */
pieceTransferRouter.get(
  "/admin/overview",
  getAdminCommunicationOverviewController,
);

pieceTransferRouter.get(
  "/admin/files",
  listAdminCommunicationFilesController,
);

pieceTransferRouter.get(
  "/admin/messages",
  listAdminCommunicationMessagesController,
);

pieceTransferRouter.delete(
  "/admin/messages/:messageId",
  deletePieceTransferMessageAsAdminController,
);

pieceTransferRouter.delete(
  "/admin/messages/:messageId/files/:fileIndex",
  deleteMessageFileAsAdminController,
);

/* Nouvelle communication */
pieceTransferRouter.post(
  "/",
  uploadPieceTransferMiddleware,
  createPieceTransferController,
);

/* Communication */
pieceTransferRouter.get(
  "/:id",
  getPieceTransferController,
);

pieceTransferRouter.get(
  "/:id/view",
  viewPieceTransferController,
);

pieceTransferRouter.get(
  "/:id/download",
  downloadPieceTransferController,
);

pieceTransferRouter.post(
  "/:id/revoke",
  revokePieceTransferController,
);

pieceTransferRouter.delete(
  "/:id/file",
  deleteTransferRootFileAsAdminController,
);

/* Fil de messages */
pieceTransferRouter.get(
  "/:id/messages",
  listPieceTransferMessagesController,
);

pieceTransferRouter.post(
  "/:id/messages",
  uploadPieceTransferMessageMiddleware,
  sendPieceTransferMessageController,
);

pieceTransferRouter.patch(
  "/:id/messages/:messageId",
  updatePieceTransferMessageController,
);

pieceTransferRouter.get(
  "/:id/messages/:messageId/files/:fileIndex/view",
  viewPieceTransferMessageFileController,
);

pieceTransferRouter.get(
  "/:id/messages/:messageId/files/:fileIndex/download",
  downloadPieceTransferMessageFileController,
);

pieceTransferRouter.put("/:id/messages/:messageId/reaction", setPieceTransferReactionController);
pieceTransferRouter.post("/:id/messages/:messageId/forward-agents", forwardPieceTransferToAgentsController);
