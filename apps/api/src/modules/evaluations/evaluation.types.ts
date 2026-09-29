import type { HydratedDocument, Types } from "mongoose";

export const evaluationStatuses = [
  "DRAFT",
  "SELF_REVIEWED",
  "MANAGER_REVIEWED",
  "HR_VALIDATED",
  "ARCHIVED",
] as const;

export const evaluationGrades = [
  "EXCELLENT",
  "VERY_GOOD",
  "SATISFACTORY",
  "NEEDS_IMPROVEMENT",
  "INSUFFICIENT",
] as const;

export const evaluationDecisions = [
  "CONFIRMATION",
  "RENEWAL_RECOMMENDED",
  "PROMOTION_RECOMMENDED",
  "TRAINING_PLAN",
  "PERFORMANCE_IMPROVEMENT_PLAN",
  "MOBILITY_RECOMMENDED",
  "NO_DECISION",
] as const;

export const evaluationRiskLevels = [
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
] as const;

export const evaluationPotentialLevels = [
  "TO_SUPPORT",
  "EMERGING",
  "SOLID",
  "HIGH_POTENTIAL",
] as const;

export const evaluationDataConfidenceLevels = [
  "LOW",
  "MEDIUM",
  "HIGH",
] as const;

export const evaluationCriteriaKeys = [
  "OBJECTIVES_RESULTS",
  "WORK_QUALITY",
  "TECHNICAL_SKILLS",
  "DISCIPLINE_ATTENDANCE",
  "INITIATIVE_AUTONOMY",
  "COLLABORATION_TEAMWORK",
  "COMMUNICATION_REPORTING",
  "FADES_VALUES_COMMITMENT",
] as const;

export type EvaluationStatus = (typeof evaluationStatuses)[number];
export type EvaluationGrade = (typeof evaluationGrades)[number];
export type EvaluationDecision = (typeof evaluationDecisions)[number];
export type EvaluationRiskLevel = (typeof evaluationRiskLevels)[number];
export type EvaluationPotentialLevel = (typeof evaluationPotentialLevels)[number];
export type EvaluationDataConfidenceLevel = (typeof evaluationDataConfidenceLevels)[number];
export type EvaluationCriteriaKey = (typeof evaluationCriteriaKeys)[number];

export const evaluationLeaveTypes = [
  "ANNUAL_LEAVE",
  "SICK_LEAVE",
  "MATERNITY_LEAVE",
  "PATERNITY_LEAVE",
  "SPECIAL_LEAVE",
  "UNPAID_LEAVE",
  "TRAINING_LEAVE",
  "OTHER",
] as const;

export type EvaluationLeaveType = (typeof evaluationLeaveTypes)[number];

export interface EvaluationLeaveBreakdownItem {
  leaveType: EvaluationLeaveType;
  requestsTotal: number;
  requestedDays: number;
  approvedRequests: number;
  approvedDays: number;
}

export interface EvaluationEvidenceLink {
  title: string;
  url: string;
  description?: string;
}

export interface EvaluationCriterion {
  key: EvaluationCriteriaKey;
  label: string;
  description: string;
  weight: number;
  systemSuggestedScore?: number;
  selfScore?: number;
  managerScore?: number;
  hrScore?: number;
  finalScore?: number;
  comment?: string;
  scoreBasis?: string;
  automationDetails: string[];
  evidenceLinks: EvaluationEvidenceLink[];
}

export interface EvaluationAgentSnapshot {
  fullName: string;
  matricule: string;
  email?: string;
  phone?: string;
  jobTitle: string;
  grade?: string;
  category?: string;
  directionName?: string;
  serviceName?: string;
  employmentStatus?: string;
  contractType?: string;
  employmentStartDate?: Date;
  employmentEndDate?: Date;
}

export interface EvaluationPerformanceSnapshot {
  periodStartDate: Date;
  periodEndDate: Date;
  tasksTotal: number;
  tasksCompleted: number;
  tasksNotCompleted: number;
  tasksInProgress: number;
  tasksBlocked: number;
  tasksOverdue: number;
  taskCompletionRate: number;
  averageTaskProgress: number;
  workingDaysExpected: number;
  attendanceRecords: number;
  attendanceMarkedDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  unrecordedWorkdays: number;
  leaveRequestsTotal: number;
  leaveDraftRequests: number;
  leaveSubmittedRequests: number;
  leaveManagerApprovedRequests: number;
  leaveApprovedRequests: number;
  leaveRejectedRequests: number;
  leaveCancelledRequests: number;
  leaveRequestedDays: number;
  leavePendingDays: number;
  leaveApprovedDays: number;
  leaveRejectedDays: number;
  leaveCancelledDays: number;
  leaveCoveredWorkdays: number;
  leaveApprovalRate: number;
  annualLeaveApprovedDays: number;
  sickLeaveApprovedDays: number;
  maternityLeaveApprovedDays: number;
  paternityLeaveApprovedDays: number;
  specialLeaveApprovedDays: number;
  unpaidLeaveApprovedDays: number;
  trainingLeaveApprovedDays: number;
  otherLeaveApprovedDays: number;
  annualLeaveBalanceConfigured: boolean;
  annualLeaveOpeningDays: number;
  annualLeaveEntitledDays: number;
  annualLeaveCarriedOverDays: number;
  annualLeaveAdjustmentDays: number;
  annualLeaveConsumedDays: number;
  annualLeaveAvailableDays: number;
  leaveTypeBreakdown: EvaluationLeaveBreakdownItem[];
  lateMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  roadmapProgress?: number;
  roadmapStatus?: string;
  roadmapTotalItems: number;
  roadmapCompletedItems: number;
  roadmapRemainingItems: number;
  roadmapRemainingPercent?: number;
  automaticDataSummary: string[];
  dataSources: string[];
  generatedAt: Date;
}

export interface EvaluationIntelligence {
  dataConfidence: EvaluationDataConfidenceLevel;
  riskLevel: EvaluationRiskLevel;
  potentialLevel: EvaluationPotentialLevel;
  recommendedDecision: EvaluationDecision;
  consistencyIndex: number;
  reliabilityIndex: number;
  objectiveIndex: number;
  attendanceIndex: number;
  developmentPriority: string;
  strengths: string[];
  alerts: string[];
  recommendedActions: string[];
  managerTalkingPoints: string[];
  hrExecutiveBrief: string;
  directorGeneralBrief: string;
  next90DayPlan: string[];
  dataWarnings: string[];
  generatedAt: Date;
}

export interface EvaluationReviewBlock {
  comment?: string;
  strengths?: string;
  improvementAreas?: string;
  trainingNeeds?: string;
  nextObjectives?: string;
  reviewedByUserId?: Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
}

export interface EvaluationHrValidation {
  finalDecision: EvaluationDecision;
  finalComment?: string;
  validatedByUserId?: Types.ObjectId;
  validatedByName?: string;
  validatedAt?: Date;
}

export interface Evaluation {
  tenantId: Types.ObjectId;
  reference: string;
  title: string;
  evaluationYear: number;
  periodStartDate: Date;
  periodEndDate: Date;
  agentId: Types.ObjectId;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
  status: EvaluationStatus;
  agentSnapshot: EvaluationAgentSnapshot;
  performanceSnapshot: EvaluationPerformanceSnapshot;
  criteria: EvaluationCriterion[];
  evidenceLinks: EvaluationEvidenceLink[];
  selfReview?: EvaluationReviewBlock;
  managerReview?: EvaluationReviewBlock;
  hrValidation?: EvaluationHrValidation;
  finalScore: number;
  grade: EvaluationGrade;
  executiveSummary: string;
  printableIntro: string;
  generatedConclusion: string;
  intelligence: EvaluationIntelligence;
  confidentialNote?: string;
  createdByUserId: Types.ObjectId;
  lastUpdatedByUserId?: Types.ObjectId;
  archivedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type EvaluationDocument = HydratedDocument<Evaluation>;

export type PublicEvaluationEvidenceLink = {
  title: string;
  url: string;
  description?: string;
};

export type PublicEvaluationCriterion = Omit<EvaluationCriterion, "evidenceLinks"> & {
  evidenceLinks: PublicEvaluationEvidenceLink[];
};

export type PublicEvaluationAgentSnapshot = Omit<
  EvaluationAgentSnapshot,
  "employmentStartDate" | "employmentEndDate"
> & {
  employmentStartDate?: string;
  employmentEndDate?: string;
};

export type PublicEvaluationPerformanceSnapshot = Omit<
  EvaluationPerformanceSnapshot,
  "periodStartDate" | "periodEndDate" | "generatedAt"
> & {
  periodStartDate: string;
  periodEndDate: string;
  generatedAt: string;
};

export type PublicEvaluationIntelligence = Omit<
  EvaluationIntelligence,
  "generatedAt"
> & {
  generatedAt: string;
};

export type PublicEvaluationReviewBlock = Omit<
  EvaluationReviewBlock,
  "reviewedByUserId" | "reviewedAt"
> & {
  reviewedByUserId?: string;
  reviewedAt?: string;
};

export type PublicEvaluationHrValidation = Omit<
  EvaluationHrValidation,
  "validatedByUserId" | "validatedAt"
> & {
  validatedByUserId?: string;
  validatedAt?: string;
};

export type PublicEvaluation = {
  id: string;
  tenantId: string;
  reference: string;
  title: string;
  evaluationYear: number;
  periodStartDate: string;
  periodEndDate: string;
  agentId: string;
  directionId: string;
  serviceId: string | null;
  status: EvaluationStatus;
  agentSnapshot: PublicEvaluationAgentSnapshot;
  performanceSnapshot: PublicEvaluationPerformanceSnapshot;
  criteria: PublicEvaluationCriterion[];
  evidenceLinks: PublicEvaluationEvidenceLink[];
  selfReview?: PublicEvaluationReviewBlock;
  managerReview?: PublicEvaluationReviewBlock;
  hrValidation?: PublicEvaluationHrValidation;
  finalScore: number;
  grade: EvaluationGrade;
  executiveSummary: string;
  printableIntro: string;
  generatedConclusion: string;
  intelligence: PublicEvaluationIntelligence;
  confidentialNote?: string;
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};
