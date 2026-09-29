import { pipeline } from "node:stream/promises";
import type {
  NextFunction,
  Request,
  Response,
} from "express";
import { AppError } from "../../core/errors/app-error.js";
import {
  agentDocumentParamsSchema,
  agentDocumentUploadMetadataSchema,
  agentIdParamsSchema,
  listAgentDocumentsQuerySchema,
} from "./agent-document.schema.js";
import {
  archiveAgentDocument,
  getAgentDocumentDelivery,
  listAgentDocuments,
  registerAgentDocumentAccess,
  restoreAgentDocument,
  uploadAgentDocument,
} from "./agent-document.service.js";

function getTenantOrThrow(request: Request) {
  if (!request.tenant) {
    throw new AppError(
      "Le contexte organisationnel est introuvable.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  return request.tenant;
}

function getAuthenticatedUserIdOrThrow(
  request: Request,
): string {
  if (!request.auth?.userId) {
    throw new AppError(
      "Authentification requise.",
      401,
      "AUTH_REQUIRED",
    );
  }

  return request.auth.userId;
}

function makeContentDisposition(
  fileName: string,
  mode: "inline" | "attachment",
): string {
  const safeFileName = fileName
    .replace(/[\r\n"]/g, "_")
    .replace(/[\\/]/g, "_")
    .trim();

  const fallbackName = safeFileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[;"]/g, "_") || "document";

  const encodedName = encodeURIComponent(
    safeFileName || "document",
  );

  return `${mode}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
}

async function sendAgentDocument(
  request: Request,
  response: Response,
  next: NextFunction,
  mode: "VIEW" | "DOWNLOAD",
): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);

    const { id, documentId } =
      agentDocumentParamsSchema.parse(request.params);

    const documentDelivery =
      await getAgentDocumentDelivery({
        tenant,
        agentId: id,
        documentId,
      });

    response.status(200);

    response.setHeader(
      "Cache-Control",
      "private, no-store, max-age=0",
    );

    response.setHeader("Pragma", "no-cache");

    response.setHeader(
      "X-Content-Type-Options",
      "nosniff",
    );

    response.setHeader(
      "Referrer-Policy",
      "no-referrer",
    );

    response.setHeader(
      "Content-Type",
      documentDelivery.document.mimeType ||
        "application/octet-stream",
    );

    response.setHeader(
      "Content-Disposition",
      makeContentDisposition(
        documentDelivery.document.originalFileName,
        mode === "VIEW" ? "inline" : "attachment",
      ),
    );

    await registerAgentDocumentAccess(
      tenant,
      id,
      documentId,
      mode,
    );

    await pipeline(
      documentDelivery.stream,
      response,
    );
  } catch (error) {
    if (!response.headersSent) {
      next(error);

      return;
    }

    response.destroy(
      error instanceof Error
        ? error
        : new Error("Flux document interrompu."),
    );
  }
}

export async function listAgentDocumentsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);

    const { id } = agentIdParamsSchema.parse(
      request.params,
    );

    const query = listAgentDocumentsQuerySchema.parse(
      request.query,
    );

    const result = await listAgentDocuments(
      tenant,
      id,
      query,
    );

    response.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadAgentDocumentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);

    const uploadedByUserId =
      getAuthenticatedUserIdOrThrow(request);

    const { id } = agentIdParamsSchema.parse(
      request.params,
    );

    const metadata = agentDocumentUploadMetadataSchema.parse(
      request.body,
    );

    if (!request.file) {
      throw new AppError(
        "Aucun fichier n'a été transmis.",
        400,
        "AGENT_DOCUMENT_FILE_REQUIRED",
      );
    }

    const document = await uploadAgentDocument({
      tenant,
      agentId: id,
      metadata,
      file: request.file,
      uploadedByUserId,
    });

    response.status(201).json({
      success: true,
      data: {
        document,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function viewAgentDocumentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await sendAgentDocument(
    request,
    response,
    next,
    "VIEW",
  );
}

export async function downloadAgentDocumentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await sendAgentDocument(
    request,
    response,
    next,
    "DOWNLOAD",
  );
}

export async function archiveAgentDocumentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);

    const archivedByUserId =
      getAuthenticatedUserIdOrThrow(request);

    const { id, documentId } =
      agentDocumentParamsSchema.parse(request.params);

    const document = await archiveAgentDocument(
      tenant,
      id,
      documentId,
      archivedByUserId,
    );

    response.status(200).json({
      success: true,
      data: {
        document,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function restoreAgentDocumentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);

    const restoredByUserId =
      getAuthenticatedUserIdOrThrow(request);

    const { id, documentId } =
      agentDocumentParamsSchema.parse(request.params);

    const document = await restoreAgentDocument(
      tenant,
      id,
      documentId,
      restoredByUserId,
    );

    response.status(200).json({
      success: true,
      data: {
        document,
      },
    });
  } catch (error) {
    next(error);
  }
}