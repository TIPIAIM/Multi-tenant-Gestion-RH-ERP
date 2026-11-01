import mongoose, { Schema, type Types, type Model } from "mongoose";
import type { Storage } from "./files.types.js";
export interface Deletion {
  tenantId: Types.ObjectId;
  fileKey: string;
  slug: string;
  name: string;
  storage: Storage;
  state: "PENDING" | "RUNNING" | "DONE";
  attempts: number;
  leaseUntil: Date;
  nextAttemptAt: Date;
  deletedAt: Date;
  actorId: Types.ObjectId;
  actorName: string;
  references: number;
  lastError: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface Audit {
  tenantId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  action: string;
  fileKey: string;
  name: string;
  count: number;
  createdAt: Date;
}
export interface ExportPart {
  id: string;
  name: string;
  bytes: number;
  keys: string[];
}
export interface Export {
  tenantId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  total: number;
  processed: number;
  downloaded: number;
  failed: number;
  parts: ExportPart[];
  message: string;
  heartbeatAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<Deletion>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    fileKey: { type: String, required: true },
    slug: String,
    name: String,
    storage: { type: Schema.Types.Mixed, required: true },
    state: {
      type: String,
      enum: ["PENDING", "RUNNING", "DONE"],
      default: "PENDING",
    },
    attempts: { type: Number, default: 0 },
    leaseUntil: Date,
    nextAttemptAt: Date,
    deletedAt: Date,
    actorId: Schema.Types.ObjectId,
    actorName: String,
    references: Number,
    lastError: String,
  },
  { timestamps: true },
);
schema.index({ tenantId: 1, fileKey: 1 }, { unique: true });
schema.index({ state: 1, nextAttemptAt: 1 });
export const FileDeletion: Model<Deletion> =
  (mongoose.models.FileDeletion as Model<Deletion> | undefined) ??
  mongoose.model<Deletion>("FileDeletion", schema);
const audit = new Schema<Audit>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    actorId: Schema.Types.ObjectId,
    actorName: String,
    action: String,
    fileKey: String,
    name: String,
    count: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
audit.index({ tenantId: 1, createdAt: -1 });
export const FileAudit: Model<Audit> =
  (mongoose.models.FileAudit as Model<Audit> | undefined) ??
  mongoose.model<Audit>("FileAudit", audit);
const exportsSchema = new Schema<Export>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    actorId: Schema.Types.ObjectId,
    actorName: String,
    status: {
      type: String,
      enum: ["RUNNING", "COMPLETED", "FAILED"],
      default: "RUNNING",
    },
    total: Number,
    processed: { type: Number, default: 0 },
    downloaded: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    parts: {
      type: [
        new Schema<ExportPart>(
          { id: String, name: String, bytes: Number, keys: [String] },
          { _id: false },
        ),
      ],
      default: [],
    },
    message: String,
    heartbeatAt: Date,
    expiresAt: Date,
  },
  { timestamps: true },
);
exportsSchema.index(
  { tenantId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "RUNNING" } },
);
exportsSchema.index({ expiresAt: 1 });
export const FileExport: Model<Export> =
  (mongoose.models.FileExport as Model<Export> | undefined) ??
  mongoose.model<Export>("FileExport", exportsSchema);
export async function ensureFileIndexes() {
  await FileDeletion.createIndexes();
  await FileAudit.createIndexes();
  await FileExport.createIndexes();
}
