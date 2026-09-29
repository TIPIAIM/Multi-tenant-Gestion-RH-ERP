import { Readable } from "node:stream";
import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import {
  destroyPrivateDocument,
  openPrivateAgentDocumentStream,
  uploadPrivateAgentDocument,
} from "../../config/cloudinary.js";
import { AgentModel } from "../agents/agent.model.js";
import type {
  TenantDocument,
} from "../tenants/tenant.types.js";
import {
  AgentDocumentFileModel,
} from "./agent-document.model.js";
import type {
  AgentDocumentUploadMetadata,
  ListAgentDocumentsQuery,
} from "./agent-document.schema.js";
import type {
  AgentDocumentFileDocument,
  PublicAgentDocumentFile,
} from "./agent-document.types.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeDocument(
  document: AgentDocumentFileDocument,
): PublicAgentDocumentFile {
  return {
    id: document.id,
    agentId: document.agentId.toString(),

    title: document.title,
    category: document.category,

    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    bytes: document.bytes,

    expiresAt: document.expiresAt?.toISOString(),

    status: document.status,

    viewCount: document.viewCount ?? 0,
    downloadCount: document.downloadCount ?? 0,

    lastViewedAt: document.lastViewedAt?.toISOString(),
    lastDownloadedAt:
      document.lastDownloadedAt?.toISOString(),

    archivedAt: document.archivedAt?.toISOString(),
    restoredAt: document.restoredAt?.toISOString(),

    uploadedByUserId:
      document.uploadedByUserId.toString(),

    createdAt: document.createdAt?.toISOString(),
    updatedAt: document.updatedAt?.toISOString(),
  };
}

async function ensureAgentExists(
  tenant: TenantDocument,
  agentId: string,
): Promise<void> {
  const agentExists = await (AgentModel as any).exists({
    _id: agentId,
    tenantId: tenant._id,
  });

  if (!agentExists) {
    throw new AppError(
      "L'agent demandé est introuvable.",
      404,
      "AGENT_NOT_FOUND",
    );
  }
}

export async function listAgentDocuments(
  tenant: TenantDocument,
  agentId: string,
  query: ListAgentDocumentsQuery,
): Promise<{
  documents: PublicAgentDocumentFile[];
  summary: {
    active: number;
    archived: number;
    expiringSoon: number;
    expired: number;
  };
}> {
  await ensureAgentExists(tenant, agentId);

  const filter: Record<string, any> = {
    tenantId: tenant._id,
    agentId,
    status: query.status,
  };

  if (query.search) {
    const searchPattern = new RegExp(
      escapeRegex(query.search),
      "i",
    );

    filter.$or = [
      { title: searchPattern },
      { originalFileName: searchPattern },
    ];
  }

  if (query.category) {
    filter.category = query.category;
  }

  const now = new Date();

  const nextThirtyDays = new Date(now);
  nextThirtyDays.setDate(nextThirtyDays.getDate() + 30);

  if (query.expiry === "EXPIRED") {
    filter.expiresAt = {
      $lt: now,
    };
  }

  if (query.expiry === "EXPIRING_30_DAYS") {
    filter.expiresAt = {
      $gte: now,
      $lte: nextThirtyDays,
    };
  }

  if (query.expiry === "NO_EXPIRY") {
    filter.expiresAt = {
      $exists: false,
    };
  }

  const activeFilter: Record<string, any> = {
    tenantId: tenant._id,
    agentId,
    status: "ACTIVE",
  };

  const [
    documents,
    active,
    archived,
    expiringSoon,
    expired,
  ] = await Promise.all([
    (AgentDocumentFileModel as any).find(filter)
      .sort({
        createdAt: -1,
      })
      .exec(),

    (AgentDocumentFileModel as any).countDocuments(
      activeFilter,
    ).exec(),

    (AgentDocumentFileModel as any).countDocuments({
      tenantId: tenant._id,
      agentId,
      status: "ARCHIVED",
    }).exec(),

    (AgentDocumentFileModel as any).countDocuments({
      ...activeFilter,
      expiresAt: {
        $gte: now,
        $lte: nextThirtyDays,
      },
    }).exec(),

    (AgentDocumentFileModel as any).countDocuments({
      ...activeFilter,
      expiresAt: {
        $lt: now,
      },
    }).exec(),
  ]);

  return {
    documents: documents.map(serializeDocument),

    summary: {
      active,
      archived,
      expiringSoon,
      expired,
    },
  };
}

type UploadAgentDocumentInput = {
  tenant: TenantDocument;
  agentId: string;
  metadata: AgentDocumentUploadMetadata;
  file: Express.Multer.File;
  uploadedByUserId: string;
};

export async function uploadAgentDocument(
  input: UploadAgentDocumentInput,
): Promise<PublicAgentDocumentFile> {
  await ensureAgentExists(input.tenant, input.agentId);

  const cloudinaryFile = await uploadPrivateAgentDocument({
    tenantSlug: input.tenant.slug,
    agentId: input.agentId,
    originalFileName: input.file.originalname,
    fileBuffer: input.file.buffer,
  });

  try {
    const document = await AgentDocumentFileModel.create({
      tenantId: input.tenant._id,
      agentId: new Types.ObjectId(input.agentId),

      title: input.metadata.title,
      category: input.metadata.category,

      originalFileName: input.file.originalname,
      mimeType: input.file.mimetype,
      bytes: cloudinaryFile.bytes,

      storagePublicId: cloudinaryFile.publicId,

      expiresAt: input.metadata.expiresAt
        ? new Date(input.metadata.expiresAt)
        : undefined,

      status: "ACTIVE",

      uploadedByUserId: new Types.ObjectId(
        input.uploadedByUserId,
      ),

      viewCount: 0,
      downloadCount: 0,
    });

    return serializeDocument(document);
  } catch (error) {
    await destroyPrivateDocument(
      cloudinaryFile.publicId,
    ).catch(() => undefined);

    throw error;
  }
}

type GetAgentDocumentDeliveryInput = {
  tenant: TenantDocument;
  agentId: string;
  documentId: string;
};

export async function getAgentDocumentDelivery(
  input: GetAgentDocumentDeliveryInput,
): Promise<{
  document: PublicAgentDocumentFile;
  stream: Readable;
}> {
  const document = await (AgentDocumentFileModel as any).findOne({
    _id: input.documentId,
    tenantId: input.tenant._id,
    agentId: input.agentId,
  }).exec();

  if (!document) {
    throw new AppError(
      "Le document demandé est introuvable.",
      404,
      "AGENT_DOCUMENT_NOT_FOUND",
    );
  }

  const source = await openPrivateAgentDocumentStream({
    publicId: document.storagePublicId,
    originalFileName: document.originalFileName,
  });

  return {
    document: serializeDocument(document),
    stream: source.stream,
  };
}

export async function registerAgentDocumentAccess(
  tenant: TenantDocument,
  agentId: string,
  documentId: string,
  action: "VIEW" | "DOWNLOAD",
): Promise<void> {
  if (action === "VIEW") {
    await (AgentDocumentFileModel as any).updateOne(
      {
        _id: documentId,
        tenantId: tenant._id,
        agentId,
      },
      {
        $inc: {
          viewCount: 1,
        },
        $set: {
          lastViewedAt: new Date(),
        },
      },
    ).exec();

    return;
  }

  await (AgentDocumentFileModel as any).updateOne(
    {
      _id: documentId,
      tenantId: tenant._id,
      agentId,
    },
    {
      $inc: {
        downloadCount: 1,
      },
      $set: {
        lastDownloadedAt: new Date(),
      },
    },
  ).exec();
}

export async function archiveAgentDocument(
  tenant: TenantDocument,
  agentId: string,
  documentId: string,
  archivedByUserId: string,
): Promise<PublicAgentDocumentFile> {
  const document = await (AgentDocumentFileModel as any).findOne({
    _id: documentId,
    tenantId: tenant._id,
    agentId,
    status: "ACTIVE",
  }).exec();

  if (!document) {
    throw new AppError(
      "Le document demandé est introuvable ou déjà archivé.",
      404,
      "AGENT_DOCUMENT_NOT_FOUND",
    );
  }

  document.status = "ARCHIVED";
  document.archivedAt = new Date();
  document.archivedByUserId = new Types.ObjectId(
    archivedByUserId,
  );

  await document.save();

  return serializeDocument(document);
}

export async function restoreAgentDocument(
  tenant: TenantDocument,
  agentId: string,
  documentId: string,
  restoredByUserId: string,
): Promise<PublicAgentDocumentFile> {
  const document = await (AgentDocumentFileModel as any).findOne({
    _id: documentId,
    tenantId: tenant._id,
    agentId,
    status: "ARCHIVED",
  }).exec();

  if (!document) {
    throw new AppError(
      "Le document archivé est introuvable.",
      404,
      "AGENT_DOCUMENT_ARCHIVE_NOT_FOUND",
    );
  }

  document.status = "ACTIVE";
  document.restoredAt = new Date();
  document.restoredByUserId = new Types.ObjectId(
    restoredByUserId,
  );

  document.archivedAt = undefined;
  document.archivedByUserId = undefined;

  await document.save();

  return serializeDocument(document);
}