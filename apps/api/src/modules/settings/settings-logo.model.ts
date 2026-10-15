import mongoose, { Schema, type Types } from "mongoose";
export type SettingsLogoAsset = {
  tenantId: Types.ObjectId; publicId: string; url: string;
  status: "UPLOADING" | "STAGED" | "DELETE_PENDING" | "DELETING" | "DELETED";
  attempts: number; nextAttemptAt: Date; leaseUntil?: Date | null;
  createdAt: Date; updatedAt: Date;
};
const schema = new Schema<SettingsLogoAsset>({
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  publicId: { type: String, required: true, unique: true },
  url: { type: String, default: "" },
  status: { type: String, enum: ["UPLOADING", "STAGED", "DELETE_PENDING", "DELETING", "DELETED"], default: "UPLOADING", required: true },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
schema.index({ status: 1, nextAttemptAt: 1 });
export const SettingsLogoAssetModel = mongoose.models.SettingsLogoAsset as mongoose.Model<SettingsLogoAsset> | undefined
  ?? mongoose.model<SettingsLogoAsset>("SettingsLogoAsset", schema);
