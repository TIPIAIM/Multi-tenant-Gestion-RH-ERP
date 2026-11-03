export type UserRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

export type RoadmapStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "RETURNED"
  | "CLOSED";

export type RoadmapItemStatus = "TODO" | "DONE";

export type KpiReviewStatus =
  | "NOT_SUBMITTED"
  | "PENDING_REVIEW"
  | "VALIDATED"
  | "NEEDS_DISCUSSION";

export type KpiReviewDecision =
  | "VALIDATED"
  | "NEEDS_DISCUSSION";

export type RoadmapApprovalType = "DEPARTMENT" | "RH";

export type RoadmapScope = {
  role: UserRole;
  userId: string;
  fullName: string;
  agentId: string | null;
  directionId: string | null;
  serviceId: string | null;
  isGlobalScope: boolean;
  isConfigured: boolean;
  canCreate: boolean;
  configurationMessage?: string;
};

export type RoadmapApprovalReview = {
  reviewedByUserId: string;
  reviewedByName: string;
  reviewType: RoadmapApprovalType;
  comment?: string;
  reviewedAt: string;
};

export type RoadmapItemPermissions = {
  canSubmitKpi: boolean;
  canReviewKpi: boolean;
  canDownloadKpiFile: boolean;
  isLocked: boolean;
};

export type RoadmapPermissions = {
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

export type RoadmapItem = {
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
  kpiFile?: {
    originalFileName: string;
    storedFileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    uploadedByUserId: string;
  };
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
  permissions: RoadmapItemPermissions;
};

export type Roadmap = {
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
  items: RoadmapItem[];
  itemCount: number;
  completedItemCount: number;
  progressPercentage: number;
  submittedAt?: string;
  approvedAt?: string;
  returnedAt?: string;
  closedAt?: string;
  departmentReview?: RoadmapApprovalReview;
  hrReview?: RoadmapApprovalReview;
  managerComment?: string;
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  permissions: RoadmapPermissions;
};

export type RoadmapActivity = {
  id: string;
  roadmapId: string;
  agentId: string;
  actorUserId: string;
  actorName: string;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type RoadmapStats = {
  total: number;
  draft: number;
  submitted: number;
  partiallyApproved: number;
  approved: number;
  returned: number;
  closed: number;
  averageProgress: number;
};

export type RoadmapListParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: RoadmapStatus;
  calendarYear?: number;
  sort?:
    | "UPDATED_DESC"
    | "CREATED_DESC"
    | "PROGRESS_ASC"
    | "PROGRESS_DESC";
};

export type RoadmapListResult = {
  items: Roadmap[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type RoadmapItemInput = {
  title: string;
  description?: string;
  kpiLabel: string;
  plannedPeriod?: string;
  dueDate?: string;
};

export type CreateRoadmapInput = {
  calendarYear: number;
  title: string;
  overview?: string;
  items: RoadmapItemInput[];
};

export type UpdateRoadmapInput = Partial<
  Omit<CreateRoadmapInput, "calendarYear">
>;
