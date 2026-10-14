import {
  pipeline,
} from "node:stream/promises";
import type {
  NextFunction,
  Request,
  Response,
} from "express";
import { AppError } from "../../core/errors/app-error.js";
import {
  pieceTransferReactionSchema,
  forwardToAgentsSchema,
  markPieceTransferReadSchema,
  adminMessageFileParamsSchema,
  adminMessageParamsSchema,
  createPieceTransferMessageSchema,
  createPieceTransferSchema,
  listPieceTransferMessagesQuerySchema,
  listPieceTransfersQuerySchema,
  pieceTransferIdParamsSchema,
  pieceTransferMessageFileParamsSchema,
  pieceTransferMessageParamsSchema,
  recipientOptionsQuerySchema,
  updatePieceTransferMessageSchema,
} from "./piece-transfer.schema.js";
import {
  setPieceTransferReaction,
  forwardPieceTransferToAgents,
  getPieceTransferNotifications,
  markPieceTransferMessagesRead,
  createPieceTransfer,
  deleteMessageFileAsAdmin,
  deletePieceTransferMessageAsAdmin,
  deleteTransferRootFileAsAdmin,
  getAdminCommunicationOverview,
  getPieceTransferDelivery,
  getPieceTransferDetail,
  getPieceTransferMessageFileDelivery,
  getPieceTransferStats,
  listAdminCommunicationFiles,
  listMyCommunicationFiles,
  listMyCommunicationMessages,
  listAdminCommunicationMessages,
  listPieceTransferInbox,
  listPieceTransferMessages,
  listPieceTransferRecipients,
  listPieceTransferSent,
  revokePieceTransfer,
  sendPieceTransferMessage,
  updatePieceTransferMessage,
} from "./piece-transfer.service.js";

function context(
  request: Request,
) {
  if (
    !request.tenant
  ) {
    throw new AppError(
      "Le contexte organisationnel est introuvable.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  if (
    !request.auth?.userId ||
    !request.auth?.role
  ) {
    throw new AppError(
      "Authentification requise.",
      401,
      "AUTH_REQUIRED",
    );
  }

  return {
    tenant:
      request.tenant,

    actor: {
      userId:
        request.auth.userId,

      role:
        request.auth.role,
    },
  };
}

function makeContentDisposition(
  fileName: string,
  mode:
    | "inline"
    | "attachment",
): string {
  const safe =
    fileName
      .replace(
        /[\r\n"]/g,
        "_",
      )
      .replace(
        /[\\/]/g,
        "_",
      )
      .trim();

  const fallback =
    safe
      .normalize(
        "NFD",
      )
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .replace(
        /[^\x20-\x7E]/g,
        "_",
      )
      .replace(
        /[;"]/g,
        "_",
      ) ||
    "piece";

  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe || "piece")}`;
}

function setSecureFileHeaders(
  response: Response,
  fileName: string,
  mimeType: string,
  mode:
    | "VIEW"
    | "DOWNLOAD",
  contentLength?: number,
): void {
  response.status(
    200,
  );

  response.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0",
  );

  response.setHeader(
    "Pragma",
    "no-cache",
  );

  response.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );

  response.setHeader(
    "Referrer-Policy",
    "no-referrer",
  );

  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; sandbox",
  );

  response.setHeader(
    "Content-Type",
    mimeType ||
      "application/octet-stream",
  );

  response.setHeader(
    "Content-Disposition",
    makeContentDisposition(
      fileName,
      mode ===
        "VIEW"
        ? "inline"
        : "attachment",
    ),
  );

  if (
    contentLength
  ) {
    response.setHeader(
      "Content-Length",
      String(
        contentLength,
      ),
    );
  }
}

async function streamRootFile(
  request: Request,
  response: Response,
  next: NextFunction,
  mode:
    | "VIEW"
    | "DOWNLOAD",
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      id,
    } =
      pieceTransferIdParamsSchema.parse(
        request.params,
      );

    const delivery =
      await getPieceTransferDelivery(
        tenant,
        actor,
        id,
        mode,
      );

    setSecureFileHeaders(
      response,
      delivery.transfer
        .originalFileName ||
        "piece",
      delivery.transfer
        .mimeType ||
        "application/octet-stream",
      mode,
      delivery.contentLength,
    );

    await pipeline(
      delivery.stream,
      response,
    );
  } catch (
    error
  ) {
    if (
      !response.headersSent
    ) {
      next(
        error,
      );
      return;
    }

    response.destroy(
      error instanceof
        Error
        ? error
        : new Error(
            "Flux de pièce interrompu.",
          ),
    );
  }
}

async function streamMessageFile(
  request: Request,
  response: Response,
  next: NextFunction,
  mode:
    | "VIEW"
    | "DOWNLOAD",
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      id,
      messageId,
      fileIndex,
    } =
      pieceTransferMessageFileParamsSchema.parse(
        request.params,
      );

    const delivery =
      await getPieceTransferMessageFileDelivery(
        tenant,
        actor,
        id,
        messageId,
        fileIndex,
        mode,
      );

    setSecureFileHeaders(
      response,
      delivery.fileName,
      delivery.mimeType,
      mode,
      delivery.contentLength,
    );

    await pipeline(
      delivery.stream,
      response,
    );
  } catch (
    error
  ) {
    if (
      !response.headersSent
    ) {
      next(
        error,
      );
      return;
    }

    response.destroy(
      error instanceof
        Error
        ? error
        : new Error(
            "Flux de pièce interrompu.",
          ),
    );
  }
}

export async function listPieceTransferRecipientsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const query =
      recipientOptionsQuerySchema.parse(
        request.query,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data:
          await listPieceTransferRecipients(
            tenant,
            actor,
            query,
          ),
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function getPieceTransferStatsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data: {
          stats:
            await getPieceTransferStats(
              tenant,
              actor,
            ),
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function listPieceTransferInboxController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const query =
      listPieceTransfersQuerySchema.parse(
        request.query,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data:
          await listPieceTransferInbox(
            tenant,
            actor,
            query,
          ),
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function listPieceTransferSentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const query =
      listPieceTransfersQuerySchema.parse(
        request.query,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data:
          await listPieceTransferSent(
            tenant,
            actor,
            query,
          ),
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function createPieceTransferController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const metadata =
      createPieceTransferSchema.parse(
        request.body,
      );

    const transfer =
      await createPieceTransfer({
        tenant,
        actor,
        metadata,
        file:
          request.file,
      });

    response
      .status(
        201,
      )
      .json({
        success:
          true,

        data: {
          transfer,
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function getPieceTransferController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      id,
    } =
      pieceTransferIdParamsSchema.parse(
        request.params,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data: {
          transfer:
            await getPieceTransferDetail(
              tenant,
              actor,
              id,
            ),
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function viewPieceTransferController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await streamRootFile(
    request,
    response,
    next,
    "VIEW",
  );
}

export async function downloadPieceTransferController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await streamRootFile(
    request,
    response,
    next,
    "DOWNLOAD",
  );
}

export async function revokePieceTransferController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      id,
    } =
      pieceTransferIdParamsSchema.parse(
        request.params,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data: {
          transfer:
            await revokePieceTransfer(
              tenant,
              actor,
              id,
            ),
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function listPieceTransferMessagesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      id,
    } =
      pieceTransferIdParamsSchema.parse(
        request.params,
      );

    const query =
      listPieceTransferMessagesQuerySchema.parse(
        request.query,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data:
          await listPieceTransferMessages(
            tenant,
            actor,
            id,
            query,
          ),
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function sendPieceTransferMessageController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      id,
    } =
      pieceTransferIdParamsSchema.parse(
        request.params,
      );

    const metadata =
      createPieceTransferMessageSchema.parse(
        request.body,
      );

    response
      .status(
        201,
      )
      .json({
        success:
          true,

        data: {
          message:
            await sendPieceTransferMessage({
              tenant,
              actor,
              transferId:
                id,
              metadata,
              files:
                Array.isArray(
                  request.files,
                )
                  ? request.files
                  : [],
            }),
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function updatePieceTransferMessageController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      id,
      messageId,
    } =
      pieceTransferMessageParamsSchema.parse(
        request.params,
      );

    const input =
      updatePieceTransferMessageSchema.parse(
        request.body,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data: {
          message:
            await updatePieceTransferMessage(
              tenant,
              actor,
              id,
              messageId,
              input,
            ),
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function viewPieceTransferMessageFileController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await streamMessageFile(
    request,
    response,
    next,
    "VIEW",
  );
}

export async function downloadPieceTransferMessageFileController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await streamMessageFile(
    request,
    response,
    next,
    "DOWNLOAD",
  );
}

export async function getAdminCommunicationOverviewController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data:
          await getAdminCommunicationOverview(
            tenant,
            actor,
          ),
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function listAdminCommunicationFilesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const query =
      listPieceTransfersQuerySchema.parse(
        request.query,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data:
          await listAdminCommunicationFiles(
            tenant,
            actor,
            query,
          ),
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function listAdminCommunicationMessagesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const query =
      listPieceTransfersQuerySchema.parse(
        request.query,
      );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data:
          await listAdminCommunicationMessages(
            tenant,
            actor,
            query,
          ),
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function deleteTransferRootFileAsAdminController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      id,
    } =
      pieceTransferIdParamsSchema.parse(
        request.params,
      );

    await deleteTransferRootFileAsAdmin(
      tenant,
      actor,
      id,
    );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data: {
          deleted:
            true,
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function deleteMessageFileAsAdminController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      messageId,
      fileIndex,
    } =
      adminMessageFileParamsSchema.parse(
        request.params,
      );

    await deleteMessageFileAsAdmin(
      tenant,
      actor,
      messageId,
      fileIndex,
    );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data: {
          deleted:
            true,
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function deletePieceTransferMessageAsAdminController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      tenant,
      actor,
    } =
      context(
        request,
      );

    const {
      messageId,
    } =
      adminMessageParamsSchema.parse(
        request.params,
      );

    await deletePieceTransferMessageAsAdmin(
      tenant,
      actor,
      messageId,
    );

    response
      .status(
        200,
      )
      .json({
        success:
          true,

        data: {
          deleted:
            true,
        },
      });
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

export async function listMyCommunicationFilesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = context(request);
    const query = listPieceTransfersQuerySchema.parse(request.query);
    const direction = request.query.direction;
    if (direction !== "SENT" && direction !== "INBOX") {
      throw new AppError("Choisissez les fichiers envoyés ou reçus.", 400, "PIECE_TRANSFER_DIRECTION_INVALID");
    }
    const result = await listMyCommunicationFiles(tenant, actor, query, direction);
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function listMyCommunicationMessagesController(
  request: Request, response: Response, next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = context(request);
    const query = listPieceTransfersQuerySchema.parse(request.query);
    const direction = request.query.direction;
    if (direction !== "SENT" && direction !== "INBOX") {
      throw new AppError("Choisissez les messages envoyés ou reçus.", 400, "PIECE_TRANSFER_DIRECTION_INVALID");
    }
    const result = await listMyCommunicationMessages(tenant, actor, query, direction);
    response.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getPieceTransferNotificationsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const { tenant, actor } = context(request);
    const query = listPieceTransfersQuerySchema.parse(request.query);
    response.json({ success: true, data: await getPieceTransferNotifications(tenant, actor, query) });
  } catch (error) { next(error); }
}

export async function markPieceTransferReadController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const { tenant, actor } = context(request);
    const { id } = pieceTransferIdParamsSchema.parse(request.params);
    const { messageId } = markPieceTransferReadSchema.parse(request.body);
    await markPieceTransferMessagesRead(tenant, actor, id, messageId);
    response.json({ success: true, data: {} });
  } catch (error) { next(error); }
}

export async function setPieceTransferReactionController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const { tenant, actor } = context(request);
    const { id, messageId } = pieceTransferMessageParamsSchema.parse(request.params);
    const { emoji } = pieceTransferReactionSchema.parse(request.body);
    response.json({ success: true, data: { message: await setPieceTransferReaction(tenant, actor, id, messageId, emoji) } });
  } catch (error) { next(error); }
}
export async function forwardPieceTransferToAgentsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const { tenant, actor } = context(request);
    const { id, messageId } = pieceTransferMessageParamsSchema.parse(request.params);
    const { recipientUserIds, mode, groupName } = forwardToAgentsSchema.parse(request.body);
    response.status(201).json({ success: true, data: await forwardPieceTransferToAgents(tenant, actor, id, messageId, recipientUserIds, mode, groupName) });
  } catch (error) { next(error); }
}
