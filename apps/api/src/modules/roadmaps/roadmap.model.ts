import mongoose, { Schema, type Model } from "mongoose";
import {
  kpiReviewStatuses,
  roadmapActivityActions,
  roadmapApprovalTypes,
  roadmapItemStatuses,
  roadmapStatuses,
  type Roadmap,
  type RoadmapActivity,
  type RoadmapApprovalReview,
  type RoadmapItem,
  type RoadmapItemReview,
  type RoadmapKpiFile,
} from "./roadmap.types.js";
import { userRoles } from "../users/user.types.js";

const kpiFileSchema = new Schema<RoadmapKpiFile>(
  {
    originalFileName: { type: String, required: true, trim: true, maxlength: 240 },
    storedFileName: { type: String, required: true, trim: true, maxlength: 260 },
    storagePath: { type: String, required: true, trim: true, maxlength: 600, select: false },
    mimeType: { type: String, required: true, trim: true, maxlength: 120 },
    sizeBytes: { type: Number, required: true, min: 1 },
    uploadedAt: { type: Date, required: true },
    uploadedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false },
);

const itemReviewSchema = new Schema<RoadmapItemReview>(
  {
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewedByName: { type: String, required: true, trim: true, maxlength: 160 },
    status: { type: String, required: true, enum: [...kpiReviewStatuses] },
    comment: { type: String, trim: true, maxlength: 1500 },
    reviewedAt: { type: Date, required: true },
  },
  { _id: false },
);

const roadmapApprovalReviewSchema = new Schema<RoadmapApprovalReview>(
  {
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewedByName: { type: String, required: true, trim: true, maxlength: 160 },
    reviewType: { type: String, required: true, enum: [...roadmapApprovalTypes] },
    comment: { type: String, trim: true, maxlength: 1500 },
    reviewedAt: { type: Date, required: true },
  },
  { _id: false },
);

const roadmapItemSchema = new Schema<RoadmapItem>(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 260 },
    description: { type: String, trim: true, maxlength: 1500 },
    kpiLabel: { type: String, required: true, trim: true, minlength: 2, maxlength: 220 },
    plannedPeriod: { type: String, trim: true, maxlength: 160 },
    dueDate: { type: String, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, required: true, enum: [...roadmapItemStatuses], default: "TODO" },
    completedAt: { type: Date },
    completedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    kpiText: { type: String, trim: true, maxlength: 4000 },
    kpiFile: { type: kpiFileSchema },
    kpiSubmittedAt: { type: Date },
    kpiSubmittedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    kpiLocked: { type: Boolean, required: true, default: false },
    reviewStatus: { type: String, required: true, enum: [...kpiReviewStatuses], default: "NOT_SUBMITTED" },
    review: { type: itemReviewSchema },
  },
  { _id: true },
);

const roadmapSchema = new Schema<Roadmap>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    directionId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", default: null },
    ownerRole: { type: String, enum: [...userRoles], required: true },
    calendarYear: { type: Number, required: true, min: 2020, max: 2200 },
    reference: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 220 },
    overview: { type: String, trim: true, maxlength: 3000 },
    status: { type: String, required: true, enum: [...roadmapStatuses], default: "DRAFT" },
    items: { type: [roadmapItemSchema], default: [] },
    itemCount: { type: Number, required: true, default: 0, min: 0 },
    completedItemCount: { type: Number, required: true, default: 0, min: 0 },
    progressPercentage: { type: Number, required: true, default: 0, min: 0, max: 100 },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    returnedAt: { type: Date },
    closedAt: { type: Date },
    departmentReview: { type: roadmapApprovalReviewSchema },
    hrReview: { type: roadmapApprovalReviewSchema },
    managerComment: { type: String, trim: true, maxlength: 1500 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUpdatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false },
);

roadmapSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
roadmapSchema.index({ tenantId: 1, agentId: 1, calendarYear: 1 });
roadmapSchema.index({ tenantId: 1, directionId: 1, serviceId: 1, status: 1 });
roadmapSchema.index({ tenantId: 1, calendarYear: 1, status: 1 });

const roadmapActivitySchema = new Schema<RoadmapActivity>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    roadmapId: { type: Schema.Types.ObjectId, ref: "Roadmap", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true, trim: true, maxlength: 160 },
    action: { type: String, required: true, enum: [...roadmapActivityActions] },
    summary: { type: String, required: true, trim: true, maxlength: 1000 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

roadmapActivitySchema.index({ tenantId: 1, roadmapId: 1, createdAt: -1 });

export const RoadmapModel: Model<Roadmap> =
  (mongoose.models.Roadmap as Model<Roadmap> | undefined) ??
  mongoose.model<Roadmap>("Roadmap", roadmapSchema);

export const RoadmapActivityModel: Model<RoadmapActivity> =
  (mongoose.models.RoadmapActivity as Model<RoadmapActivity> | undefined) ??
  mongoose.model<RoadmapActivity>("RoadmapActivity", roadmapActivitySchema);
