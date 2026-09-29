import type { HydratedDocument, Types } from "mongoose";
import type { UserRole } from "../users/user.types.js";

export const roadmapStatuses = [
  "DRAFT",
  "SUBMITTED",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "RETURNED",
  "CLOSED",
] as const;

export const roadmapItemStatuses = ["TODO", "DONE"] as const;
export const kpiReviewStatuses = ["NOT_SUBMITTED", "PENDING_REVIEW", "VALIDATED", "NEEDS_DISCUSSION"] as const;
export const kpiReviewDecisions = ["VALIDATED", "NEEDS_DISCUSSION"] as const;
export const roadmapApprovalTypes = ["DEPARTMENT", "RH"] as const;

export const roadmapActivityActions = [
  "CREATED",
  "UPDATED",
  "SUBMITTED",
  "DEPARTMENT_APPROVED",
  "RH_APPROVED",
  "APPROVED",
  "RETURNED",
  "CLOSED",
  "ITEM_COMPLETED",
  "KPI_REVIEWED",
  "KPI_ADMIN_UPDATED",
] as const;

export type RoadmapStatus = (typeof roadmapStatuses)[number];
export type RoadmapItemStatus = (typeof roadmapItemStatuses)[number];
export type KpiReviewStatus = (typeof kpiReviewStatuses)[number];
export type KpiReviewDecision = (typeof kpiReviewDecisions)[number];
export type RoadmapApprovalType = (typeof roadmapApprovalTypes)[number];
export type RoadmapActivityAction = (typeof roadmapActivityActions)[number];

export interface RoadmapKpiFile {
  originalFileName: string;
  storedFileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedByUserId: Types.ObjectId;
}

export interface RoadmapItemReview {
  reviewedByUserId: Types.ObjectId;
  reviewedByName: string;
  status: KpiReviewStatus;
  comment?: string;
  reviewedAt: Date;
}

export interface RoadmapApprovalReview {
  reviewedByUserId: Types.ObjectId;
  reviewedByName: string;
  reviewType: RoadmapApprovalType;
  comment?: string;
  reviewedAt: Date;
}

export interface RoadmapItem {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  kpiLabel: string;
  plannedPeriod?: string;
  dueDate?: string;
  status: RoadmapItemStatus;
  completedAt?: Date;
  completedByUserId?: Types.ObjectId;
  kpiText?: string;
  kpiFile?: RoadmapKpiFile;
  kpiSubmittedAt?: Date;
  kpiSubmittedByUserId?: Types.ObjectId;
  kpiLocked: boolean;
  reviewStatus: KpiReviewStatus;
  review?: RoadmapItemReview;
}

export interface Roadmap {
  tenantId: Types.ObjectId;
  agentId: Types.ObjectId;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
  ownerRole: UserRole;
  calendarYear: number;
  reference: string;
  title: string;
  overview?: string;
  status: RoadmapStatus;
  items: RoadmapItem[];
  itemCount: number;
  completedItemCount: number;
  progressPercentage: number;
  submittedAt?: Date;
  approvedAt?: Date;
  returnedAt?: Date;
  closedAt?: Date;
  departmentReview?: RoadmapApprovalReview;
  hrReview?: RoadmapApprovalReview;
  managerComment?: string;
  createdByUserId: Types.ObjectId;
  lastUpdatedByUserId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RoadmapActivity {
  tenantId: Types.ObjectId;
  roadmapId: Types.ObjectId;
  agentId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  actorName: string;
  action: RoadmapActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export type RoadmapDocument = HydratedDocument<Roadmap>;
export type RoadmapActivityDocument = HydratedDocument<RoadmapActivity>;

export type PublicRoadmapKpiFile = Omit<RoadmapKpiFile, "storagePath" | "uploadedByUserId" | "uploadedAt"> & {
  uploadedAt: string;
  uploadedByUserId: string;
};


export type PublicRoadmapItemPermissions = {
  canSubmitKpi: boolean;
  canReviewKpi: boolean;
  canDownloadKpiFile: boolean;
  isLocked: boolean;
};

export type PublicRoadmapPermissions = {
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReturn: boolean;
  canClose: boolean;
  canDelete: boolean;
  canSubmitKpi: boolean;
  canReviewKpi: boolean;
  canDownloadKpiFiles: boolean;
  readOnly: boolean;
};

export type PublicRoadmapApprovalReview = {
  reviewedByUserId: string;
  reviewedByName: string;
  reviewType: RoadmapApprovalType;
  comment?: string;
  reviewedAt: string;
};

export type PublicRoadmapItem = {
  id: string;
  title: string;
  description?: string;
  kpiLabel: string;
  plannedPeriod?: string;
  dueDate?: string;
  status: RoadmapItemStatus;
  completedAt?: string;
  completedByUserId?: string;
  kpiText?: string;
  kpiFile?: PublicRoadmapKpiFile;
  kpiSubmittedAt?: string;
  kpiSubmittedByUserId?: string;
  kpiLocked: boolean;
  reviewStatus: KpiReviewStatus;
  review?: {
    reviewedByUserId: string;
    reviewedByName: string;
    status: KpiReviewStatus;
    comment?: string;
    reviewedAt: string;
  };
  permissions: PublicRoadmapItemPermissions;
};

export type PublicRoadmap = {
  id: string;
  tenantId: string;
  agentId: string;
  directionId: string;
  serviceId: string | null;
  ownerRole: UserRole;
  calendarYear: number;
  reference: string;
  title: string;
  overview?: string;
  status: RoadmapStatus;
  items: PublicRoadmapItem[];
  itemCount: number;
  completedItemCount: number;
  progressPercentage: number;
  submittedAt?: string;
  approvedAt?: string;
  returnedAt?: string;
  closedAt?: string;
  departmentReview?: PublicRoadmapApprovalReview;
  hrReview?: PublicRoadmapApprovalReview;
  managerComment?: string;
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  permissions: PublicRoadmapPermissions;
};

export type PublicRoadmapActivity = {
  id: string;
  roadmapId: string;
  agentId: string;
  actorUserId: string;
  actorName: string;
  action: RoadmapActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};
