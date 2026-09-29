import type { HydratedDocument, Types } from "mongoose";

export const taskStatuses = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const taskPriorities = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export const taskKpiKinds = [
  "FILE",
  "NUMBER",
  "TEXT",
] as const;

export const taskActivityActions = [
  "CREATED",
  "UPDATED",
  "STATUS_CHANGED",
  "PROGRESS_UPDATED",
  "COMMENT_ADDED",
  "KPI_SUBMITTED",
] as const;

export const taskDueFilters = [
  "ALL",
  "OVERDUE",
  "TODAY",
  "NEXT_7_DAYS",
  "NO_DUE_DATE",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];
export type TaskKpiKind = (typeof taskKpiKinds)[number];
export type TaskActivityAction = (typeof taskActivityActions)[number];
export type TaskDueFilter = (typeof taskDueFilters)[number];

export interface TaskKpiFileEvidence {
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadedAt: Date;
  uploadedByUserId: Types.ObjectId;
}

export interface TaskKpi {
  _id: Types.ObjectId;
  label: string;
  kind: TaskKpiKind;
  required: boolean;
  instructions?: string;
  targetNumber?: number;
  unit?: string;
  resultNumber?: number;
  resultText?: string;
  file?: TaskKpiFileEvidence;
  submittedAt?: Date;
  submittedByUserId?: Types.ObjectId;
}

export interface Task {
  tenantId: Types.ObjectId;
  reference: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  progressPercentage: number;
  startDate?: Date;
  dueDate?: Date;
  completedAt?: Date;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
  assignedToAgentId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  lastUpdatedByUserId?: Types.ObjectId;
  tags: string[];
  kpis: TaskKpi[];
  commentCount: number;
  lastCommentAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TaskComment {
  tenantId: Types.ObjectId;
  taskId: Types.ObjectId;
  authorUserId: Types.ObjectId;
  authorName: string;
  message: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TaskActivity {
  tenantId: Types.ObjectId;
  taskId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  actorName: string;
  action: TaskActivityAction;
  summary: string;
  createdAt?: Date;
}

export interface TaskSequence {
  tenantId: Types.ObjectId;
  key: "TASK";
  year: number;
  value: number;
}

export type TaskDocument = HydratedDocument<Task>;
export type TaskCommentDocument = HydratedDocument<TaskComment>;
export type TaskActivityDocument = HydratedDocument<TaskActivity>;

export type PublicTaskKpi = {
  id: string;
  label: string;
  kind: TaskKpiKind;
  required: boolean;
  instructions?: string;
  targetNumber?: number;
  unit?: string;
  resultNumber?: number;
  resultText?: string;
  isSubmitted: boolean;
  submittedAt?: string;
  file?: {
    originalName: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
  };
  canDownload: boolean;
};

export type PublicTaskPermissions = {
  canManage: boolean;
  canUpdateProgress: boolean;
  canSubmitKpi: boolean;
  canDownloadKpiFiles: boolean;
  canComment: boolean;
  readOnly: boolean;
};

export type PublicTask = {
  id: string;
  tenantId: string;
  reference: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  progressPercentage: number;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  directionId: string;
  serviceId: string | null;
  assignedToAgentId: string;
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  tags: string[];
  kpis: PublicTaskKpi[];
  permissions: PublicTaskPermissions;
  commentCount: number;
  lastCommentAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicTaskComment = {
  id: string;
  taskId: string;
  authorUserId: string;
  authorName: string;
  message: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicTaskActivity = {
  id: string;
  taskId: string;
  actorUserId: string;
  actorName: string;
  action: TaskActivityAction;
  summary: string;
  createdAt?: string;
};
