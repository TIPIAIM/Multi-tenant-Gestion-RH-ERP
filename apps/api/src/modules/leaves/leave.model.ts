import mongoose, { Schema, type Model } from "mongoose";
import {
  leaveActivityActions,
  leaveRequestStatuses,
  leaveReviewDecisions,
  leaveTypes,
  type LeaveActivity,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveReview,
} from "./leave.types.js";

const leaveReviewSchema = new Schema<LeaveReview>(
  {
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewedByName: { type: String, required: true, trim: true, maxlength: 160 },
    decision: { type: String, required: true, enum: [...leaveReviewDecisions] },
    comment: { type: String, trim: true, maxlength: 1200 },
    decidedAt: { type: Date, required: true },
  },
  { _id: false },
);

const leaveBalanceSchema = new Schema<LeaveBalance>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    calendarYear: { type: Number, required: true, min: 2020, max: 2200 },
    leaveType: { type: String, required: true, enum: [...leaveTypes] },
    openingDays: { type: Number, required: true, default: 0 },
    entitledDays: { type: Number, required: true, default: 0 },
    carriedOverDays: { type: Number, required: true, default: 0 },
    adjustmentDays: { type: Number, required: true, default: 0 },
    consumedDays: { type: Number, required: true, default: 0, min: 0 },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false },
);

leaveBalanceSchema.index(
  { tenantId: 1, agentId: 1, calendarYear: 1, leaveType: 1 },
  { unique: true },
);
leaveBalanceSchema.index({ tenantId: 1, calendarYear: 1, agentId: 1 });

const leaveRequestSchema = new Schema<LeaveRequest>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    directionId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", default: null },
    leaveType: { type: String, required: true, enum: [...leaveTypes] },
    startDate: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    requestedDays: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
    status: { type: String, required: true, enum: [...leaveRequestStatuses], default: "DRAFT" },
    submittedAt: { type: Date },
    managerReview: { type: leaveReviewSchema },
    finalReview: { type: leaveReviewSchema },
    cancelledAt: { type: Date },
    cancelledByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    cancellationReason: { type: String, trim: true, maxlength: 1000 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUpdatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false },
);

leaveRequestSchema.index({ tenantId: 1, agentId: 1, status: 1, startDate: -1 });
leaveRequestSchema.index({ tenantId: 1, directionId: 1, serviceId: 1, status: 1, startDate: -1 });
leaveRequestSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

const leaveActivitySchema = new Schema<LeaveActivity>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    leaveRequestId: { type: Schema.Types.ObjectId, ref: "LeaveRequest" },
    leaveBalanceId: { type: Schema.Types.ObjectId, ref: "LeaveBalance" },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true, trim: true, maxlength: 160 },
    action: { type: String, required: true, enum: [...leaveActivityActions] },
    summary: { type: String, required: true, trim: true, maxlength: 1000 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

leaveActivitySchema.index({ tenantId: 1, agentId: 1, createdAt: -1 });
leaveActivitySchema.index({ tenantId: 1, leaveRequestId: 1, createdAt: -1 });

export const LeaveBalanceModel: Model<LeaveBalance> =
  (mongoose.models.LeaveBalance as Model<LeaveBalance> | undefined) ??
  mongoose.model<LeaveBalance>("LeaveBalance", leaveBalanceSchema);

export const LeaveRequestModel: Model<LeaveRequest> =
  (mongoose.models.LeaveRequest as Model<LeaveRequest> | undefined) ??
  mongoose.model<LeaveRequest>("LeaveRequest", leaveRequestSchema);

export const LeaveActivityModel: Model<LeaveActivity> =
  (mongoose.models.LeaveActivity as Model<LeaveActivity> | undefined) ??
  mongoose.model<LeaveActivity>("LeaveActivity", leaveActivitySchema);
