export const leaveTypes = [
  "ANNUAL_LEAVE",
  "SICK_LEAVE",
  "MATERNITY_LEAVE",
  "PATERNITY_LEAVE",
  "SPECIAL_LEAVE",
  "UNPAID_LEAVE",
  "TRAINING_LEAVE",
  "OTHER",
] as const;

export const leaveRequestStatuses = [
  "DRAFT",
  "SUBMITTED",
  "MANAGER_APPROVED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type LeaveType = (typeof leaveTypes)[number];
export type LeaveRequestStatus =
  (typeof leaveRequestStatuses)[number];
export type LeaveReviewDecision = "APPROVED" | "REJECTED";

export type LeaveAgent = {
  id: string;
  fullName: string;
  matricule: string;
  jobTitle: string;
  employmentStatus: string;
  directionId: string;
  serviceId: string | null;
};

export type LeaveReview = {
  reviewedByUserId: string;
  reviewedByName: string;
  decision: LeaveReviewDecision;
  comment?: string;
  decidedAt: string;
};

export type LeaveBalance = {
  id: string;
  agentId: string;
  agent?: LeaveAgent;
  calendarYear: number;
  leaveType: LeaveType;
  openingDays: number;
  entitledDays: number;
  carriedOverDays: number;
  adjustmentDays: number;
  consumedDays: number;
  availableDays: number;
  updatedByUserId: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LeaveRequest = {
  id: string;
  agentId: string;
  agent?: LeaveAgent;
  directionId: string;
  serviceId: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  requestedDays: number;
  reason: string;
  status: LeaveRequestStatus;
  submittedAt?: string;
  managerReview?: LeaveReview;
  finalReview?: LeaveReview;
  cancelledAt?: string;
  cancelledByUserId?: string;
  cancellationReason?: string;
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LeaveActivity = {
  id: string;
  leaveRequestId?: string;
  leaveBalanceId?: string;
  agentId: string;
  actorUserId: string;
  actorName: string;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type LeaveDashboard = {
  calendarYear: number;
  total: number;
  draft: number;
  submitted: number;
  managerApproved: number;
  approved: number;
  rejected: number;
  cancelled: number;
  requestedDays: number;
  approvedDays: number;
  upcomingApproved: LeaveRequest[];
};

export type LeaveRequestListParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeaveRequestStatus;
  leaveType?: LeaveType;
  agentId?: string;
  directionId?: string;
  serviceId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "START_DATE_ASC" | "START_DATE_DESC" | "CREATED_DESC";
};

export type LeaveRequestListResult = {
  items: LeaveRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CreateLeaveRequestInput = {
  agentId?: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
};

export type UpdateLeaveRequestInput = Partial<
  Omit<CreateLeaveRequestInput, "agentId">
>;

export type ReviewLeaveRequestInput = {
  decision: LeaveReviewDecision;
  comment?: string;
};

export type UpsertLeaveBalanceInput = {
  agentId: string;
  calendarYear: number;
  leaveType: LeaveType;
  openingDays: number;
  entitledDays: number;
  carriedOverDays: number;
  adjustmentDays: number;
};
