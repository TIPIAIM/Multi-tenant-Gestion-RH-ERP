import type { HydratedDocument, Types } from "mongoose";

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

export const leaveReviewDecisions = [
  "APPROVED",
  "REJECTED",
] as const;

export const leaveActivityActions = [
  "CREATED",
  "UPDATED",
  "SUBMITTED",
  "MANAGER_APPROVED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "BALANCE_CREATED",
  "BALANCE_ADJUSTED",
  "BALANCE_CONSUMED",
  "BALANCE_RESTORED",
] as const;

export type LeaveType = (typeof leaveTypes)[number];
export type LeaveRequestStatus = (typeof leaveRequestStatuses)[number];
export type LeaveReviewDecision = (typeof leaveReviewDecisions)[number];
export type LeaveActivityAction = (typeof leaveActivityActions)[number];

export interface LeaveReview {
  reviewedByUserId: Types.ObjectId;
  reviewedByName: string;
  decision: LeaveReviewDecision;
  comment?: string;
  decidedAt: Date;
}

export interface LeaveBalance {
  tenantId: Types.ObjectId;
  agentId: Types.ObjectId;
  calendarYear: number;
  leaveType: LeaveType;
  openingDays: number;
  entitledDays: number;
  carriedOverDays: number;
  adjustmentDays: number;
  consumedDays: number;
  updatedByUserId: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LeaveRequest {
  tenantId: Types.ObjectId;
  agentId: Types.ObjectId;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  requestedDays: number;
  reason: string;
  status: LeaveRequestStatus;
  submittedAt?: Date;
  managerReview?: LeaveReview;
  finalReview?: LeaveReview;
  cancelledAt?: Date;
  cancelledByUserId?: Types.ObjectId;
  cancellationReason?: string;
  createdByUserId: Types.ObjectId;
  lastUpdatedByUserId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LeaveActivity {
  tenantId: Types.ObjectId;
  leaveRequestId?: Types.ObjectId;
  leaveBalanceId?: Types.ObjectId;
  agentId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  actorName: string;
  action: LeaveActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export type LeaveBalanceDocument = HydratedDocument<LeaveBalance>;
export type LeaveRequestDocument = HydratedDocument<LeaveRequest>;
export type LeaveActivityDocument = HydratedDocument<LeaveActivity>;

export type PublicLeaveAgent = {
  id: string;
  fullName: string;
  matricule: string;
  jobTitle: string;
  employmentStatus: string;
  directionId: string;
  serviceId: string | null;
};

export type PublicLeaveBalance = {
  id: string;
  agentId: string;
  agent?: PublicLeaveAgent;
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

export type PublicLeaveReview = {
  reviewedByUserId: string;
  reviewedByName: string;
  decision: LeaveReviewDecision;
  comment?: string;
  decidedAt: string;
};

export type PublicLeaveRequest = {
  id: string;
  agentId: string;
  agent?: PublicLeaveAgent;
  directionId: string;
  serviceId: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  requestedDays: number;
  reason: string;
  status: LeaveRequestStatus;
  submittedAt?: string;
  managerReview?: PublicLeaveReview;
  finalReview?: PublicLeaveReview;
  cancelledAt?: string;
  cancelledByUserId?: string;
  cancellationReason?: string;
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicLeaveActivity = {
  id: string;
  leaveRequestId?: string;
  leaveBalanceId?: string;
  agentId: string;
  actorUserId: string;
  actorName: string;
  action: LeaveActivityAction;
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
  upcomingApproved: PublicLeaveRequest[];
};
