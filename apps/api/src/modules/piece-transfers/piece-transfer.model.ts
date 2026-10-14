import mongoose, {
  Schema,
  type Model,
} from "mongoose";
import {
  pieceTransferAudienceModes,
  pieceTransferAuditActions,
  pieceTransferFileStatuses,
  pieceTransferMessageStatuses,
  pieceTransferStatuses,
  type PieceTransfer,
  type PieceTransferAudit,
  type PieceTransferMessage,
  type PieceTransferRecipient,
} from "./piece-transfer.types.js";

const pieceTransferSchema =
  new Schema<PieceTransfer>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
      },

      senderUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      senderNameSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      senderRoleSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },

      directRecipientName: { type: String, trim: true, maxlength: 160 },
      groupName: { type: String, trim: true, maxlength: 180 },
      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 180,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 2000,
      },

      originalFileName: {
        type: String,
        trim: true,
        maxlength: 255,
      },

      mimeType: {
        type: String,
        trim: true,
        maxlength: 140,
      },

      bytes: {
        type: Number,
        min: 1,
      },

      storagePublicId: {
        type: String,
        trim: true,
      },

      fileStatus: {
        type: String,
        enum: [...pieceTransferFileStatuses],
        index: true,
      },

      fileDeletedAt: {
        type: Date,
      },

      fileDeletedByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      audienceMode: {
        type: String,
        required: true,
        enum: [...pieceTransferAudienceModes],
      },

      recipientCount: {
        type: Number,
        required: true,
        min: 1,
      },

      status: {
        type: String,
        required: true,
        enum: [...pieceTransferStatuses],
        default: "ACTIVE",
        index: true,
      },

      revokedAt: {
        type: Date,
      },

      revokedByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );

pieceTransferSchema.index(
  { storagePublicId: 1 },
  { name: "storagePublicId_optional_unique", unique: true,
    partialFilterExpression: { storagePublicId: { $type: "string" } } },
);

pieceTransferSchema.index({
  tenantId: 1,
  senderUserId: 1,
  createdAt: -1,
});

pieceTransferSchema.index({
  tenantId: 1,
  status: 1,
  createdAt: -1,
});

const pieceTransferRecipientSchema =
  new Schema<PieceTransferRecipient>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
      },

      transferId: {
        type: Schema.Types.ObjectId,
        ref: "PieceTransfer",
        required: true,
        index: true,
      },

      recipientUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      recipientNameSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      senderUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      senderNameSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      titleSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 180,
      },

      descriptionSnapshot: {
        type: String,
        trim: true,
        maxlength: 2000,
      },

      originalFileNameSnapshot: {
        type: String,
        trim: true,
        maxlength: 255,
      },

      mimeTypeSnapshot: {
        type: String,
        trim: true,
        maxlength: 140,
      },

      bytesSnapshot: {
        type: Number,
        min: 1,
      },

      status: {
        type: String,
        required: true,
        enum: [...pieceTransferStatuses],
        default: "ACTIVE",
        index: true,
      },

      isRead: {
        type: Boolean,
        required: true,
        default: false,
        index: true,
      },

      firstReadAt: {
        type: Date,
      },

      lastViewedAt: {
        type: Date,
      },

      viewCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },

      lastDownloadedAt: {
        type: Date,
      },

      downloadCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );

pieceTransferRecipientSchema.index(
  {
    tenantId: 1,
    transferId: 1,
    recipientUserId: 1,
  },
  {
    unique: true,
  },
);

pieceTransferRecipientSchema.index({
  tenantId: 1,
  recipientUserId: 1,
  status: 1,
  createdAt: -1,
});

const messageAttachmentSchema =
  new Schema(
    {
      originalFileName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 255,
      },

      mimeType: {
        type: String,
        required: true,
        trim: true,
        maxlength: 140,
      },

      bytes: {
        type: Number,
        required: true,
        min: 1,
      },

      storagePublicId: {
        type: String,
        required: true,
        trim: true,
      },

      status: {
        type: String,
        required: true,
        enum: [...pieceTransferFileStatuses],
        default: "AVAILABLE",
      },

      deletedAt: {
        type: Date,
      },

      deletedByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },
    {
      _id: false,
    },
  );

const messageRevisionSchema =
  new Schema(
    {
      body: {
        type: String,
        maxlength: 4000,
      },

      editedAt: {
        type: Date,
        required: true,
      },
    },
    {
      _id: false,
    },
  );

const pieceTransferMessageSchema =
  new Schema<PieceTransferMessage>(
    {
      replyTo: { type: new Schema({ messageId: { type: String, required: true }, senderName: { type: String, required: true }, body: String, attachmentName: String }, { _id: false }), required: false },
      forwarded: { type: Boolean, default: false },
      mentions: { type: [new Schema({ userId: String, fullName: String, start: Number, end: Number }, { _id: false })], default: [] },
      reactions: { type: [new Schema({ userId: { type: String, required: true }, emoji: { type: String, required: true, enum: ["👍", "❤️", "😂", "🙏", "💪", "👋", "👏", "✅"] } }, { _id: false })], default: [] },
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
      },

      transferId: {
        type: Schema.Types.ObjectId,
        ref: "PieceTransfer",
        required: true,
        index: true,
      },

      senderUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      senderNameSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      senderRoleSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },

      body: {
        type: String,
        trim: true,
        maxlength: 4000,
      },

      /**
       * Champ historique conservé pour lire les messages créés avant V6.
       * Les nouveaux messages sont écrits dans `attachments`.
       */
      attachment: {
        type: messageAttachmentSchema,
      },

      attachments: {
        type: [messageAttachmentSchema],
        default: [],
      },

      status: {
        type: String,
        required: true,
        enum: [...pieceTransferMessageStatuses],
        default: "ACTIVE",
        index: true,
      },

      editedAt: {
        type: Date,
      },

      editCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },

      revisions: {
        type: [messageRevisionSchema],
        default: [],
      },

      deletedAt: {
        type: Date,
      },

      deletedByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );

pieceTransferMessageSchema.index({
  tenantId: 1,
  transferId: 1,
  createdAt: 1,
});

pieceTransferMessageSchema.index({
  tenantId: 1,
  senderUserId: 1,
  createdAt: -1,
});

const pieceTransferAuditSchema =
  new Schema<PieceTransferAudit>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
      },

      transferId: {
        type: Schema.Types.ObjectId,
        ref: "PieceTransfer",
        required: true,
        index: true,
      },

      messageId: {
        type: Schema.Types.ObjectId,
        ref: "PieceTransferMessage",
      },

      actorUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      actorRoleSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },

      action: {
        type: String,
        required: true,
        enum: [...pieceTransferAuditActions],
        index: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );

pieceTransferAuditSchema.index({
  tenantId: 1,
  transferId: 1,
  createdAt: -1,
});

export const PieceTransferModel: Model<PieceTransfer> =
  (mongoose.models.PieceTransfer as
    | Model<PieceTransfer>
    | undefined) ??
  mongoose.model<PieceTransfer>(
    "PieceTransfer",
    pieceTransferSchema,
  );

export const PieceTransferRecipientModel:
  Model<PieceTransferRecipient> =
  (mongoose.models.PieceTransferRecipient as
    | Model<PieceTransferRecipient>
    | undefined) ??
  mongoose.model<PieceTransferRecipient>(
    "PieceTransferRecipient",
    pieceTransferRecipientSchema,
  );

export const PieceTransferMessageModel:
  Model<PieceTransferMessage> =
  (mongoose.models.PieceTransferMessage as
    | Model<PieceTransferMessage>
    | undefined) ??
  mongoose.model<PieceTransferMessage>(
    "PieceTransferMessage",
    pieceTransferMessageSchema,
  );

export const PieceTransferAuditModel:
  Model<PieceTransferAudit> =
  (mongoose.models.PieceTransferAudit as
    | Model<PieceTransferAudit>
    | undefined) ??
  mongoose.model<PieceTransferAudit>(
    "PieceTransferAudit",
    pieceTransferAuditSchema,
  );
