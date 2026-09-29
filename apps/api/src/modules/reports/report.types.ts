import type { HydratedDocument, Types } from "mongoose";

export const managementReportTypes = ["MONTHLY", "SEMIANNUAL", "ANNUAL"] as const;
export const managementReportStatuses = ["DRAFT", "READY", "VALIDATED", "ARCHIVED"] as const;
export const managementReportScopeTypes = ["INSTITUTION", "DIRECTION", "SERVICE"] as const;
export const managementReportRiskLevels = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export const managementReportDataConfidenceLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export const managementReportGovernanceLevels = ["MAITRISE", "SOUS_CONTROLE", "A_RENFORCER", "CRITIQUE"] as const;

export type ManagementReportType = (typeof managementReportTypes)[number];
export type ManagementReportStatus = (typeof managementReportStatuses)[number];
export type ManagementReportScopeType = (typeof managementReportScopeTypes)[number];
export type ManagementReportRiskLevel = (typeof managementReportRiskLevels)[number];
export type ManagementReportDataConfidence = (typeof managementReportDataConfidenceLevels)[number];
export type ManagementReportGovernanceLevel = (typeof managementReportGovernanceLevels)[number];

export interface ManagementReportScopeSnapshot {
  scopeType: ManagementReportScopeType;
  directionName?: string;
  serviceName?: string;
}

export interface WorkforceReportSnapshot {
  agentsTotal: number;
  agentsActive: number;
  agentsInactive: number;
  permanentContracts: number;
  fixedTermContracts: number;
  otherContracts: number;
  newHires: number;
  departures: number;
  usersTotal: number;
  usersActive: number;
  usersInactive: number;
  verifiedUsers: number;
  directionsTotal: number;
  servicesTotal: number;
  documentsActive: number;
  documentsArchived: number;
  documentsExpiringSoon: number;
  documentsExpired: number;
}

export interface TaskReportSnapshot {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  blocked: number;
  overdue: number;
  completionRate: number;
  averageProgress: number;
  highPriority: number;
  criticalPriority: number;
}

export interface AttendanceReportSnapshot {
  weekdays: number;
  expectedAgentWorkdays: number;
  expectedAfterApprovedLeave: number;
  markedDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  unrecordedDays: number;
  coverageRate: number;
  presenceRate: number;
  punctualityRate: number;
  lateMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  earlyDepartureMinutes: number;
}

export interface LeaveReportSnapshot {
  requestsTotal: number;
  draftRequests: number;
  submittedRequests: number;
  managerApprovedRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  cancelledRequests: number;
  requestedDays: number;
  pendingDays: number;
  approvedDays: number;
  rejectedDays: number;
  cancelledDays: number;
  approvalRate: number;
  byType: Array<{
    leaveType: string;
    requests: number;
    approvedRequests: number;
    requestedDays: number;
    approvedDays: number;
  }>;
}

export interface RoadmapReportSnapshot {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  returned: number;
  closed: number;
  itemCount: number;
  completedItemCount: number;
  remainingItemCount: number;
  averageProgress: number;
  completionRate: number;
}

export interface EvaluationReportSnapshot {
  total: number;
  draft: number;
  selfReviewed: number;
  managerReviewed: number;
  hrValidated: number;
  averageScore: number;
  excellent: number;
  veryGood: number;
  satisfactory: number;
  needsImprovement: number;
  insufficient: number;
  highRisk: number;
  criticalRisk: number;
  promotionRecommended: number;
  trainingPlans: number;
  improvementPlans: number;
}

export interface UnitReportBreakdownItem {
  unitId: string;
  unitName: string;
  unitType: "DIRECTION" | "SERVICE";
  agentsActive: number;
  tasksTotal: number;
  tasksCompleted: number;
  tasksOverdue: number;
  taskCompletionRate: number;
  attendancePresenceRate: number;
  attendanceCoverageRate: number;
  absenceDays: number;
  lateMinutes: number;
  approvedLeaveDays: number;
  pendingLeaveDays: number;
  roadmapAverageProgress: number;
  evaluationAverageScore: number;
  alertsCount: number;
}


export interface ManagementReportTrendPoint {
  periodKey: string;
  label: string;
  tasksCreated: number;
  tasksCompleted: number;
  attendancePresenceRate: number;
  attendanceCoverageRate: number;
  approvedLeaveDays: number;
  lateMinutes: number;
}

export interface ManagementReportComparison {
  previousReportId: string;
  previousReference: string;
  previousPeriodStartDate: Date;
  previousPeriodEndDate: Date;
  performanceIndexDelta: number;
  taskCompletionRateDelta: number;
  attendancePresenceRateDelta: number;
  attendanceCoverageRateDelta: number;
  roadmapProgressDelta: number;
  evaluationScoreDelta: number;
}

export interface ManagementReportSnapshot {
  snapshotVersion: number;
  periodStartDate: Date;
  periodEndDate: Date;
  calculationEndDate: Date;
  generatedAt: Date;
  workforce: WorkforceReportSnapshot;
  tasks: TaskReportSnapshot;
  attendance: AttendanceReportSnapshot;
  leaves: LeaveReportSnapshot;
  roadmaps: RoadmapReportSnapshot;
  evaluations: EvaluationReportSnapshot;
  monthlyTrend: ManagementReportTrendPoint[];
  comparison?: ManagementReportComparison;
  unitBreakdown: UnitReportBreakdownItem[];
  sources: string[];
  warnings: string[];
}

export interface ManagementReportIntelligence {
  performanceIndex: number;
  executionIndex: number;
  attendanceIndex: number;
  roadmapIndex: number;
  evaluationIndex: number;
  dataQualityIndex: number;
  riskLevel: ManagementReportRiskLevel;
  governanceLevel: ManagementReportGovernanceLevel;
  dataConfidence: ManagementReportDataConfidence;
  executiveSummary: string;
  directorGeneralNote: string;
  keyAchievements: string[];
  alerts: string[];
  recommendations: string[];
  nextPeriodPriorities: string[];
  decisionsRequired: string[];
  generatedAt: Date;
}

export interface ManagementReportEditorial {
  introduction?: string;
  highlights?: string;
  difficulties?: string;
  actionsTaken?: string;
  outlook?: string;
  confidentialNote?: string;
}

export interface ManagementReport {
  tenantId: Types.ObjectId;
  reference: string;
  title: string;
  reportType: ManagementReportType;
  reportYear: number;
  reportMonth?: number;
  reportSemester?: 1 | 2;
  periodStartDate: Date;
  periodEndDate: Date;
  calculationEndDate: Date;
  scopeType: ManagementReportScopeType;
  directionId?: Types.ObjectId | null;
  serviceId?: Types.ObjectId | null;
  scopeSnapshot: ManagementReportScopeSnapshot;
  status: ManagementReportStatus;
  snapshot: ManagementReportSnapshot;
  intelligence: ManagementReportIntelligence;
  editorial: ManagementReportEditorial;
  preparedByUserId: Types.ObjectId;
  preparedByName: string;
  preparedAt: Date;
  validatedByUserId?: Types.ObjectId;
  validatedByName?: string;
  validatedAt?: Date;
  validationComment?: string;
  archivedAt?: Date;
  createdByUserId: Types.ObjectId;
  lastUpdatedByUserId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ManagementReportDocument = HydratedDocument<ManagementReport>;


export type ManagementReportPermissions = {
  isOwner: boolean;
  canEdit: boolean;
  canRecompute: boolean;
  canValidate: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canDownload: boolean;
  readOnly: boolean;
};

export type PublicManagementReport = Omit<
  ManagementReport,
  | "tenantId"
  | "directionId"
  | "serviceId"
  | "preparedByUserId"
  | "validatedByUserId"
  | "createdByUserId"
  | "lastUpdatedByUserId"
  | "periodStartDate"
  | "periodEndDate"
  | "calculationEndDate"
  | "preparedAt"
  | "validatedAt"
  | "archivedAt"
  | "createdAt"
  | "updatedAt"
  | "snapshot"
  | "intelligence"
> & {
  id: string;
  tenantId: string;
  directionId: string | null;
  serviceId: string | null;
  periodStartDate: string;
  periodEndDate: string;
  calculationEndDate: string;
  snapshot: Omit<
    ManagementReportSnapshot,
    | "periodStartDate"
    | "periodEndDate"
    | "calculationEndDate"
    | "generatedAt"
    | "comparison"
  > & {
    periodStartDate: string;
    periodEndDate: string;
    calculationEndDate: string;
    generatedAt: string;
    comparison?: Omit<
      ManagementReportComparison,
      "previousPeriodStartDate" | "previousPeriodEndDate"
    > & {
      previousPeriodStartDate: string;
      previousPeriodEndDate: string;
    };
  };
  intelligence: Omit<ManagementReportIntelligence, "generatedAt"> & { generatedAt: string };
  preparedByUserId: string;
  preparedAt: string;
  validatedByUserId?: string;
  validatedAt?: string;
  archivedAt?: string;
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  permissions: ManagementReportPermissions;
};
