import mongoose, { Schema, type Model } from "mongoose";
import {
  taskActivityActions,
  taskKpiKinds,
  taskPriorities,
  taskStatuses,
  type Task,
  type TaskActivity,
  type TaskComment,
  type TaskKpi,
  type TaskKpiFileEvidence,
  type TaskSequence,
} from "./task.types.js";

const taskKpiFileSchema = new Schema<TaskKpiFileEvidence>(
  {
    originalName: { type: String, required: true, trim: true, maxlength: 260 },
    mimeType: { type: String, required: true, trim: true, maxlength: 160 },
    size: { type: Number, required: true, min: 0 },
    storagePath: { type: String, required: true, trim: true, select: false },
    uploadedAt: { type: Date, required: true },
    uploadedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false, versionKey: false },
);

const taskKpiSchema = new Schema<TaskKpi>(
  {
    label: { type: String, required: true, trim: true, minlength: 2, maxlength: 180 },
    kind: { type: String, required: true, enum: [...taskKpiKinds] },
    required: { type: Boolean, required: true, default: true },
    instructions: { type: String, trim: true, maxlength: 1200 },
    targetNumber: { type: Number },
    unit: { type: String, trim: true, maxlength: 50 },
    resultNumber: { type: Number },
    resultText: { type: String, trim: true, maxlength: 8000 },
    file: { type: taskKpiFileSchema, default: undefined },
    submittedAt: { type: Date },
    submittedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true, versionKey: false },
);

const taskSchema = new Schema<Task>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    reference: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 220 },
    description: { type: String, trim: true, maxlength: 4000 },
    priority: { type: String, required: true, enum: [...taskPriorities], default: "MEDIUM" },
    status: { type: String, required: true, enum: [...taskStatuses], default: "TODO" },
    progressPercentage: { type: Number, required: true, default: 0, min: 0, max: 100 },
    startDate: { type: Date },
    dueDate: { type: Date },
    completedAt: { type: Date },
    directionId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", default: null },
    assignedToAgentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUpdatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    tags: { type: [String], default: [] },
    kpis: { type: [taskKpiSchema], default: [] },
    commentCount: { type: Number, required: true, default: 0, min: 0 },
    lastCommentAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

taskSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
taskSchema.index({ tenantId: 1, assignedToAgentId: 1, status: 1, dueDate: 1 });
taskSchema.index({ tenantId: 1, directionId: 1, serviceId: 1, status: 1 });
taskSchema.index({ tenantId: 1, priority: 1, dueDate: 1 });

const taskCommentSchema = new Schema<TaskComment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    authorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  },
  { timestamps: true, versionKey: false },
);
taskCommentSchema.index({ tenantId: 1, taskId: 1, createdAt: -1 });

const taskActivitySchema = new Schema<TaskActivity>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true, trim: true, maxlength: 160 },
    action: { type: String, required: true, enum: [...taskActivityActions] },
    summary: { type: String, required: true, trim: true, maxlength: 800 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
taskActivitySchema.index({ tenantId: 1, taskId: 1, createdAt: -1 });

const taskSequenceSchema = new Schema<TaskSequence>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    key: { type: String, required: true, enum: ["TASK"] },
    year: { type: Number, required: true },
    value: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);
taskSequenceSchema.index({ tenantId: 1, key: 1, year: 1 }, { unique: true });

export const TaskModel: Model<Task> =
  (mongoose.models.Task as Model<Task> | undefined) ??
  mongoose.model<Task>("Task", taskSchema);

export const TaskCommentModel: Model<TaskComment> =
  (mongoose.models.TaskComment as Model<TaskComment> | undefined) ??
  mongoose.model<TaskComment>("TaskComment", taskCommentSchema);

export const TaskActivityModel: Model<TaskActivity> =
  (mongoose.models.TaskActivity as Model<TaskActivity> | undefined) ??
  mongoose.model<TaskActivity>("TaskActivity", taskActivitySchema);

export const TaskSequenceModel: Model<TaskSequence> =
  (mongoose.models.TaskSequence as Model<TaskSequence> | undefined) ??
  mongoose.model<TaskSequence>("TaskSequence", taskSequenceSchema);
