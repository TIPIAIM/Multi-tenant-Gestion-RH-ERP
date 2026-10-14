import mongoose, { Schema, type Model, type Types } from "mongoose";

interface PieceTransferRead {
  tenantId: Types.ObjectId;
  transferId: Types.ObjectId;
  userId: Types.ObjectId;
  lastReadMessageAt: Date;
  lastReadMessageId: Types.ObjectId;
}

const readSchema = new Schema<PieceTransferRead>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    transferId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    lastReadMessageAt: { type: Date, required: true },
    lastReadMessageId: { type: Schema.Types.ObjectId, required: true },
  },
  { versionKey: false },
);

readSchema.index(
  { tenantId: 1, userId: 1, transferId: 1 },
  { unique: true },
);

export const PieceTransferReadModel: Model<PieceTransferRead> =
  (mongoose.models.PieceTransferRead as Model<PieceTransferRead> | undefined) ??
  mongoose.model<PieceTransferRead>("PieceTransferRead", readSchema);
