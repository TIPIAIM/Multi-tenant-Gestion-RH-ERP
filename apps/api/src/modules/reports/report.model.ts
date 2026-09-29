import mongoose, { Schema, type Model } from "mongoose";
import {
  managementReportScopeTypes,
  managementReportStatuses,
  managementReportTypes,
  type ManagementReport,
  type ManagementReportEditorial,
  type ManagementReportScopeSnapshot,
} from "./report.types.js";

const scopeSnapshotSchema = new Schema<ManagementReportScopeSnapshot>(
  {
    scopeType: { type: String, required: true, enum: [...managementReportScopeTypes] },
    directionName: { type: String, trim: true, maxlength: 220 },
    serviceName: { type: String, trim: true, maxlength: 220 },
  },
  { _id: false },
);

const editorialSchema = new Schema<ManagementReportEditorial>(
  {
    introduction: { type: String, trim: true, maxlength: 8000 },
    highlights: { type: String, trim: true, maxlength: 8000 },
    difficulties: { type: String, trim: true, maxlength: 8000 },
    actionsTaken: { type: String, trim: true, maxlength: 8000 },
    outlook: { type: String, trim: true, maxlength: 8000 },
    confidentialNote: { type: String, trim: true, maxlength: 8000 },
  },
  { _id: false },
);

const managementReportSchema = new Schema<ManagementReport>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    reference: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true, maxlength: 260 },
    reportType: { type: String, required: true, enum: [...managementReportTypes], index: true },
    reportYear: { type: Number, required: true, min: 2000, max: 2100, index: true },
    reportMonth: { type: Number, min: 1, max: 12 },
    reportSemester: { type: Number, enum: [1, 2] },
    periodStartDate: { type: Date, required: true },
    periodEndDate: { type: Date, required: true },
    calculationEndDate: { type: Date, required: true },
    scopeType: { type: String, required: true, enum: [...managementReportScopeTypes], index: true },
    directionId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", default: null, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", default: null, index: true },
    scopeSnapshot: { type: scopeSnapshotSchema, required: true },
    status: { type: String, required: true, enum: [...managementReportStatuses], default: "READY", index: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    intelligence: { type: Schema.Types.Mixed, required: true },
    editorial: { type: editorialSchema, default: {} },
    preparedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    preparedByName: { type: String, required: true, trim: true, maxlength: 180 },
    preparedAt: { type: Date, required: true, default: Date.now },
    validatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    validatedByName: { type: String, trim: true, maxlength: 180 },
    validatedAt: { type: Date },
    validationComment: { type: String, trim: true, maxlength: 5000 },
    archivedAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUpdatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false },
);

managementReportSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
managementReportSchema.index({ tenantId: 1, reportYear: -1, reportType: 1, status: 1 });
managementReportSchema.index({ tenantId: 1, directionId: 1, serviceId: 1, periodEndDate: -1 });
managementReportSchema.index({ tenantId: 1, scopeType: 1, createdAt: -1 });

export const ManagementReportModel: Model<ManagementReport> =
  (mongoose.models.ManagementReport as Model<ManagementReport> | undefined) ??
  mongoose.model<ManagementReport>("ManagementReport", managementReportSchema);
