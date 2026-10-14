import { computeCommunicationReadStats } from "./piece-transfer-read-stats.js";
import { PieceTransferReadModel } from "./piece-transfer-read.model.js";
import { ensureOptionalPieceTransferFileIndex } from "./piece-transfer-indexes.js";
import type {
  Readable,
} from "node:stream";
import mongoose, {
  Types,
} from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import {
  destroyPrivateCommunicationDocument,
  openPrivateCommunicationDocumentStream,
  uploadPrivatePieceTransferDocument,
  uploadPrivatePieceTransferMessageDocument,
} from "../../config/cloudinary-piece-transfers.js";
import type {
  TenantDocument,
} from "../tenants/tenant.types.js";
import {
  UserModel,
} from "../users/user.model.js";
import {
  PieceTransferAuditModel,
  PieceTransferMessageModel,
  PieceTransferModel,
  PieceTransferRecipientModel,
} from "./piece-transfer.model.js";
import type {
  CreatePieceTransferInput,
  CreatePieceTransferMessageInput,
  ListPieceTransferMessagesQuery,
  ListPieceTransfersQuery,
  RecipientOptionsQuery,
  UpdatePieceTransferMessageInput,
} from "./piece-transfer.schema.js";
import type {
  PieceTransferDocument,
  PieceTransferMessageDocument,
  PieceTransferRecipientDocument,
  PublicPieceTransferAdminFile,
  PublicPieceTransferAdminMessage,
  PublicPieceTransferAdminOverview,
  PublicPieceTransferAgentStats,
  PublicPieceTransferDetail,
  PublicPieceTransferListItem,
  PublicPieceTransferMessage,
  PublicPieceTransferRecipientOption,
  PublicPieceTransferStats,
} from "./piece-transfer.types.js";

const MESSAGE_EDIT_WINDOW_MS =
  5 * 60 * 1000;

const COMMUNICATION_REVOKE_WINDOW_MS =
  5 * 60 * 1000;

type Actor = {
  userId: string;
  role: string;
};

type LeanUser = {
  _id: Types.ObjectId;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  agentId?: unknown;
};

function iso(
  date?: Date,
): string | undefined {
  return date?.toISOString();
}

function escapeRegex(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

function asStringId(
  value: unknown,
): string {
  if (
    value instanceof
    Types.ObjectId
  ) {
    return value.toString();
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "_id" in value
  ) {
    return asStringId(
      (
        value as {
          _id: unknown;
        }
      )._id,
    );
  }

  return String(
    value ?? "",
  );
}

async function getActorUser(
  tenant: TenantDocument,
  actor: Actor,
): Promise<LeanUser> {
  const user =
    (await (
      UserModel as any
    )
      .findOne({
        _id:
          actor.userId,
        tenantId:
          tenant._id,
        isActive:
          true,
      })
      .select(
        "_id fullName email role isActive agentId",
      )
      .lean()
      .exec()) as
      | LeanUser
      | null;

  if (!user) {
    throw new AppError(
      "Votre compte utilisateur est introuvable ou inactif.",
      401,
      "PIECE_TRANSFER_ACTOR_INVALID",
    );
  }

  return user;
}

function assertTenantAdmin(
  actor: Actor,
): void {
  if (
    actor.role !==
    "TENANT_ADMIN"
  ) {
    throw new AppError(
      "Cette opération est réservée à l'administrateur de la plateforme.",
      403,
      "PIECE_TRANSFER_ADMIN_REQUIRED",
    );
  }
}

async function createAudit(
  tenantId: Types.ObjectId,
  transferId: Types.ObjectId,
  actor: Actor,
  action:
    | "SHARE"
    | "READ"
    | "VIEW"
    | "DOWNLOAD"
    | "MESSAGE_SEND"
    | "MESSAGE_EDIT"
    | "MESSAGE_DELETE"
    | "MESSAGE_FILE_VIEW"
    | "MESSAGE_FILE_DOWNLOAD"
    | "REVOKE"
    | "FILE_DELETE"
    | "ADMIN_THREAD_VIEW",
  messageId?: Types.ObjectId,
): Promise<void> {
  await PieceTransferAuditModel.create({
    tenantId,
    transferId,
    messageId,
    actorUserId:
      new Types.ObjectId(
        actor.userId,
      ),
    actorRoleSnapshot:
      actor.role,
    action,
  });
}

function normalizeAgent(
  raw: unknown,
):
  | PublicPieceTransferRecipientOption["agent"]
  | undefined {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return undefined;
  }

  const agent =
    raw as Record<
      string,
      any
    >;

  return {
    id:
      asStringId(
        agent._id,
      ),

    matricule:
      String(
        agent.matricule ??
          "",
      ),

    jobTitle:
      String(
        agent.jobTitle ??
          "",
      ),

    directionName:
      agent.directionId &&
      typeof agent.directionId ===
        "object"
        ? String(
            agent.directionId
              .name ??
              "",
          ) ||
          undefined
        : undefined,

    serviceName:
      agent.serviceId &&
      typeof agent.serviceId ===
        "object"
        ? String(
            agent.serviceId
              .name ??
              "",
          ) ||
          undefined
        : undefined,
  };
}

export async function listPieceTransferRecipients(
  tenant: TenantDocument,
  actor: Actor,
  query: RecipientOptionsQuery,
) {
  await getActorUser(
    tenant,
    actor,
  );

  const filter: Record<
    string,
    any
  > = {
    tenantId:
      tenant._id,
    isActive:
      true,
    _id: {
      $ne:
        new Types.ObjectId(
          actor.userId,
        ),
    },
  };

  if (
    query.search
  ) {
    const regex =
      new RegExp(
        escapeRegex(
          query.search,
        ),
        "i",
      );

    filter.$or = [
      {
        fullName:
          regex,
      },
      {
        email:
          regex,
      },
    ];
  }

  const skip =
    (
      query.page -
      1
    ) *
    query.limit;

  const [
    users,
    total,
  ] =
    await Promise.all([
      (
        UserModel as any
      )
        .find(
          filter,
        )
        .select(
          "_id fullName email role agentId",
        )
        .populate({
          path:
            "agentId",
          select:
            "_id matricule jobTitle directionId serviceId",
          populate: [
            {
              path:
                "directionId",
              select:
                "name",
            },
            {
              path:
                "serviceId",
              select:
                "name",
            },
          ],
        })
        .sort({
          fullName:
            1,
          email:
            1,
        })
        .skip(
          skip,
        )
        .limit(
          query.limit,
        )
        .lean()
        .exec() as Promise<
        Array<
          Record<
            string,
            any
          >
        >
      >,

      (
        UserModel as any
      ).countDocuments(
        filter,
      ),
    ]);

  return {
    items:
      users.map(
        (user) => ({
          userId:
            asStringId(
              user._id,
            ),

          fullName:
            String(
              user.fullName ??
                "",
            ),

          email:
            String(
              user.email ??
                "",
            ),

          role:
            String(
              user.role ??
                "",
            ),

          agent:
            normalizeAgent(
              user.agentId,
            ),
        }),
      ),

    pagination: {
      page:
        query.page,
      limit:
        query.limit,
      total,
      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}

async function resolveRecipients(
  tenant: TenantDocument,
  senderUserId: string,
  input:
    CreatePieceTransferInput,
): Promise<
  Array<{
    userId:
      Types.ObjectId;
    fullName:
      string;
  }>
> {
  const filter: Record<
    string,
    any
  > = {
    tenantId:
      tenant._id,
    isActive:
      true,
    _id: {
      $ne:
        new Types.ObjectId(
          senderUserId,
        ),
    },
  };

  if (
    input.audienceMode ===
    "SELECTED"
  ) {
    const ids =
      [
        ...new Set(
          input.recipientUserIds,
        ),
      ];

    filter._id = {
      $in:
        ids.map(
          (id) =>
            new Types.ObjectId(
              id,
            ),
        ),
      $ne:
        new Types.ObjectId(
          senderUserId,
        ),
    };
  }

  const users =
    (await (
      UserModel as any
    )
      .find(
        filter,
      )
      .select(
        "_id fullName",
      )
      .sort({
        fullName:
          1,
      })
      .lean()
      .exec()) as Array<{
      _id:
        Types.ObjectId;
      fullName:
        string;
    }>;

  if (
    input.audienceMode ===
    "SELECTED"
  ) {
    const requested =
      new Set(
        input.recipientUserIds,
      );

    const found =
      new Set(
        users.map(
          (user) =>
            user._id.toString(),
        ),
      );

    if (
      [
        ...requested,
      ].some(
        (id) =>
          !found.has(
            id,
          ),
      )
    ) {
      throw new AppError(
        "Un ou plusieurs destinataires sont introuvables, inactifs ou non autorisés.",
        400,
        "PIECE_TRANSFER_RECIPIENT_INVALID",
      );
    }
  }

  if (
    users.length ===
    0
  ) {
    throw new AppError(
      "Aucun destinataire actif n'est disponible pour cette communication.",
      400,
      "PIECE_TRANSFER_NO_RECIPIENT",
    );
  }

  return users.map(
    (user) => ({
      userId:
        user._id,
      fullName:
        user.fullName,
    }),
  );
}

function getCommunicationRevocableUntil(
  transfer:
    PieceTransferDocument,
): Date | undefined {
  if (
    !transfer.createdAt
  ) {
    return undefined;
  }

  return new Date(
    transfer.createdAt.getTime() +
      COMMUNICATION_REVOKE_WINDOW_MS,
  );
}

function canActorRevokeCommunication(
  transfer:
    PieceTransferDocument,
  actor:
    Actor,
): boolean {
  if (
    transfer.status !==
    "ACTIVE"
  ) {
    return false;
  }

  if (
    actor.role ===
    "TENANT_ADMIN"
  ) {
    return true;
  }

  if (
    transfer.senderUserId.toString() !==
    actor.userId
  ) {
    return false;
  }

  const revocableUntil =
    getCommunicationRevocableUntil(
      transfer,
    );

  return Boolean(
    revocableUntil &&
      Date.now() <
        revocableUntil.getTime(),
  );
}

function discussionTitle(transfer: PieceTransferDocument, actor: Actor): string {
  if (transfer.groupName) return transfer.groupName;
  if (transfer.recipientCount === 1 && transfer.audienceMode === "SELECTED") {
    return transfer.senderUserId.toString() === actor.userId ? transfer.directRecipientName || transfer.title : transfer.senderNameSnapshot;
  }
  return transfer.title;
}
async function hydrateDirectNames(tenantId: Types.ObjectId, transfers: PieceTransferDocument[]): Promise<void> {
  const ids = transfers.filter(item => item.recipientCount === 1 && !item.groupName && !item.directRecipientName && item.audienceMode === "SELECTED").map(item => item._id);
  if (!ids.length) return;
  const rows = await PieceTransferRecipientModel.find({ tenantId, transferId: { $in: ids } }).select("transferId recipientNameSnapshot").lean().exec();
  const names = new Map(rows.map(row => [row.transferId.toString(), row.recipientNameSnapshot]));
  for (const item of transfers) if (names.has(item._id.toString())) item.directRecipientName = names.get(item._id.toString());
}
async function discussionParticipants(tenantId: Types.ObjectId, transfer: PieceTransferDocument): Promise<Array<{ userId: string; fullName: string }>> {
  const rows = await PieceTransferRecipientModel.find({ tenantId, transferId: transfer._id }).select("recipientUserId recipientNameSnapshot").lean().exec();
  return [{ userId: transfer.senderUserId.toString(), fullName: transfer.senderNameSnapshot }, ...rows.map(row => ({ userId: row.recipientUserId.toString(), fullName: row.recipientNameSnapshot }))];
}
async function validatedMentions(tenantId: Types.ObjectId, transfer: PieceTransferDocument, body: string | undefined, ids: string[]): Promise<Array<{ userId: string; fullName: string; start: number; end: number }>> {
  if (!ids.length || !body) return [];
  const participants = await discussionParticipants(tenantId, transfer);
  const mentions: Array<{ userId: string; fullName: string; start: number; end: number }> = [];
  for (const id of new Set(ids)) {
    const person = participants.find(item => item.userId === id);
    if (!person) throw new AppError("Une mention vise une personne extérieure à la discussion.", 400, "INVALID_MENTION");
    const token = `@${person.fullName}`;
    let start = body.indexOf(token);
    while (start !== -1) {
      const end = start + token.length;
      if ((start === 0 || /\s/.test(body.charAt(start - 1))) && (end === body.length || /[\s.,!?;:)]/.test(body.charAt(end)))) {
        if (!mentions.some(item => item.start < end && item.end > start)) mentions.push({ userId: id, fullName: person.fullName, start, end });
      }
      start = body.indexOf(token, end);
    }
  }
  return mentions.sort((left, right) => left.start - right.start);
}

function serializeSentItem(
  transfer:
    PieceTransferDocument,
  actor:
    Actor,
): PublicPieceTransferListItem {
  const hasRootFile =
    Boolean(
      transfer.storagePublicId &&
      transfer.originalFileName,
    );

  const usable =
    transfer.status ===
      "ACTIVE" &&
    hasRootFile &&
    transfer.fileStatus ===
      "AVAILABLE";

  return {
    id:
      transfer.id,

    direction:
      "SENT",

    title:
      discussionTitle(transfer, actor),

    description:
      transfer.description,

    originalFileName:
      transfer.originalFileName,

    mimeType:
      transfer.mimeType,

    bytes:
      transfer.bytes,

    fileStatus:
      transfer.fileStatus,

    senderUserId:
      transfer.senderUserId.toString(),

    senderName:
      transfer.senderNameSnapshot,

    audienceMode:
      transfer.audienceMode,

    recipientCount:
      transfer.recipientCount,

    status:
      transfer.status,

    createdAt:
      iso(
        transfer.createdAt,
      ),

    revokedAt:
      iso(
        transfer.revokedAt,
      ),

    revocableUntil:
      iso(
        getCommunicationRevocableUntil(
          transfer,
        ),
      ),

    canView:
      usable,

    canDownload:
      usable,

    canRevoke:
      canActorRevokeCommunication(
        transfer,
        actor,
      ),
  };
}

function serializeInboxItem(
  item:
    PieceTransferRecipientDocument,
  transfer:
    PieceTransferDocument,
  actor:
    Actor,
): PublicPieceTransferListItem {
  const hasRootFile =
    Boolean(
      transfer.storagePublicId &&
      transfer.originalFileName,
    );

  const usable =
    transfer.status ===
      "ACTIVE" &&
    hasRootFile &&
    transfer.fileStatus ===
      "AVAILABLE";

  return {
    id:
      item.transferId.toString(),

    direction:
      "INBOX",

    title:
      discussionTitle(transfer, actor),

    description:
      item.descriptionSnapshot,

    originalFileName:
      item.originalFileNameSnapshot,

    mimeType:
      item.mimeTypeSnapshot,

    bytes:
      item.bytesSnapshot,

    fileStatus:
      transfer.fileStatus,

    senderUserId:
      item.senderUserId.toString(),

    senderName:
      item.senderNameSnapshot,

    status:
      item.status,

    isRead:
      item.isRead,

    createdAt:
      iso(
        item.createdAt,
      ),

    revocableUntil:
      iso(
        getCommunicationRevocableUntil(
          transfer,
        ),
      ),

    canView:
      usable,

    canDownload:
      usable,

    canRevoke:
      canActorRevokeCommunication(
        transfer,
        actor,
      ),
  };
}


export async function createPieceTransfer(
  input: {
    tenant:
      TenantDocument;
    actor:
      Actor;
    metadata:
      CreatePieceTransferInput;
    file?:
      Express.Multer.File;
  },
): Promise<PublicPieceTransferListItem> {
  const sender =
    await getActorUser(
      input.tenant,
      input.actor,
    );

  const recipients =
    await resolveRecipients(
      input.tenant,
      input.actor.userId,
      input.metadata,
    );

  const groupName = input.metadata.title?.trim() || undefined;
  const isIndividual = recipients.length === 1 && input.metadata.audienceMode === "SELECTED" && !groupName;
  const resolvedTitle = isIndividual ? recipients[0]?.fullName ?? "Discussion individuelle" : groupName || "Discussion commune";
  await ensureOptionalPieceTransferFileIndex();

  const uploaded =
    input.file
      ? await uploadPrivatePieceTransferDocument({
          tenantSlug:
            input.tenant.slug,
          senderUserId:
            input.actor.userId,
          originalFileName:
            input.file.originalname,
          fileBuffer:
            input.file.buffer,
        })
      : undefined;

  const session =
    await mongoose.startSession();

  let transfer:
    PieceTransferDocument | null =
    null;

  try {
    await session.withTransaction(
      async () => {
        const created =
          await PieceTransferModel.create(
            [
              {
                tenantId:
                  input.tenant._id,
                senderUserId:
                  new Types.ObjectId(
                    input.actor.userId,
                  ),
                senderNameSnapshot:
                  sender.fullName,
                senderRoleSnapshot:
                  sender.role,
                title:
                  resolvedTitle,
                directRecipientName: isIndividual ? recipients[0]?.fullName : undefined,
                groupName: isIndividual ? undefined : groupName,
                description:
                  input.metadata.description ||
                  undefined,
                ...(uploaded && input.file ? {
                  originalFileName: input.file.originalname,
                  mimeType: input.file.mimetype,
                  bytes: uploaded.bytes,
                  storagePublicId: uploaded.publicId,
                  fileStatus: "AVAILABLE" as const,
                } : {}),
                audienceMode:
                  input.metadata.audienceMode,
                recipientCount:
                  recipients.length,
                status:
                  "ACTIVE",
              },
            ],
            {
              session,
            },
          );

        transfer =
          created[0] ??
          null;

        if (!transfer) {
          throw new AppError(
            "La communication n'a pas pu être créée.",
            500,
            "PIECE_TRANSFER_CREATE_FAILED",
          );
        }

        await PieceTransferRecipientModel.insertMany(
          recipients.map(
            (recipient) => ({
              tenantId:
                input.tenant._id,
              transferId:
                transfer!._id,
              recipientUserId:
                recipient.userId,
              recipientNameSnapshot:
                recipient.fullName,
              senderUserId:
                new Types.ObjectId(
                  input.actor.userId,
                ),
              senderNameSnapshot:
                sender.fullName,
              titleSnapshot:
                resolvedTitle,
              descriptionSnapshot:
                input.metadata.description ||
                undefined,
              originalFileNameSnapshot:
                input.file?.originalname,
              mimeTypeSnapshot:
                input.file?.mimetype,
              bytesSnapshot:
                uploaded?.bytes,
              status:
                "ACTIVE",
              isRead:
                false,
              viewCount:
                0,
              downloadCount:
                0,
            }),
          ),
          {
            session,
          },
        );

        await PieceTransferAuditModel.create(
          [
            {
              tenantId:
                input.tenant._id,
              transferId:
                transfer._id,
              actorUserId:
                new Types.ObjectId(
                  input.actor.userId,
                ),
              actorRoleSnapshot:
                sender.role,
              action:
                "SHARE",
            },
          ],
          {
            session,
          },
        );
      },
    );
  } catch (
    error
  ) {
    if (
      uploaded
    ) {
      await destroyPrivateCommunicationDocument(
        uploaded.publicId,
      ).catch(
        () =>
          undefined,
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }

  if (!transfer) {
    throw new AppError(
      "La communication n'a pas pu être finalisée.",
      500,
      "PIECE_TRANSFER_CREATE_FAILED",
    );
  }

  return serializeSentItem(
    transfer,
    input.actor,
  );
}


async function getParticipantTransferIds(
  tenantId:
    Types.ObjectId,
  userId:
    Types.ObjectId,
): Promise<
  Types.ObjectId[]
> {
  const [
    ownTransfers,
    recipientRows,
  ] =
    await Promise.all([
      PieceTransferModel.find({
        tenantId,
        senderUserId:
          userId,
      })
        .select(
          "_id",
        )
        .lean()
        .exec(),

      PieceTransferRecipientModel.find({
        tenantId,
        recipientUserId:
          userId,
      })
        .select(
          "transferId",
        )
        .lean()
        .exec(),
    ]);

  const ids =
    new Map<
      string,
      Types.ObjectId
    >();

  ownTransfers.forEach(
    (
      transfer: any,
    ) =>
      ids.set(
        asStringId(
          transfer._id,
        ),
        transfer._id,
      ),
  );

  recipientRows.forEach(
    (
      row: any,
    ) =>
      ids.set(
        asStringId(
          row.transferId,
        ),
        row.transferId,
      ),
  );

  return [
    ...ids.values(),
  ];
}

export async function getPieceTransferStats(
  tenant:
    TenantDocument,
  actor:
    Actor,
): Promise<PublicPieceTransferStats> {
  await getActorUser(
    tenant,
    actor,
  );

  const userId =
    new Types.ObjectId(
      actor.userId,
    );

  const participantTransferIds =
    await getParticipantTransferIds(
      tenant._id,
      userId,
    );

  const [
    ownTransfers,
    receivedRows,
    activeSent,
    unread,
    threadMessagesSentRows,
    participantMessages,
  ] =
    await Promise.all([
      PieceTransferModel.find({
        tenantId:
          tenant._id,
        senderUserId:
          userId,
      })
        .select(
          "_id storagePublicId",
        )
        .lean()
        .exec(),

      PieceTransferRecipientModel.find({
        tenantId:
          tenant._id,
        recipientUserId:
          userId,
      })
        .select(
          "transferId",
        )
        .lean()
        .exec(),

      PieceTransferModel.countDocuments({
        tenantId:
          tenant._id,
        senderUserId:
          userId,
        status:
          "ACTIVE",
      }),

      PieceTransferRecipientModel.countDocuments({
        tenantId:
          tenant._id,
        recipientUserId:
          userId,
        status:
          "ACTIVE",
        isRead:
          false,
      }),

      PieceTransferMessageModel.find({
        tenantId:
          tenant._id,
        senderUserId:
          userId,
      })
        .select(
          "attachment attachments",
        )
        .lean()
        .exec(),

      participantTransferIds.length >
      0
        ? PieceTransferMessageModel.find({
            tenantId:
              tenant._id,
            transferId: {
              $in:
                participantTransferIds,
            },
          })
            .select(
              "senderUserId attachment attachments",
            )
            .lean()
            .exec()
        : Promise.resolve(
            [],
          ),
    ]);

  const receivedTransferIds =
    (
      receivedRows as any[]
    ).map(
      (row) =>
        row.transferId,
    );

  const receivedRootFiles =
    receivedTransferIds.length >
    0
      ? await PieceTransferModel.countDocuments({
          tenantId:
            tenant._id,
          _id: {
            $in:
              receivedTransferIds,
          },
          storagePublicId: {
            $exists:
              true,
            $ne:
              null,
          },
        })
      : 0;

  const threadMessagesReceivedRows =
    (
      participantMessages as any[]
    ).filter(
      (message) =>
        asStringId(
          message.senderUserId,
        ) !==
        actor.userId,
    );

  const threadFilesSent =
    (
      threadMessagesSentRows as any[]
    ).reduce(
      (
        total,
        message,
      ) =>
        total +
        countStoredMessageAttachments(
          message,
        ),
      0,
    );

  const threadFilesReceived =
    threadMessagesReceivedRows.reduce(
      (
        total,
        message,
      ) =>
        total +
        countStoredMessageAttachments(
          message,
        ),
      0,
    );

  const rootFilesSent =
    (
      ownTransfers as any[]
    ).filter(
      (transfer) =>
        Boolean(
          transfer.storagePublicId,
        ),
    ).length;

  const communicationsStarted =
    ownTransfers.length;

  const communicationsReceived =
    receivedRows.length;

  return {
    communicationsStarted,
    communicationsReceived,
    activeSent,
    unread,

    messagesSent:
      communicationsStarted +
      threadMessagesSentRows.length,

    messagesReceived:
      communicationsReceived +
      threadMessagesReceivedRows.length,

    filesSent:
      rootFilesSent +
      threadFilesSent,

    filesReceived:
      receivedRootFiles +
      threadFilesReceived,
  };
}

export async function listPieceTransferInbox(
  tenant:
    TenantDocument,
  actor:
    Actor,
  query:
    ListPieceTransfersQuery,
) {
  await getActorUser(
    tenant,
    actor,
  );

  const filter: Record<
    string,
    any
  > = {
    tenantId:
      tenant._id,
    recipientUserId:
      new Types.ObjectId(
        actor.userId,
      ),
  };

  if (
    query.status
  ) {
    filter.status =
      query.status;
  }

  if (
    query.unreadOnly
  ) {
    filter.isRead =
      false;
  }

  if (
    query.search
  ) {
    const regex =
      new RegExp(
        escapeRegex(
          query.search,
        ),
        "i",
      );

    filter.$or = [
      {
        titleSnapshot:
          regex,
      },
      {
        descriptionSnapshot:
          regex,
      },
      {
        originalFileNameSnapshot:
          regex,
      },
      {
        senderNameSnapshot:
          regex,
      },
    ];
  }

  const skip =
    (
      query.page -
      1
    ) *
    query.limit;

  const [
    rows,
    total,
  ] =
    await Promise.all([
      PieceTransferRecipientModel.find(
        filter,
      )
        .sort({
          createdAt:
            -1,
        })
        .skip(skip)
        .limit(
          query.limit,
        )
        .exec(),

      PieceTransferRecipientModel.countDocuments(
        filter,
      ),
    ]);

  const transfers =
    await PieceTransferModel.find({
      _id: {
        $in:
          rows.map(
            (row) =>
              row.transferId,
          ),
      },
      tenantId:
        tenant._id,
    }).exec();

  const transferMap =
    new Map(
      transfers.map(
        (transfer) => [
          transfer.id,
          transfer,
        ],
      ),
    );

  const items =
    rows
      .map(
        (row) => {
          const transfer =
            transferMap.get(
              row.transferId.toString(),
            );

          return transfer
            ? serializeInboxItem(
                row,
                transfer,
                actor,
              )
            : null;
        },
      )
      .filter(
        (
          item,
        ): item is
          PublicPieceTransferListItem =>
          Boolean(item),
      );

  return {
    items,

    pagination: {
      page:
        query.page,
      limit:
        query.limit,
      total,
      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}

export async function listPieceTransferSent(
  tenant:
    TenantDocument,
  actor:
    Actor,
  query:
    ListPieceTransfersQuery,
) {
  await getActorUser(
    tenant,
    actor,
  );

  const filter: Record<
    string,
    any
  > = {
    tenantId:
      tenant._id,
    senderUserId:
      new Types.ObjectId(
        actor.userId,
      ),
  };

  if (
    query.status
  ) {
    filter.status =
      query.status;
  }

  if (
    query.search
  ) {
    const regex =
      new RegExp(
        escapeRegex(
          query.search,
        ),
        "i",
      );

    const matchingRecipients = await PieceTransferRecipientModel.find({ tenantId: tenant._id, senderUserId: new Types.ObjectId(actor.userId), recipientNameSnapshot: regex }).select("transferId").lean().exec();
    filter.$or = [
      { directRecipientName: regex },
      { _id: { $in: matchingRecipients.map(row => row.transferId) } },
      {
        title:
          regex,
      },
      {
        description:
          regex,
      },
      {
        originalFileName:
          regex,
      },
    ];
  }

  const skip =
    (
      query.page -
      1
    ) *
    query.limit;

  const [
    items,
    total,
  ] =
    await Promise.all([
      PieceTransferModel.find(
        filter,
      )
        .sort({
          createdAt:
            -1,
        })
        .skip(skip)
        .limit(
          query.limit,
        )
        .exec(),

      PieceTransferModel.countDocuments(
        filter,
      ),
    ]);

  await hydrateDirectNames(tenant._id, items);
  return {
    items:
      items.map(
        (item) =>
          serializeSentItem(
            item,
            actor,
          ),
      ),

    pagination: {
      page:
        query.page,
      limit:
        query.limit,
      total,
      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}

async function getTransferAndAccess(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
): Promise<{
  transfer:
    PieceTransferDocument;
  recipient:
    PieceTransferRecipientDocument | null;
  isSender:
    boolean;
  isAdminSupervisor:
    boolean;
}> {
  const transfer =
    await PieceTransferModel.findOne({
      _id:
        transferId,
      tenantId:
        tenant._id,
    }).exec();

  if (!transfer) {
    throw new AppError(
      "La communication demandée est introuvable.",
      404,
      "PIECE_TRANSFER_NOT_FOUND",
    );
  }

  const isSender =
    transfer.senderUserId.toString() ===
    actor.userId;

  const isAdminSupervisor =
    actor.role ===
    "TENANT_ADMIN";

  const recipient =
    isSender
      ? null
      : await PieceTransferRecipientModel.findOne({
          tenantId:
            tenant._id,
          transferId:
            transfer._id,
          recipientUserId:
            new Types.ObjectId(
              actor.userId,
            ),
        }).exec();

  if (
    !isSender &&
    !recipient &&
    !isAdminSupervisor
  ) {
    throw new AppError(
      "Vous n'êtes pas autorisé à accéder à cette communication.",
      403,
      "PIECE_TRANSFER_ACCESS_DENIED",
    );
  }

  await hydrateDirectNames(tenant._id, [transfer]);
  return {
    transfer,
    recipient,
    isSender,
    isAdminSupervisor,
  };
}

async function markRead(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transfer:
    PieceTransferDocument,
  recipient:
    PieceTransferRecipientDocument,
): Promise<void> {
  if (
    recipient.isRead
  ) {
    return;
  }

  recipient.isRead =
    true;

  recipient.firstReadAt =
    new Date();

  await recipient.save();

  await createAudit(
    tenant._id,
    transfer._id,
    actor,
    "READ",
  );
}

export async function getPieceTransferDetail(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
): Promise<PublicPieceTransferDetail> {
  await getActorUser(
    tenant,
    actor,
  );

  const {
    transfer,
    recipient,
    isSender,
    isAdminSupervisor,
  } =
    await getTransferAndAccess(
      tenant,
      actor,
      transferId,
    );

  if (
    recipient &&
    transfer.status ===
      "ACTIVE"
  ) {
    await markRead(
      tenant,
      actor,
      transfer,
      recipient,
    );
  }

  if (
    isAdminSupervisor &&
    !isSender &&
    !recipient
  ) {
    await createAudit(
      tenant._id,
      transfer._id,
      actor,
      "ADMIN_THREAD_VIEW",
    );
  }

  const hasRootFile =
    Boolean(
      transfer.storagePublicId &&
      transfer.originalFileName,
    );

  const canUseRootFile =
    transfer.status ===
      "ACTIVE" &&
    hasRootFile &&
    transfer.fileStatus ===
      "AVAILABLE";

  let recipients:
    PublicPieceTransferDetail["recipients"] =
    undefined;

  if (
    isSender ||
    isAdminSupervisor
  ) {
    const rows =
      await PieceTransferRecipientModel.find({
        tenantId:
          tenant._id,
        transferId:
          transfer._id,
      })
        .sort({
          recipientNameSnapshot:
            1,
        })
        .exec();

    recipients =
      rows.map(
        (row) => ({
          userId:
            row.recipientUserId.toString(),
          fullName:
            row.recipientNameSnapshot,
          isRead:
            row.isRead,
          firstReadAt:
            iso(
              row.firstReadAt,
            ),
          viewCount:
            row.viewCount,
          downloadCount:
            row.downloadCount,
        }),
      );
  }

  const participants = await discussionParticipants(tenant._id, transfer);
  return {
    participants,
    id:
      transfer.id,

    title:
      discussionTitle(transfer, actor),

    description:
      transfer.description,

    originalFileName:
      transfer.originalFileName,

    mimeType:
      transfer.mimeType,

    bytes:
      transfer.bytes,

    fileStatus:
      transfer.fileStatus,

    senderUserId:
      transfer.senderUserId.toString(),

    senderName:
      transfer.senderNameSnapshot,

    senderRole:
      transfer.senderRoleSnapshot,

    audienceMode:
      transfer.audienceMode,

    recipientCount:
      transfer.recipientCount,

    status:
      transfer.status,

    createdAt:
      iso(
        transfer.createdAt,
      ),

    revokedAt:
      iso(
        transfer.revokedAt,
      ),

    revocableUntil:
      iso(
        getCommunicationRevocableUntil(
          transfer,
        ),
      ),

    fileDeletedAt:
      iso(
        transfer.fileDeletedAt,
      ),

    currentUser: {
      isSender,
      isRecipient:
        Boolean(
          recipient,
        ),
      isAdminSupervisor,
      isRead:
        recipient?.isRead,
    },

    recipients,

    permissions: {
      canView:
        canUseRootFile,

      canDownload:
        canUseRootFile,

      canRevoke:
        canActorRevokeCommunication(
          transfer,
          actor,
        ),

      canDeleteFile:
        isAdminSupervisor &&
        hasRootFile &&
        transfer.fileStatus ===
          "AVAILABLE",

      canSendMessage:
        transfer.status ===
          "ACTIVE" &&
        (
          isSender ||
          Boolean(
            recipient,
          )
        ),
    },
  };
}


export async function getPieceTransferDelivery(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
  mode:
    | "VIEW"
    | "DOWNLOAD",
): Promise<{
  transfer:
    PieceTransferDocument;
  stream:
    Readable;
  contentLength?: number;
}> {
  await getActorUser(
    tenant,
    actor,
  );

  const {
    transfer,
    recipient,
  } =
    await getTransferAndAccess(
      tenant,
      actor,
      transferId,
    );

  if (
    transfer.status !==
    "ACTIVE"
  ) {
    throw new AppError(
      "Cette communication a été révoquée.",
      410,
      "PIECE_TRANSFER_REVOKED",
    );
  }

  if (
    !transfer.storagePublicId ||
    !transfer.originalFileName
  ) {
    throw new AppError(
      "Cette communication ne contient pas de pièce initiale.",
      404,
      "PIECE_TRANSFER_FILE_NOT_FOUND",
    );
  }

  if (
    transfer.fileStatus !==
    "AVAILABLE"
  ) {
    throw new AppError(
      "Cette pièce a été supprimée par l'administrateur.",
      410,
      "PIECE_TRANSFER_FILE_DELETED",
    );
  }

  if (recipient) {
    const now =
      new Date();

    if (
      !recipient.isRead
    ) {
      recipient.isRead =
        true;
      recipient.firstReadAt =
        now;
    }

    if (
      mode ===
      "VIEW"
    ) {
      recipient.lastViewedAt =
        now;
      recipient.viewCount +=
        1;
    } else {
      recipient.lastDownloadedAt =
        now;
      recipient.downloadCount +=
        1;
    }

    await recipient.save();
  }

  await createAudit(
    tenant._id,
    transfer._id,
    actor,
    mode,
  );

  const source =
    await openPrivateCommunicationDocumentStream({
      publicId:
        transfer.storagePublicId,
      originalFileName:
        transfer.originalFileName,
    });

  return {
    transfer,
    stream:
      source.stream,
    contentLength:
      source.contentLength,
  };
}


export async function revokePieceTransfer(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
): Promise<PublicPieceTransferDetail> {
  await getActorUser(
    tenant,
    actor,
  );

  const transfer =
    await PieceTransferModel.findOne({
      _id:
        transferId,
      tenantId:
        tenant._id,
    }).exec();

  if (!transfer) {
    throw new AppError(
      "La communication demandée est introuvable.",
      404,
      "PIECE_TRANSFER_NOT_FOUND",
    );
  }

  if (
    transfer.status ===
    "REVOKED"
  ) {
    return getPieceTransferDetail(
      tenant,
      actor,
      transferId,
    );
  }

  const isAdmin =
    actor.role ===
    "TENANT_ADMIN";

  const isSender =
    transfer.senderUserId.toString() ===
    actor.userId;

  if (
    !isAdmin &&
    !isSender
  ) {
    throw new AppError(
      "Seul l'expéditeur dans les 5 premières minutes ou l'administrateur peut révoquer cette communication.",
      403,
      "PIECE_TRANSFER_REVOKE_DENIED",
    );
  }

  if (
    !isAdmin &&
    isSender
  ) {
    const revocableUntil =
      getCommunicationRevocableUntil(
        transfer,
      );

    if (
      !revocableUntil ||
      Date.now() >=
        revocableUntil.getTime()
    ) {
      throw new AppError(
        "Le délai de révocation de 5 minutes est expiré. Seul l'administrateur peut désormais révoquer cette communication.",
        409,
        "PIECE_TRANSFER_REVOKE_WINDOW_EXPIRED",
      );
    }
  }

  transfer.status =
    "REVOKED";

  transfer.revokedAt =
    new Date();

  transfer.revokedByUserId =
    new Types.ObjectId(
      actor.userId,
    );

  await transfer.save();

  await PieceTransferRecipientModel.updateMany(
    {
      tenantId:
        tenant._id,
      transferId:
        transfer._id,
    },
    {
      $set: {
        status:
          "REVOKED",
      },
    },
  );

  await createAudit(
    tenant._id,
    transfer._id,
    actor,
    "REVOKE",
  );

  return getPieceTransferDetail(
    tenant,
    actor,
    transferId,
  );
}



function getStoredMessageAttachments(
  message: {
    attachment?: any;
    attachments?: any[];
  },
): any[] {
  if (
    Array.isArray(
      message.attachments,
    ) &&
    message.attachments.length >
      0
  ) {
    return message.attachments;
  }

  return message.attachment
    ? [
        message.attachment,
      ]
    : [];
}

function countStoredMessageAttachments(
  message: {
    attachment?: any;
    attachments?: any[];
  },
): number {
  return getStoredMessageAttachments(
    message,
  ).length;
}

function getMessageEditableUntil(
  message:
    PieceTransferMessageDocument,
): Date | undefined {
  if (
    !message.createdAt
  ) {
    return undefined;
  }

  return new Date(
    message.createdAt.getTime() +
      MESSAGE_EDIT_WINDOW_MS,
  );
}

function serializeMessage(
  message:
    PieceTransferMessageDocument,
  transfer:
    PieceTransferDocument,
  actor:
    Actor,
): PublicPieceTransferMessage {
  const deleted =
    message.status ===
    "DELETED";

  const editableUntil =
    getMessageEditableUntil(
      message,
    );

  const canEdit =
    !deleted &&
    transfer.status ===
      "ACTIVE" &&
    message.senderUserId.toString() ===
      actor.userId &&
    Boolean(
      editableUntil &&
        Date.now() <
          editableUntil.getTime(),
    );

  const attachments =
    deleted
      ? []
      : getStoredMessageAttachments(
          message,
        );

  return {
    reactions: deleted ? [] : [...new Set((message.reactions ?? []).map(item => item.emoji))].map(emoji => ({ emoji, count: (message.reactions ?? []).filter(item => item.emoji === emoji).length, reactedByMe: (message.reactions ?? []).some(item => item.emoji === emoji && item.userId === actor.userId) })),
    mentions: deleted ? [] : message.mentions ?? [],
    replyTo: deleted ? undefined : message.replyTo,
    forwarded: deleted ? undefined : message.forwarded,
    id:
      message.id,

    senderUserId:
      message.senderUserId.toString(),

    senderName:
      message.senderNameSnapshot,

    senderRole:
      message.senderRoleSnapshot,

    body:
      deleted
        ? undefined
        : message.body,

    status:
      message.status,

    editedAt:
      iso(
        message.editedAt,
      ),

    editCount:
      message.editCount,

    createdAt:
      iso(
        message.createdAt,
      ),

    editableUntil:
      iso(
        editableUntil,
      ),

    permissions: {
      canEdit,

      canDelete:
        actor.role ===
          "TENANT_ADMIN" &&
        !deleted,
    },

    attachments:
      attachments.map(
        (
          attachment,
          index,
        ) => {
          const usable =
            transfer.status ===
              "ACTIVE" &&
            attachment.status ===
              "AVAILABLE";

          return {
            index,
            originalFileName:
              attachment.originalFileName,
            mimeType:
              attachment.mimeType,
            bytes:
              attachment.bytes,
            status:
              attachment.status,
            canView:
              usable,
            canDownload:
              usable,
          };
        },
      ),
  };
}

export async function listPieceTransferMessages(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
  query:
    ListPieceTransferMessagesQuery,
) {
  await getActorUser(
    tenant,
    actor,
  );

  const {
    transfer,
  } =
    await getTransferAndAccess(
      tenant,
      actor,
      transferId,
    );

  const skip =
    (
      query.page -
      1
    ) *
    query.limit;

  const [
    messages,
    total,
  ] =
    await Promise.all([
      PieceTransferMessageModel.find({
        tenantId:
          tenant._id,
        transferId:
          transfer._id,
      })
        .sort({
          createdAt:
            -1,
          _id: -1,
        })
        .skip(skip)
        .limit(
          query.limit,
        )
        .exec(),

      PieceTransferMessageModel.countDocuments({
        tenantId:
          tenant._id,
        transferId:
          transfer._id,
      }),
    ]);

  return {
    items:
      messages.reverse().map(
        (message) =>
          serializeMessage(
            message,
            transfer,
            actor,
          ),
      ),

    serverNow:
      new Date().toISOString(),

    pagination: {
      page:
        query.page,
      limit:
        query.limit,
      total,
      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              query.limit,
          ),
        ),
    },
  };
}

export async function sendPieceTransferMessage(
  input: {
    tenant:
      TenantDocument;
    actor:
      Actor;
    transferId:
      string;
    metadata:
      CreatePieceTransferMessageInput;
    files?:
      Express.Multer.File[];
  },
): Promise<PublicPieceTransferMessage> {
  const sender =
    await getActorUser(
      input.tenant,
      input.actor,
    );

  const {
    transfer,
    isSender,
    recipient,
  } =
    await getTransferAndAccess(
      input.tenant,
      input.actor,
      input.transferId,
    );

  if (
    !isSender &&
    !recipient
  ) {
    throw new AppError(
      "L'administrateur peut superviser cette communication mais ne peut pas y intervenir s'il n'est pas participant.",
      403,
      "PIECE_TRANSFER_MESSAGE_SUPERVISOR_READ_ONLY",
    );
  }

  if (
    transfer.status !==
    "ACTIVE"
  ) {
    throw new AppError(
      "Cette communication est révoquée et ne peut plus recevoir de messages.",
      410,
      "PIECE_TRANSFER_REVOKED",
    );
  }

  let body = input.metadata.body?.trim() || undefined;
  let files = input.files ?? [];
  let replyTo: PublicPieceTransferMessage["replyTo"];
  if (input.metadata.replyToMessageId) {
    const original = await PieceTransferMessageModel.findOne({ _id: input.metadata.replyToMessageId, tenantId: input.tenant._id, transferId: transfer._id, status: "ACTIVE" });
    if (!original) throw new AppError("Le message cité est indisponible.", 404, "REPLY_MESSAGE_NOT_FOUND");
    replyTo = { messageId: original.id, senderName: original.senderNameSnapshot, body: original.body?.slice(0, 280), attachmentName: getStoredMessageAttachments(original)[0]?.originalFileName };
  }
  const { forwardMessageId, forwardTransferId } = input.metadata;
  if (Boolean(forwardMessageId) !== Boolean(forwardTransferId) || (forwardMessageId && input.metadata.replyToMessageId)) {
    throw new AppError("Référence de transfert invalide.", 400, "INVALID_FORWARD_REFERENCE");
  }
  if (forwardMessageId && forwardTransferId) {
    const sourceAccess = await getTransferAndAccess(input.tenant, input.actor, forwardTransferId);
    if ((!sourceAccess.isSender && !sourceAccess.recipient) || sourceAccess.transfer.status !== "ACTIVE") {
      throw new AppError("Ce message ne peut pas être transféré.", 403, "FORWARD_NOT_ALLOWED");
    }
    const original = await PieceTransferMessageModel.findOne({ _id: forwardMessageId, tenantId: input.tenant._id, transferId: sourceAccess.transfer._id, status: "ACTIVE" });
    if (!original) throw new AppError("Message source indisponible.", 404, "FORWARD_MESSAGE_NOT_FOUND");
    if (files.length) throw new AppError("Transférez le message sans ajout de fichiers.", 400, "INVALID_FORWARD_FILES");
    body = original.body;
    files = [];
    let total = 0;
    for (const attachment of getStoredMessageAttachments(original)) {
      if (attachment.status !== "AVAILABLE") continue;
      const source = await openPrivateCommunicationDocumentStream({ publicId: attachment.storagePublicId, originalFileName: attachment.originalFileName });
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of source.stream) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += bytes.length;
          if (total > 20 * 1024 * 1024) throw new AppError("Pièces trop volumineuses.", 400, "FORWARD_TOO_LARGE");
          chunks.push(bytes);
        }
      } finally { source.stream.destroy(); }
      const buffer = Buffer.concat(chunks);
      files.push({ originalname: attachment.originalFileName, mimetype: attachment.mimeType, buffer, size: buffer.length } as Express.Multer.File);
    }
  }

  if (
    files.length >
    7
  ) {
    throw new AppError(
      "Vous ne pouvez pas joindre plus de 7 fichiers à un message.",
      400,
      "PIECE_TRANSFER_MESSAGE_FILE_COUNT_EXCEEDED",
    );
  }

  const totalBytes =
    files.reduce(
      (
        total,
        file,
      ) =>
        total +
        file.size,
      0,
    );

  if (
    totalBytes >
    20 * 1024 * 1024
  ) {
    throw new AppError(
      "La taille totale des pièces jointes ne peut pas dépasser 20 Mo par message.",
      400,
      "PIECE_TRANSFER_MESSAGE_FILES_TOO_LARGE",
    );
  }

  if (
    !body &&
    files.length ===
      0
  ) {
    throw new AppError(
      "Ajoutez un message ou au moins une pièce jointe.",
      400,
      "PIECE_TRANSFER_MESSAGE_EMPTY",
    );
  }

  const mentions = await validatedMentions(input.tenant._id, transfer, body, forwardMessageId ? [] : input.metadata.mentionUserIds ?? []);
  const uploaded: Array<{
    publicId: string;
    bytes: number;
    originalFileName: string;
    mimeType: string;
  }> = [];

  try {
    for (
      const file of files
    ) {
      const stored =
        await uploadPrivatePieceTransferMessageDocument({
          tenantSlug:
            input.tenant.slug,
          transferId:
            transfer.id,
          senderUserId:
            input.actor.userId,
          originalFileName:
            file.originalname,
          fileBuffer:
            file.buffer,
        });

      uploaded.push({
        publicId:
          stored.publicId,
        bytes:
          stored.bytes,
        originalFileName:
          file.originalname,
        mimeType:
          file.mimetype,
      });
    }

    const message =
      await PieceTransferMessageModel.create({
        tenantId:
          input.tenant._id,
        transferId:
          transfer._id,
        senderUserId:
          new Types.ObjectId(
            input.actor.userId,
          ),
        senderNameSnapshot:
          sender.fullName,
        senderRoleSnapshot:
          sender.role,
        body,
        replyTo,
        mentions,
        forwarded: Boolean(forwardMessageId),
        status:
          "ACTIVE",
        editCount:
          0,
        revisions:
          [],
        attachments:
          uploaded.map(
            (file) => ({
              originalFileName:
                file.originalFileName,
              mimeType:
                file.mimeType,
              bytes:
                file.bytes,
              storagePublicId:
                file.publicId,
              status:
                "AVAILABLE",
            }),
          ),
      });

    await createAudit(
      input.tenant._id,
      transfer._id,
      input.actor,
      "MESSAGE_SEND",
      message._id,
    );

    return serializeMessage(
      message,
      transfer,
      input.actor,
    );
  } catch (
    error
  ) {
    await Promise.allSettled(
      uploaded.map(
        (file) =>
          destroyPrivateCommunicationDocument(
            file.publicId,
          ),
      ),
    );

    throw error;
  }
}

export async function updatePieceTransferMessage(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
  messageId:
    string,
  input:
    UpdatePieceTransferMessageInput,
): Promise<PublicPieceTransferMessage> {
  await getActorUser(
    tenant,
    actor,
  );

  const {
    transfer,
    isSender,
    recipient,
  } =
    await getTransferAndAccess(
      tenant,
      actor,
      transferId,
    );

  if (
    !isSender &&
    !recipient
  ) {
    throw new AppError(
      "Vous ne pouvez pas modifier un message de cette communication.",
      403,
      "PIECE_TRANSFER_MESSAGE_EDIT_DENIED",
    );
  }

  if (
    transfer.status !==
    "ACTIVE"
  ) {
    throw new AppError(
      "Cette communication est révoquée.",
      410,
      "PIECE_TRANSFER_REVOKED",
    );
  }

  const message =
    await PieceTransferMessageModel.findOne({
      _id:
        messageId,
      tenantId:
        tenant._id,
      transferId:
        transfer._id,
    }).exec();

  if (!message) {
    throw new AppError(
      "Le message demandé est introuvable.",
      404,
      "PIECE_TRANSFER_MESSAGE_NOT_FOUND",
    );
  }

  if (
    message.status ===
    "DELETED"
  ) {
    throw new AppError(
      "Ce message a été supprimé par l'administrateur.",
      410,
      "PIECE_TRANSFER_MESSAGE_DELETED",
    );
  }

  if (
    message.senderUserId.toString() !==
    actor.userId
  ) {
    throw new AppError(
      "Seul l'auteur peut modifier son propre message.",
      403,
      "PIECE_TRANSFER_MESSAGE_EDIT_DENIED",
    );
  }

  const editableUntil =
    getMessageEditableUntil(
      message,
    );

  if (
    !editableUntil ||
    Date.now() >=
      editableUntil.getTime()
  ) {
    throw new AppError(
      "Le délai de modification de 5 minutes est expiré.",
      409,
      "PIECE_TRANSFER_MESSAGE_EDIT_WINDOW_EXPIRED",
    );
  }

  const nextBody =
    input.body.trim();
  const nextMentions = await validatedMentions(tenant._id, transfer, nextBody, (message.mentions ?? []).map(item => item.userId));

  if (
    !nextBody &&
    countStoredMessageAttachments(
      message,
    ) ===
      0
  ) {
    throw new AppError(
      "Un message sans pièce jointe ne peut pas être vide.",
      400,
      "PIECE_TRANSFER_MESSAGE_EMPTY",
    );
  }

  if (
    nextBody ===
    (
      message.body ??
      ""
    )
  ) {
    return serializeMessage(
      message,
      transfer,
      actor,
    );
  }

  const now =
    new Date();

  message.revisions.push({
    body:
      message.body,
    editedAt:
      now,
  });

  message.mentions = nextMentions;
  message.body =
    nextBody ||
    undefined;

  message.editedAt =
    now;

  message.editCount +=
    1;

  await message.save();

  await createAudit(
    tenant._id,
    transfer._id,
    actor,
    "MESSAGE_EDIT",
    message._id,
  );

  return serializeMessage(
    message,
    transfer,
    actor,
  );
}

async function getMessageAttachmentAndAccess(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
  messageId:
    string,
  fileIndex:
    number,
): Promise<{
  transfer:
    PieceTransferDocument;
  message:
    PieceTransferMessageDocument;
  attachment:
    any;
}> {
  const {
    transfer,
  } =
    await getTransferAndAccess(
      tenant,
      actor,
      transferId,
    );

  const message =
    await PieceTransferMessageModel.findOne({
      _id:
        messageId,
      tenantId:
        tenant._id,
      transferId:
        transfer._id,
    }).exec();

  if (
    !message ||
    message.status ===
      "DELETED"
  ) {
    throw new AppError(
      "Ce message est introuvable ou a été supprimé.",
      404,
      "PIECE_TRANSFER_MESSAGE_NOT_FOUND",
    );
  }

  const attachments =
    getStoredMessageAttachments(
      message,
    );

  const attachment =
    attachments[
      fileIndex
    ];

  if (
    !attachment
  ) {
    throw new AppError(
      "Cette pièce jointe est introuvable.",
      404,
      "PIECE_TRANSFER_MESSAGE_FILE_NOT_FOUND",
    );
  }

  if (
    transfer.status !==
    "ACTIVE"
  ) {
    throw new AppError(
      "Cette communication a été révoquée.",
      410,
      "PIECE_TRANSFER_REVOKED",
    );
  }

  if (
    attachment.status !==
    "AVAILABLE"
  ) {
    throw new AppError(
      "Cette pièce jointe a été supprimée par l'administrateur.",
      410,
      "PIECE_TRANSFER_FILE_DELETED",
    );
  }

  return {
    transfer,
    message,
    attachment,
  };
}

export async function getPieceTransferMessageFileDelivery(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
  messageId:
    string,
  fileIndex:
    number,
  mode:
    | "VIEW"
    | "DOWNLOAD",
): Promise<{
  fileName:
    string;
  mimeType:
    string;
  stream:
    Readable;
  contentLength?: number;
}> {
  await getActorUser(
    tenant,
    actor,
  );

  const {
    transfer,
    message,
    attachment,
  } =
    await getMessageAttachmentAndAccess(
      tenant,
      actor,
      transferId,
      messageId,
      fileIndex,
    );

  await createAudit(
    tenant._id,
    transfer._id,
    actor,
    mode ===
      "VIEW"
      ? "MESSAGE_FILE_VIEW"
      : "MESSAGE_FILE_DOWNLOAD",
    message._id,
  );

  const source =
    await openPrivateCommunicationDocumentStream({
      publicId:
        attachment.storagePublicId,
      originalFileName:
        attachment.originalFileName,
    });

  return {
    fileName:
      attachment.originalFileName,

    mimeType:
      attachment.mimeType,

    stream:
      source.stream,

    contentLength:
      source.contentLength,
  };
}

export async function deletePieceTransferMessageAsAdmin(
  tenant:
    TenantDocument,
  actor:
    Actor,
  messageId:
    string,
): Promise<void> {
  await getActorUser(
    tenant,
    actor,
  );

  assertTenantAdmin(
    actor,
  );

  const message =
    await PieceTransferMessageModel.findOne({
      _id:
        messageId,
      tenantId:
        tenant._id,
    }).exec();

  if (!message) {
    throw new AppError(
      "Le message demandé est introuvable.",
      404,
      "PIECE_TRANSFER_MESSAGE_NOT_FOUND",
    );
  }

  if (
    message.status ===
    "DELETED"
  ) {
    return;
  }

  const attachments =
    getStoredMessageAttachments(
      message,
    );

  for (
    const attachment of attachments
  ) {
    if (
      attachment.status !==
      "AVAILABLE"
    ) {
      continue;
    }

    await destroyPrivateCommunicationDocument(
      attachment.storagePublicId,
    );

    attachment.status =
      "DELETED";

    attachment.deletedAt =
      new Date();

    attachment.deletedByUserId =
      new Types.ObjectId(
        actor.userId,
      );
  }

  if (
    Array.isArray(
      message.attachments,
    ) &&
    message.attachments.length >
      0
  ) {
    message.markModified(
      "attachments",
    );
  } else if (
    message.attachment
  ) {
    message.markModified(
      "attachment",
    );
  }

  message.status =
    "DELETED";

  message.deletedAt =
    new Date();

  message.deletedByUserId =
    new Types.ObjectId(
      actor.userId,
    );

  await message.save();

  await createAudit(
    tenant._id,
    message.transferId,
    actor,
    "MESSAGE_DELETE",
    message._id,
  );
}

export async function deleteTransferRootFileAsAdmin(
  tenant:
    TenantDocument,
  actor:
    Actor,
  transferId:
    string,
): Promise<void> {
  await getActorUser(
    tenant,
    actor,
  );

  assertTenantAdmin(
    actor,
  );

  const transfer =
    await PieceTransferModel.findOne({
      _id:
        transferId,
      tenantId:
        tenant._id,
    }).exec();

  if (!transfer) {
    throw new AppError(
      "La communication demandée est introuvable.",
      404,
      "PIECE_TRANSFER_NOT_FOUND",
    );
  }

  if (
    !transfer.storagePublicId ||
    !transfer.originalFileName
  ) {
    throw new AppError(
      "Cette communication ne contient pas de pièce initiale.",
      404,
      "PIECE_TRANSFER_FILE_NOT_FOUND",
    );
  }

  if (
    transfer.fileStatus ===
    "DELETED"
  ) {
    return;
  }

  await destroyPrivateCommunicationDocument(
    transfer.storagePublicId,
  );

  transfer.fileStatus =
    "DELETED";

  transfer.fileDeletedAt =
    new Date();

  transfer.fileDeletedByUserId =
    new Types.ObjectId(
      actor.userId,
    );

  await transfer.save();

  await createAudit(
    tenant._id,
    transfer._id,
    actor,
    "FILE_DELETE",
  );
}


export async function deleteMessageFileAsAdmin(
  tenant:
    TenantDocument,
  actor:
    Actor,
  messageId:
    string,
  fileIndex:
    number,
): Promise<void> {
  await getActorUser(
    tenant,
    actor,
  );

  assertTenantAdmin(
    actor,
  );

  const message =
    await PieceTransferMessageModel.findOne({
      _id:
        messageId,
      tenantId:
        tenant._id,
    }).exec();

  if (!message) {
    throw new AppError(
      "Le message demandé est introuvable.",
      404,
      "PIECE_TRANSFER_MESSAGE_NOT_FOUND",
    );
  }

  const attachments =
    getStoredMessageAttachments(
      message,
    );

  const attachment =
    attachments[
      fileIndex
    ];

  if (!attachment) {
    throw new AppError(
      "La pièce jointe demandée est introuvable.",
      404,
      "PIECE_TRANSFER_MESSAGE_FILE_NOT_FOUND",
    );
  }

  if (
    attachment.status ===
    "DELETED"
  ) {
    return;
  }

  await destroyPrivateCommunicationDocument(
    attachment.storagePublicId,
  );

  attachment.status =
    "DELETED";

  attachment.deletedAt =
    new Date();

  attachment.deletedByUserId =
    new Types.ObjectId(
      actor.userId,
    );

  if (
    Array.isArray(
      message.attachments,
    ) &&
    message.attachments.length >
      0
  ) {
    message.markModified(
      "attachments",
    );
  } else {
    message.markModified(
      "attachment",
    );
  }

  await message.save();

  await createAudit(
    tenant._id,
    message.transferId,
    actor,
    "FILE_DELETE",
    message._id,
  );
}

export async function listAdminCommunicationFiles(
  tenant: TenantDocument,
  actor: Actor,
  query: ListPieceTransfersQuery,
) {
  await getActorUser(tenant, actor);
  assertTenantAdmin(actor);
  return collectCommunicationFiles(tenant, query);
}

export async function listMyCommunicationFiles(
  tenant: TenantDocument,
  actor: Actor,
  query: ListPieceTransfersQuery,
  direction: "SENT" | "INBOX",
) {
  await getActorUser(tenant, actor);
  const userId = new Types.ObjectId(actor.userId);
  const transferIds = await getParticipantTransferIds(tenant._id, userId);
  return collectCommunicationFiles(tenant, query, { transferIds, userId, direction });
}

async function collectCommunicationFiles(
  tenant: TenantDocument,
  query: ListPieceTransfersQuery,
  scope?: { transferIds: Types.ObjectId[]; userId: Types.ObjectId; direction: "SENT" | "INBOX" },
) {
  const searchRegex =
    query.search
      ? new RegExp(
          escapeRegex(
            query.search,
          ),
          "i",
        )
      : null;

  const transferFilter: Record<
    string,
    any
  > = {
    tenantId:
      tenant._id,
    storagePublicId: {
      $exists:
        true,
      $ne:
        "",
    },
  };

  if (
    searchRegex
  ) {
    transferFilter.$or = [
      {
        title:
          searchRegex,
      },
      {
        originalFileName:
          searchRegex,
      },
      {
        senderNameSnapshot:
          searchRegex,
      },
    ];
  }

  const messageFilter: Record<
    string,
    any
  > = {
    tenantId:
      tenant._id,
    $or: [
      {
        "attachments.0": {
          $exists:
            true,
        },
      },
      {
        "attachment.originalFileName": {
          $exists:
            true,
        },
      },
    ],
  };

  if (scope) {
    // Scope both collections to participation BEFORE reading their file metadata.
    transferFilter._id = { $in: scope.transferIds };
    messageFilter.transferId = { $in: scope.transferIds };
    const senderFilter = scope.direction === "SENT" ? scope.userId : { $ne: scope.userId };
    transferFilter.senderUserId = senderFilter;
    messageFilter.senderUserId = senderFilter;
  }

  const [
    transferFiles,
    allMessageFiles,
  ] =
    await Promise.all([
      PieceTransferModel.find(
        transferFilter,
      )
        .sort({
          createdAt:
            -1,
        })
        .exec(),

      PieceTransferMessageModel.find(
        messageFilter,
      )
        .sort({
          createdAt:
            -1,
        })
        .exec(),
    ]);

  const messageFiles =
    searchRegex
      ? allMessageFiles.filter(
          (message) =>
            searchRegex.test(
              message.body ??
                "",
            ) ||
            searchRegex.test(
              message.senderNameSnapshot,
            ) ||
            getStoredMessageAttachments(
              message,
            ).some(
              (attachment) =>
                searchRegex.test(
                  attachment.originalFileName,
                ),
            ),
        )
      : allMessageFiles;

  const parentTransfers =
    await PieceTransferModel.find({
      tenantId:
        tenant._id,
      _id: {
        $in:
          messageFiles.map(
            (message) =>
              message.transferId,
          ),
      },
    })
      .select(
        "_id title",
      )
      .lean()
      .exec();

  const titleMap =
    new Map(
      parentTransfers.map(
        (
          transfer: any,
        ) => [
          asStringId(
            transfer._id,
          ),
          String(
            transfer.title ??
              "Communication",
          ),
        ],
      ),
    );

  const messageFileRows:
    PublicPieceTransferAdminFile[] =
    messageFiles.flatMap(
      (message) =>
        getStoredMessageAttachments(
          message,
        ).map(
          (
            attachment,
            fileIndex,
          ) => ({
            id:
              `MESSAGE:${message.id}:${fileIndex}`,
            kind:
              "MESSAGE" as const,
            transferId:
              message.transferId.toString(),
            messageId:
              message.id,
            fileIndex,
            senderUserId:
              message.senderUserId.toString(),
            senderName:
              message.senderNameSnapshot,
            title:
              titleMap.get(
                message.transferId.toString(),
              ) ??
              "Communication",
            fileName:
              attachment.originalFileName,
            mimeType:
              attachment.mimeType,
            bytes:
              attachment.bytes,
            fileStatus:
              attachment.status,
            createdAt:
              iso(
                message.createdAt,
              ),
            deletedAt:
              iso(
                attachment.deletedAt,
              ),
          }),
        ),
    );

  const all:
    PublicPieceTransferAdminFile[] =
    [
      ...transferFiles.map(
        (transfer) => ({
          id:
            `TRANSFER:${transfer.id}`,
          kind:
            "TRANSFER" as const,
          transferId:
            transfer.id,
          senderUserId:
            transfer.senderUserId.toString(),
          senderName:
            transfer.senderNameSnapshot,
          title:
            transfer.title,
          fileName:
            transfer.originalFileName!,
          mimeType:
            transfer.mimeType ||
            "application/octet-stream",
          bytes:
            transfer.bytes ||
            0,
          fileStatus:
            transfer.fileStatus ||
            "AVAILABLE",
          createdAt:
            iso(
              transfer.createdAt,
            ),
          deletedAt:
            iso(
              transfer.fileDeletedAt,
            ),
        }),
      ),

      ...messageFileRows,
    ].sort(
      (
        a,
        b,
      ) =>
        new Date(
          b.createdAt ??
            0,
        ).getTime() -
        new Date(
          a.createdAt ??
            0,
        ).getTime(),
    );

  const start =
    (
      query.page -
      1
    ) *
    query.limit;

  return {
    items:
      all.slice(
        start,
        start +
          query.limit,
      ),

    pagination: {
      page:
        query.page,
      limit:
        query.limit,
      total:
        all.length,
      pages:
        Math.max(
          1,
          Math.ceil(
            all.length /
              query.limit,
          ),
        ),
    },
  };
}

export async function listAdminCommunicationMessages(
  tenant: TenantDocument, actor: Actor, query: ListPieceTransfersQuery,
) {
  await getActorUser(tenant, actor);
  assertTenantAdmin(actor);
  return collectCommunicationMessages(tenant, query);
}

export async function listMyCommunicationMessages(
  tenant: TenantDocument, actor: Actor, query: ListPieceTransfersQuery, direction: "SENT" | "INBOX",
) {
  await getActorUser(tenant, actor);
  const userId = new Types.ObjectId(actor.userId);
  const transferIds = await getParticipantTransferIds(tenant._id, userId);
  return collectCommunicationMessages(tenant, query, { transferIds, userId, direction });
}

async function collectCommunicationMessages(
  tenant: TenantDocument, query: ListPieceTransfersQuery,
  scope?: { transferIds: Types.ObjectId[]; userId: Types.ObjectId; direction: "SENT" | "INBOX" },
) {
  const searchRegex =
    query.search
      ? new RegExp(
          escapeRegex(
            query.search,
          ),
          "i",
        )
      : null;

  const transferFilter: Record<
    string,
    any
  > = {
    tenantId:
      tenant._id,
  };

  if (
    searchRegex
  ) {
    transferFilter.$or = [
      {
        title:
          searchRegex,
      },
      {
        description:
          searchRegex,
      },
      {
        senderNameSnapshot:
          searchRegex,
      },
    ];
  }

  const messageFilter: Record<
    string,
    any
  > = {
    tenantId:
      tenant._id,
  };

  if (
    searchRegex
  ) {
    messageFilter.$or = [
      {
        body:
          searchRegex,
      },
      {
        senderNameSnapshot:
          searchRegex,
      },
    ];
  }

  if (scope) {
    transferFilter._id = { $in: scope.transferIds };
    messageFilter.transferId = { $in: scope.transferIds };
    const senderFilter = scope.direction === "SENT" ? scope.userId : { $ne: scope.userId };
    transferFilter.senderUserId = senderFilter;
    messageFilter.senderUserId = senderFilter;
  }

  const [
    transfers,
    messages,
  ] =
    await Promise.all([
      PieceTransferModel.find(
        transferFilter,
      )
        .sort({
          createdAt:
            -1,
        })
        .exec(),

      PieceTransferMessageModel.find(
        messageFilter,
      )
        .sort({
          createdAt:
            -1,
        })
        .exec(),
    ]);

  const parentTransfers =
    await PieceTransferModel.find({
      tenantId:
        tenant._id,
      _id: {
        $in:
          messages.map(
            (message) =>
              message.transferId,
          ),
      },
    })
      .select(
        "_id title",
      )
      .lean()
      .exec();

  const titleMap =
    new Map(
      parentTransfers.map(
        (
          transfer: any,
        ) => [
          asStringId(
            transfer._id,
          ),
          String(
            transfer.title ??
              "Communication",
          ),
        ],
      ),
    );

  const all:
    PublicPieceTransferAdminMessage[] =
    [
      ...transfers.map(
        (transfer) => ({
          id:
            `ROOT:${transfer.id}`,
          kind:
            "ROOT" as const,
          transferId:
            transfer.id,
          communicationTitle:
            transfer.title,
          senderUserId:
            transfer.senderUserId.toString(),
          senderName:
            transfer.senderNameSnapshot,
          senderRole:
            transfer.senderRoleSnapshot,
          body:
            transfer.description,
          status:
            transfer.status ===
              "REVOKED"
              ? "REVOKED" as const
              : "ACTIVE" as const,
          hasAttachment:
            Boolean(
              transfer.storagePublicId &&
              transfer.originalFileName,
            ),
          attachmentName:
            transfer.originalFileName,
          attachmentCount:
            transfer.storagePublicId
              ? 1
              : 0,
          editCount:
            0,
          createdAt:
            iso(
              transfer.createdAt,
            ),
          canDeleteMessage:
            false,
        }),
      ),

      ...messages.map(
        (message) => ({
          id:
            `MESSAGE:${message.id}`,
          kind:
            "MESSAGE" as const,
          transferId:
            message.transferId.toString(),
          messageId:
            message.id,
          communicationTitle:
            titleMap.get(
              message.transferId.toString(),
            ) ??
            "Communication",
          senderUserId:
            message.senderUserId.toString(),
          senderName:
            message.senderNameSnapshot,
          senderRole:
            message.senderRoleSnapshot,
          body:
            message.status ===
              "DELETED"
              ? undefined
              : message.body,
          status:
            message.status,
          hasAttachment:
            countStoredMessageAttachments(
              message,
            ) >
            0,
          attachmentName:
            getStoredMessageAttachments(
              message,
            )[0]
              ?.originalFileName,
          attachmentCount:
            countStoredMessageAttachments(
              message,
            ),
          editedAt:
            iso(
              message.editedAt,
            ),
          editCount:
            message.editCount,
          createdAt:
            iso(
              message.createdAt,
            ),
          deletedAt:
            iso(
              message.deletedAt,
            ),
          canDeleteMessage:
            !scope && message.status === "ACTIVE",
        }),
      ),
    ].sort(
      (
        a,
        b,
      ) =>
        new Date(
          b.createdAt ??
            0,
        ).getTime() -
        new Date(
          a.createdAt ??
            0,
        ).getTime(),
    );

  const start =
    (
      query.page -
      1
    ) *
    query.limit;

  return {
    items:
      all.slice(
        start,
        start +
          query.limit,
      ),

    pagination: {
      page:
        query.page,
      limit:
        query.limit,
      total:
        all.length,
      pages:
        Math.max(
          1,
          Math.ceil(
            all.length /
              query.limit,
          ),
        ),
    },
  };
}

type MutableAgentStats = {
  userIds: string[];
  emails: string[];

  agentId?: string;
  fullName: string;
  role: string;
  isActive: boolean;

  matricule?: string;
  jobTitle?: string;
  directionName?: string;
  serviceName?: string;

  communicationsStarted: number;
  communicationsReceived: number;
  messagesSent: number;
  messagesReceived: number;
  filesSent: number;
  filesReceived: number;
};

export async function getAdminCommunicationOverview(
  tenant:
    TenantDocument,
  actor:
    Actor,
): Promise<PublicPieceTransferAdminOverview> {
  await getActorUser(
    tenant,
    actor,
  );

  assertTenantAdmin(
    actor,
  );

  const [
    users,
    transfers,
    recipients,
    messages,
    readReceipts,
  ] =
    await Promise.all([
      (
        UserModel as any
      )
        .find({
          tenantId:
            tenant._id,
        })
        .select(
          "_id fullName email role isActive agentId",
        )
        .populate({
          path:
            "agentId",
          select:
            "_id fullName matricule jobTitle directionId serviceId",
          populate: [
            {
              path:
                "directionId",
              select:
                "name",
            },
            {
              path:
                "serviceId",
              select:
                "name",
            },
          ],
        })
        .lean()
        .exec() as Promise<
        Array<
          Record<
            string,
            any
          >
        >
      >,

      PieceTransferModel.find({
        tenantId:
          tenant._id,
      })
        .select(
          "_id senderUserId storagePublicId status",
        )
        .lean()
        .exec(),

      PieceTransferRecipientModel.find({
        tenantId:
          tenant._id,
      })
        .select(
          "transferId recipientUserId status isRead firstReadAt",
        )
        .lean()
        .exec(),

      PieceTransferMessageModel.find({
        tenantId:
          tenant._id,
      })
        .select(
          "_id transferId senderUserId attachment attachments status createdAt",
        )
        .lean()
        .exec(),
      PieceTransferReadModel.find({ tenantId: tenant._id }).lean().exec(),
    ]);

  const readStats = computeCommunicationReadStats(
    transfers as any[], recipients as any[], messages as any[], readReceipts as any[],
  );

  const stats =
    new Map<
      string,
      MutableAgentStats
    >();

  const userToKey =
    new Map<
      string,
      string
    >();

  for (
    const user of users
  ) {
    const userId =
      asStringId(
        user._id,
      );

    const agent =
      user.agentId &&
      typeof user.agentId ===
        "object"
        ? user.agentId
        : undefined;

    const agentId =
      agent
        ? asStringId(
            agent._id,
          )
        : undefined;

    const key =
      agentId
        ? `agent:${agentId}`
        : `user:${userId}`;

    userToKey.set(
      userId,
      key,
    );

    const existing =
      stats.get(
        key,
      );

    if (
      existing
    ) {
      existing.userIds.push(
        userId,
      );

      if (
        user.email &&
        !existing.emails.includes(
          String(
            user.email,
          ),
        )
      ) {
        existing.emails.push(
          String(
            user.email,
          ),
        );
      }

      existing.isActive =
        existing.isActive ||
        Boolean(
          user.isActive,
        );

      continue;
    }

    stats.set(
      key,
      {
        userIds: [
          userId,
        ],

        emails:
          user.email
            ? [
                String(
                  user.email,
                ),
              ]
            : [],

        agentId,

        fullName:
          String(
            agent?.fullName ??
              user.fullName ??
              "",
          ),

        role:
          String(
            user.role ??
              "",
          ),

        isActive:
          Boolean(
            user.isActive,
          ),

        matricule:
          agent?.matricule
            ? String(
                agent.matricule,
              )
            : undefined,

        jobTitle:
          agent?.jobTitle
            ? String(
                agent.jobTitle,
              )
            : undefined,

        directionName:
          agent?.directionId &&
          typeof agent.directionId ===
            "object"
            ? String(
                agent.directionId
                  .name ??
                  "",
              ) ||
              undefined
            : undefined,

        serviceName:
          agent?.serviceId &&
          typeof agent.serviceId ===
            "object"
            ? String(
                agent.serviceId
                  .name ??
                  "",
              ) ||
              undefined
            : undefined,

        communicationsStarted:
          0,

        communicationsReceived:
          0,

        messagesSent:
          0,

        messagesReceived:
          0,

        filesSent:
          0,

        filesReceived:
          0,
      },
    );
  }

  const participantsByTransfer =
    new Map<
      string,
      Set<string>
    >();

  const rootFileByTransfer =
    new Map<
      string,
      boolean
    >();

  function statForUser(
    userId:
      string,
  ):
    | MutableAgentStats
    | undefined {
    const key =
      userToKey.get(
        userId,
      );

    return key
      ? stats.get(
          key,
        )
      : undefined;
  }

  for (
    const transfer of transfers as any[]
  ) {
    const transferId =
      asStringId(
        transfer._id,
      );

    const senderId =
      asStringId(
        transfer.senderUserId,
      );

    rootFileByTransfer.set(
      transferId,
      Boolean(
        transfer.storagePublicId,
      ),
    );

    const participants =
      participantsByTransfer.get(
        transferId,
      ) ??
      new Set<
        string
      >();

    participants.add(
      senderId,
    );

    participantsByTransfer.set(
      transferId,
      participants,
    );

    const senderStats =
      statForUser(
        senderId,
      );

    if (
      senderStats
    ) {
      senderStats.communicationsStarted +=
        1;

      senderStats.messagesSent +=
        1;

      if (
        rootFileByTransfer.get(
          transferId,
        )
      ) {
        senderStats.filesSent +=
          1;
      }
    }
  }

  for (
    const recipient of recipients as any[]
  ) {
    const transferId =
      asStringId(
        recipient.transferId,
      );

    const recipientId =
      asStringId(
        recipient.recipientUserId,
      );

    const participants =
      participantsByTransfer.get(
        transferId,
      ) ??
      new Set<
        string
      >();

    participants.add(
      recipientId,
    );

    participantsByTransfer.set(
      transferId,
      participants,
    );

    const recipientStats =
      statForUser(
        recipientId,
      );

    if (
      recipientStats
    ) {
      recipientStats.communicationsReceived +=
        1;

      recipientStats.messagesReceived +=
        1;

      if (
        rootFileByTransfer.get(
          transferId,
        )
      ) {
        recipientStats.filesReceived +=
          1;
      }
    }
  }

  for (
    const message of messages as any[]
  ) {
    const transferId =
      asStringId(
        message.transferId,
      );

    const senderId =
      asStringId(
        message.senderUserId,
      );

    const attachmentCount =
      countStoredMessageAttachments(
        message,
      );

    const senderStats =
      statForUser(
        senderId,
      );

    if (
      senderStats
    ) {
      senderStats.messagesSent +=
        1;

      if (
        attachmentCount >
        0
      ) {
        senderStats.filesSent +=
          attachmentCount;
      }
    }

    const participants =
      participantsByTransfer.get(
        transferId,
      ) ??
      new Set<
        string
      >();

    for (
      const participantId of participants
    ) {
      if (
        participantId ===
        senderId
      ) {
        continue;
      }

      const recipientStats =
        statForUser(
          participantId,
        );

      if (
        recipientStats
      ) {
        recipientStats.messagesReceived +=
          1;

        if (
          attachmentCount >
          0
        ) {
          recipientStats.filesReceived +=
            attachmentCount;
        }
      }
    }
  }

  const agents:
    PublicPieceTransferAgentStats[] =
    [
      ...stats.entries(),
    ]
      .map(
        (
          [
            key,
            row,
          ],
        ) => ({
          entityId:
            key,

          agentId:
            row.agentId,

          userIds:
            row.userIds,

          fullName:
            row.fullName,

          emails:
            row.emails,

          role:
            row.role,

          isActive:
            row.isActive,

          matricule:
            row.matricule,

          jobTitle:
            row.jobTitle,

          directionName:
            row.directionName,

          serviceName:
            row.serviceName,

          communicationsStarted:
            row.communicationsStarted,

          communicationsReceived:
            row.communicationsReceived,

          messagesSent:
            row.messagesSent,

          messagesReceived:
            row.messagesReceived,

          filesSent:
            row.filesSent,

          filesReceived:
            row.filesReceived,

          ...row.userIds.reduce((total, userId) => {
            const reading = readStats.get(userId);
            total.activeMessagesReceived += reading?.activeMessagesReceived ?? 0;
            total.messagesRead += reading?.messagesRead ?? 0;
            total.messagesUnread += reading?.messagesUnread ?? 0;
            total.unreadCommunications += reading?.unreadCommunications ?? 0;
            return total;
          }, { activeMessagesReceived: 0, messagesRead: 0, messagesUnread: 0, unreadCommunications: 0 }),

          totalActivity:
            row.messagesSent +
            row.messagesReceived +
            row.filesSent +
            row.filesReceived,
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.totalActivity -
            a.totalActivity ||
          a.fullName.localeCompare(
            b.fullName,
            "fr",
          ),
      );

  const totals =
    agents.reduce(
      (
        accumulator,
        row,
      ) => {
        accumulator.messagesSent +=
          row.messagesSent;

        accumulator.messagesReceived +=
          row.messagesReceived;

        accumulator.filesSent +=
          row.filesSent;

        accumulator.filesReceived +=
          row.filesReceived;

        accumulator.communicationsStarted +=
          row.communicationsStarted;

        accumulator.communicationsReceived +=
          row.communicationsReceived;

        accumulator.activeMessagesReceived += row.activeMessagesReceived;
        accumulator.messagesRead += row.messagesRead;
        accumulator.messagesUnread += row.messagesUnread;
        accumulator.agentsWithUnread += row.messagesUnread > 0 ? 1 : 0;
        return accumulator;
      },
      {
        activeMessagesReceived: 0,
        messagesRead: 0,
        messagesUnread: 0,
        agentsWithUnread: 0,
        messagesSent:
          0,
        messagesReceived:
          0,
        filesSent:
          0,
        filesReceived:
          0,
        communicationsStarted:
          0,
        communicationsReceived:
          0,
      },
    );

  return {
    totals,
    agents,
  };
}

/** Personal notifications. Administration access never creates personal unread items. */
export async function getPieceTransferNotifications(
  tenant: TenantDocument, actor: Actor, query: ListPieceTransfersQuery,
) {
  await getActorUser(tenant, actor);
  const userId = new Types.ObjectId(actor.userId);
  const rows = await PieceTransferRecipientModel.find({
    tenantId: tenant._id, recipientUserId: userId, status: "ACTIVE",
  }).exec();
  const transfers = await PieceTransferModel.find({
    tenantId: tenant._id, status: "ACTIVE",
    $or: [{ senderUserId: userId }, { _id: { $in: rows.map(row => row.transferId) } }],
  }).exec();
  await hydrateDirectNames(tenant._id, transfers);
  const recipientMap = new Map(rows.map(row => [row.transferId.toString(), row]));
  const reads = await PieceTransferReadModel.find({
    tenantId: tenant._id, userId, transferId: { $in: transfers.map(row => row._id) },
  }).lean().exec();
  const readMap = new Map(reads.map(row => [String(row.transferId), row]));
  const thresholds = transfers.map(transfer => {
    const read = readMap.get(transfer.id);
    const recipient = recipientMap.get(transfer.id);
    // Preserve historical first-read state; later replies are still new.
    const at = read?.lastReadMessageAt ?? recipient?.firstReadAt ?? new Date(0);
    const id = read?.lastReadMessageId ?? new Types.ObjectId("ffffffffffffffffffffffff");
    return { transferId: transfer._id, $or: [
      { createdAt: { $gt: at } }, { createdAt: at, _id: { $gt: id } },
    ] };
  });
  const counts = thresholds.length ? await PieceTransferMessageModel.aggregate<{
    _id: Types.ObjectId; count: number; latestAt: Date; mentionCount: number; latestMentionAt: Date | null;
  }>([
    { $match: { tenantId: tenant._id, senderUserId: { $ne: userId }, status: "ACTIVE", $or: thresholds } },
    { $group: { _id: "$transferId", count: { $sum: 1 }, latestAt: { $max: "$createdAt" },
      mentionCount: { $sum: { $cond: [{ $in: [actor.userId, { $ifNull: ["$mentions.userId", []] }] }, 1, 0] } },
      latestMentionAt: { $max: { $cond: [{ $in: [actor.userId, { $ifNull: ["$mentions.userId", []] }] }, "$createdAt", null] } },
    } },
  ]).exec() : [];
  const countMap = new Map(counts.map(row => [row._id.toString(), row]));
  const unreadItems = transfers.flatMap(transfer => {
    const recipient = recipientMap.get(transfer.id);
    const rootUnread = transfer.senderUserId.toString() !== actor.userId && recipient?.isRead === false ? 1 : 0;
    const messages = countMap.get(transfer.id);
    const unreadMessageCount = rootUnread + (messages?.count ?? 0);
    if (!unreadMessageCount) return [];
    const item = transfer.senderUserId.toString() === actor.userId
      ? serializeSentItem(transfer, actor) : serializeInboxItem(recipient!, transfer, actor);
    return [{ ...item, isRead: false, unreadMessageCount, unreadMentionCount: messages?.mentionCount ?? 0,
      latestMentionAt: messages?.latestMentionAt?.toISOString(),
      lastActivityAt: (messages?.latestAt ?? transfer.createdAt)?.toISOString() }];
  }).sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") || a.id.localeCompare(b.id));
  const unreadMessages = unreadItems.reduce((total, item) => total + item.unreadMessageCount, 0);
  const unreadMentions = unreadItems.reduce((total, item) => total + item.unreadMentionCount, 0);
  const mentionAlerts = unreadItems.filter(item => item.unreadMentionCount > 0).sort((left, right) => (right.latestMentionAt ?? "").localeCompare(left.latestMentionAt ?? "")).slice(0, 20).map(item => ({ transferId: item.id, title: item.title, count: item.unreadMentionCount, latestAt: item.latestMentionAt }));
  const regex = query.search ? new RegExp(escapeRegex(query.search), "i") : null;
  const filtered = regex ? unreadItems.filter(item =>
    [item.title, item.description, item.senderName, item.originalFileName].some(value => value && regex.test(value)),
  ) : unreadItems;
  const skip = (query.page - 1) * query.limit;
  return {
    unreadMessages, unreadCommunications: unreadItems.length, unreadMentions, mentionAlerts,
    items: filtered.slice(skip, skip + query.limit),
    pagination: { page: query.page, limit: query.limit, total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / query.limit)) },
  };
}

/** Acknowledge only the latest message actually supplied to the reader, never future messages. */
export async function markPieceTransferMessagesRead(
  tenant: TenantDocument, actor: Actor, transferId: string, messageId?: string,
): Promise<void> {
  await getActorUser(tenant, actor);
  const { transfer, recipient, isSender } = await getTransferAndAccess(tenant, actor, transferId);
  if ((!recipient && !isSender) || transfer.status !== "ACTIVE") return;
  if (!messageId) return;
  const message = await PieceTransferMessageModel.findOne({
    _id: new Types.ObjectId(messageId), tenantId: tenant._id, transferId: transfer._id,
  }).exec();
  if (!message) throw new AppError("Message introuvable.", 404, "MESSAGE_NOT_FOUND");
  const filter = { tenantId: tenant._id, transferId: transfer._id, userId: new Types.ObjectId(actor.userId) };
  const newer = { $or: [
    { $gt: [message.createdAt, { $ifNull: ["$lastReadMessageAt", new Date(0)] }] },
    { $and: [
      { $eq: [message.createdAt, "$lastReadMessageAt"] },
      { $gt: [message._id, "$lastReadMessageId"] },
    ] },
  ] };
  const update = [{ $set: {
    ...filter,
    lastReadMessageAt: { $cond: [newer, message.createdAt, "$lastReadMessageAt"] },
    lastReadMessageId: { $cond: [newer, message._id, "$lastReadMessageId"] },
  } }];
  try {
    const options = { upsert: true, updatePipeline: true };
    await PieceTransferReadModel.updateOne(filter, update, options).exec();
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const options = { upsert: false, updatePipeline: true };
    await PieceTransferReadModel.updateOne(filter, update, options).exec();
  }
}

/** Explicit set/remove makes retries idempotent; the update is atomic per message. */
export async function setPieceTransferReaction(tenant: TenantDocument, actor: Actor, transferId: string, messageId: string, emoji: string | null): Promise<PublicPieceTransferMessage> {
  await getActorUser(tenant, actor);
  const access = await getTransferAndAccess(tenant, actor, transferId);
  if ((!access.isSender && !access.recipient) || access.transfer.status !== "ACTIVE") {
    throw new AppError("Vous ne pouvez pas réagir dans cette discussion.", 403, "REACTION_NOT_ALLOWED");
  }
  const allowed = ["👍", "❤️", "😂", "🙏", "💪", "👋", "👏", "✅"];
  if (emoji !== null && !allowed.includes(emoji)) throw new AppError("Réaction invalide.", 400, "INVALID_REACTION");
  const remaining = { $filter: { input: { $ifNull: ["$reactions", []] }, as: "reaction", cond: { $ne: ["$$reaction.userId", actor.userId] } } };
  const reactionOptions = { new: true, updatePipeline: true };
  const message = await PieceTransferMessageModel.findOneAndUpdate(
    { _id: messageId, tenantId: tenant._id, transferId: access.transfer._id, status: "ACTIVE" },
    [{ $set: { reactions: emoji === null ? remaining : { $concatArrays: [remaining, [{ userId: actor.userId, emoji }]] } } }],
    reactionOptions,
  );
  if (!message) throw new AppError("Message indisponible.", 404, "REACTION_MESSAGE_NOT_FOUND");
  return serializeMessage(message, access.transfer, actor);
}

export async function forwardPieceTransferToAgents(tenant: TenantDocument, actor: Actor, transferId: string, messageId: string, recipientUserIds: string[], mode: "INDIVIDUAL" | "COMMON" = "INDIVIDUAL", groupName?: string): Promise<{ mode: "INDIVIDUAL" | "COMMON"; transfers: Array<{ transferId: string; recipientUserIds: string[] }>; failedRecipientUserIds: string[] }> {
  await getActorUser(tenant, actor);
  const source = await getTransferAndAccess(tenant, actor, transferId);
  if ((!source.isSender && !source.recipient) || source.transfer.status !== "ACTIVE") {
    throw new AppError("Ce message ne peut pas être transféré.", 403, "FORWARD_NOT_ALLOWED");
  }
  const original = await PieceTransferMessageModel.findOne({ _id: messageId, tenantId: tenant._id, transferId: source.transfer._id, status: "ACTIVE" });
  if (!original) throw new AppError("Message source indisponible.", 404, "FORWARD_MESSAGE_NOT_FOUND");
  const ids = [...new Set(recipientUserIds)];
  if (mode === "COMMON" && !groupName?.trim()) throw new AppError("Donnez un nom à la discussion commune.", 400, "GROUP_NAME_REQUIRED");
  const metadata = { title: mode === "COMMON" ? groupName!.trim().slice(0, 180) : "", audienceMode: "SELECTED" as const, recipientUserIds: ids };
  // Validate all recipients before creating any discussion.
  await resolveRecipients(tenant, actor.userId, metadata);
  const groups = mode === "COMMON" ? [ids] : ids.map(id => [id]);
  const transfers: Array<{ transferId: string; recipientUserIds: string[] }> = [];
  const failedRecipientUserIds: string[] = [];
  for (const group of groups) {
    let createdId: string | undefined;
    try {
      const title = mode === "COMMON" ? metadata.title : "";
      const created = await createPieceTransfer({ tenant, actor, metadata: { ...metadata, title, recipientUserIds: group } });
      createdId = created.id;
      await sendPieceTransferMessage({ tenant, actor, transferId: created.id, metadata: { forwardTransferId: transferId, forwardMessageId: messageId } });
      transfers.push({ transferId: created.id, recipientUserIds: group });
    } catch (error) {
      if (createdId) await revokePieceTransfer(tenant, actor, createdId);
      if (mode === "COMMON") throw error;
      failedRecipientUserIds.push(...group);
    }
  }
  return { mode, transfers, failedRecipientUserIds };
}
