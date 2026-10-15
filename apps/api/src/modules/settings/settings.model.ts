import mongoose, { Schema, type Model } from "mongoose";
import type {
  TenantSettingsRecord,
  TenantSettingsRevision,
} from "./settings.types.js";

const tenantSettingsSchema = new Schema<TenantSettingsRecord>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true, index: true },
    editRevision: { type: Number, default: 0, min: 0 },
    active: { type: Schema.Types.Mixed, required: true },
    draft: { type: Schema.Types.Mixed, default: null },
    activeVersion: { type: Number, required: true, default: 1, min: 1 },
    draftBaseVersion: { type: Number, default: null },
    draftUpdatedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    draftUpdatedByName: { type: String, trim: true, default: null },
    draftUpdatedAt: { type: Date, default: null },
    publishedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    publishedByName: { type: String, trim: true, default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

const tenantSettingsRevisionSchema = new Schema<TenantSettingsRevision>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    snapshot: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    changedSections: { type: [String], required: true, default: [] },
    changeSummary: { type: [String], required: true, default: [] },
    publishedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedByName: { type: String, required: true, trim: true },
    publishedAt: { type: Date, required: true, default: Date.now },
    restoredFromVersion: { type: Number },
  },
  { timestamps: true, versionKey: false },
);

tenantSettingsRevisionSchema.index({ tenantId: 1, version: -1 }, { unique: true });

export const TenantSettingsModel: Model<TenantSettingsRecord> =
  (mongoose.models.TenantSettings as Model<TenantSettingsRecord> | undefined) ??
  mongoose.model<TenantSettingsRecord>("TenantSettings", tenantSettingsSchema);

export const TenantSettingsRevisionModel: Model<TenantSettingsRevision> =
  (mongoose.models.TenantSettingsRevision as Model<TenantSettingsRevision> | undefined) ??
  mongoose.model<TenantSettingsRevision>("TenantSettingsRevision", tenantSettingsRevisionSchema);
