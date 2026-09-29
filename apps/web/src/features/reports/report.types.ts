export type ManagementReportType = "MONTHLY" | "SEMIANNUAL" | "ANNUAL";
export type ManagementReportStatus = "DRAFT" | "READY" | "VALIDATED" | "ARCHIVED";
export type ManagementReportScopeType = "INSTITUTION" | "DIRECTION" | "SERVICE";
export type ManagementReportRiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type ManagementReportDataConfidence = "LOW" | "MEDIUM" | "HIGH";
export type ManagementReportGovernanceLevel = "MAITRISE" | "SOUS_CONTROLE" | "A_RENFORCER" | "CRITIQUE";

export type ReportScopeSnapshot = { scopeType: ManagementReportScopeType; directionName?: string; serviceName?: string };
export type WorkforceReportSnapshot = {
  agentsTotal: number; agentsActive: number; agentsInactive: number; permanentContracts: number; fixedTermContracts: number; otherContracts: number; newHires: number; departures: number;
  usersTotal: number; usersActive: number; usersInactive: number; verifiedUsers: number; directionsTotal: number; servicesTotal: number;
  documentsActive: number; documentsArchived: number; documentsExpiringSoon: number; documentsExpired: number;
};
export type TaskReportSnapshot = { total: number; completed: number; inProgress: number; todo: number; blocked: number; overdue: number; completionRate: number; averageProgress: number; highPriority: number; criticalPriority: number };
export type AttendanceReportSnapshot = { weekdays: number; expectedAgentWorkdays: number; expectedAfterApprovedLeave: number; markedDays: number; presentDays: number; absentDays: number; lateDays: number; unrecordedDays: number; coverageRate: number; presenceRate: number; punctualityRate: number; lateMinutes: number; workedMinutes: number; overtimeMinutes: number; earlyDepartureMinutes: number };
export type LeaveReportSnapshot = { requestsTotal: number; draftRequests: number; submittedRequests: number; managerApprovedRequests: number; approvedRequests: number; rejectedRequests: number; cancelledRequests: number; requestedDays: number; pendingDays: number; approvedDays: number; rejectedDays: number; cancelledDays: number; approvalRate: number; byType: Array<{ leaveType: string; requests: number; approvedRequests: number; requestedDays: number; approvedDays: number }> };
export type RoadmapReportSnapshot = { total: number; draft: number; submitted: number; approved: number; returned: number; closed: number; itemCount: number; completedItemCount: number; remainingItemCount: number; averageProgress: number; completionRate: number };
export type EvaluationReportSnapshot = { total: number; draft: number; selfReviewed: number; managerReviewed: number; hrValidated: number; averageScore: number; excellent: number; veryGood: number; satisfactory: number; needsImprovement: number; insufficient: number; highRisk: number; criticalRisk: number; promotionRecommended: number; trainingPlans: number; improvementPlans: number };
export type UnitReportBreakdownItem = { unitId: string; unitName: string; unitType: "DIRECTION" | "SERVICE"; agentsActive: number; tasksTotal: number; tasksCompleted: number; tasksOverdue: number; taskCompletionRate: number; attendancePresenceRate: number; attendanceCoverageRate: number; absenceDays: number; lateMinutes: number; approvedLeaveDays: number; pendingLeaveDays: number; roadmapAverageProgress: number; evaluationAverageScore: number; alertsCount: number };

export type ManagementReportTrendPoint = { periodKey: string; label: string; tasksCreated: number; tasksCompleted: number; attendancePresenceRate: number; attendanceCoverageRate: number; approvedLeaveDays: number; lateMinutes: number };
export type ManagementReportComparison = { previousReportId: string; previousReference: string; previousPeriodStartDate: string; previousPeriodEndDate: string; performanceIndexDelta: number; taskCompletionRateDelta: number; attendancePresenceRateDelta: number; attendanceCoverageRateDelta: number; roadmapProgressDelta: number; evaluationScoreDelta: number };

export type ManagementReportSnapshot = {
  snapshotVersion: number; periodStartDate: string; periodEndDate: string; calculationEndDate: string; generatedAt: string;
  workforce: WorkforceReportSnapshot; tasks: TaskReportSnapshot; attendance: AttendanceReportSnapshot; leaves: LeaveReportSnapshot; roadmaps: RoadmapReportSnapshot; evaluations: EvaluationReportSnapshot;
  monthlyTrend: ManagementReportTrendPoint[]; comparison?: ManagementReportComparison;
  unitBreakdown: UnitReportBreakdownItem[]; sources: string[]; warnings: string[];
};
export type ManagementReportIntelligence = {
  performanceIndex: number; executionIndex: number; attendanceIndex: number; roadmapIndex: number; evaluationIndex: number; dataQualityIndex: number;
  riskLevel: ManagementReportRiskLevel; governanceLevel: ManagementReportGovernanceLevel; dataConfidence: ManagementReportDataConfidence;
  executiveSummary: string; directorGeneralNote: string; keyAchievements: string[]; alerts: string[]; recommendations: string[]; nextPeriodPriorities: string[]; decisionsRequired: string[]; generatedAt: string;
};
export type ManagementReportEditorial = { introduction?: string; highlights?: string; difficulties?: string; actionsTaken?: string; outlook?: string; confidentialNote?: string };

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

export type ManagementReport = {
  id: string; tenantId: string; reference: string; title: string; reportType: ManagementReportType; reportYear: number; reportMonth?: number; reportSemester?: 1 | 2;
  periodStartDate: string; periodEndDate: string; calculationEndDate: string; scopeType: ManagementReportScopeType; directionId: string | null; serviceId: string | null;
  scopeSnapshot: ReportScopeSnapshot; status: ManagementReportStatus; snapshot: ManagementReportSnapshot; intelligence: ManagementReportIntelligence; editorial: ManagementReportEditorial;
  preparedByUserId: string; preparedByName: string; preparedAt: string; validatedByUserId?: string; validatedByName?: string; validatedAt?: string; validationComment?: string; archivedAt?: string;
  createdByUserId: string; lastUpdatedByUserId?: string; createdAt?: string; updatedAt?: string;
  permissions: ManagementReportPermissions;
};

export type GenerateManagementReportInput = { reportType: ManagementReportType; reportYear: number; reportMonth?: number; reportSemester?: 1 | 2; scopeType: ManagementReportScopeType; directionId?: string; serviceId?: string; title?: string; editorial?: ManagementReportEditorial };
export type UpdateManagementReportInput = { title?: string; editorial?: ManagementReportEditorial };
export type ManagementReportListParams = { page?: number; limit?: number; search?: string; reportType?: ManagementReportType; status?: ManagementReportStatus; reportYear?: number; directionId?: string; serviceId?: string; sort?: "CREATED_DESC" | "PERIOD_DESC" | "TYPE_ASC" | "STATUS_ASC" };
export type ManagementReportListResult = { items: ManagementReport[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export type ManagementReportStats = { total: number; monthly: number; semiannual: number; annual: number; ready: number; validated: number; archived: number; averagePerformanceIndex: number; highRisk: number };
export type ManagementReportAccessScope = { role: string; directionId: string | null; serviceId: string | null; defaultScopeType: ManagementReportScopeType; canValidate: boolean; canDelete: boolean };
