export type EvaluationStatus =
  | "DRAFT"
  | "SELF_REVIEWED"
  | "MANAGER_REVIEWED"
  | "HR_VALIDATED"
  | "ARCHIVED";

export type EvaluationGrade =
  | "EXCELLENT"
  | "VERY_GOOD"
  | "SATISFACTORY"
  | "NEEDS_IMPROVEMENT"
  | "INSUFFICIENT";

export type EvaluationDecision =
  | "CONFIRMATION"
  | "RENEWAL_RECOMMENDED"
  | "PROMOTION_RECOMMENDED"
  | "TRAINING_PLAN"
  | "PERFORMANCE_IMPROVEMENT_PLAN"
  | "MOBILITY_RECOMMENDED"
  | "NO_DECISION";

export type EvaluationRiskLevel =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL";

export type EvaluationPotentialLevel =
  | "TO_SUPPORT"
  | "EMERGING"
  | "SOLID"
  | "HIGH_POTENTIAL";

export type EvaluationDataConfidenceLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type EvaluationCriteriaKey =
  | "OBJECTIVES_RESULTS"
  | "WORK_QUALITY"
  | "TECHNICAL_SKILLS"
  | "DISCIPLINE_ATTENDANCE"
  | "INITIATIVE_AUTONOMY"
  | "COLLABORATION_TEAMWORK"
  | "COMMUNICATION_REPORTING"
  | "FADES_VALUES_COMMITMENT";

export type EvaluationLeaveType =
  | "ANNUAL_LEAVE"
  | "SICK_LEAVE"
  | "MATERNITY_LEAVE"
  | "PATERNITY_LEAVE"
  | "SPECIAL_LEAVE"
  | "UNPAID_LEAVE"
  | "TRAINING_LEAVE"
  | "OTHER";

export type EvaluationLeaveBreakdownItem = {
  leaveType: EvaluationLeaveType;
  requestsTotal: number;
  requestedDays: number;
  approvedRequests: number;
  approvedDays: number;
};

export type EvaluationEvidenceLink = {
  title: string;
  url: string;
  description?: string;
};

export type EvaluationCriterion = {
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
};

export type EvaluationAgentSnapshot = {
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
  employmentStartDate?: string;
  employmentEndDate?: string;
};

export type EvaluationPerformanceSnapshot = {
  periodStartDate: string;
  periodEndDate: string;
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
  generatedAt: string;
};

export type EvaluationIntelligence = {
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
  generatedAt: string;
};

export type EvaluationReviewBlock = {
  comment?: string;
  strengths?: string;
  improvementAreas?: string;
  trainingNeeds?: string;
  nextObjectives?: string;
  reviewedByUserId?: string;
  reviewedByName?: string;
  reviewedAt?: string;
};

export type EvaluationHrValidation = {
  finalDecision: EvaluationDecision;
  finalComment?: string;
  validatedByUserId?: string;
  validatedByName?: string;
  validatedAt?: string;
};

export type Evaluation = {
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
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type EvaluationStats = {
  total: number;
  draft: number;
  selfReviewed: number;
  managerReviewed: number;
  hrValidated: number;
  averageScore: number;
  excellent: number;
  needsImprovement: number;
  leaveRequestsTotal: number;
  approvedLeaveDays: number;
  pendingLeaveDays: number;
};

export type EvaluationListParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: EvaluationStatus;
  evaluationYear?: number;
  agentId?: string;
  directionId?: string;
  serviceId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "CREATED_DESC" | "PERIOD_DESC" | "SCORE_DESC" | "AGENT_ASC";
};

export type EvaluationListResult = {
  items: Evaluation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CreateEvaluationInput = {
  agentId: string;
  title?: string;
  evaluationYear?: number;
  periodStartDate: string;
  periodEndDate: string;
  evidenceLinks?: EvaluationEvidenceLink[];
  confidentialNote?: string;
};

export type EvaluationCriterionInput = {
  key: EvaluationCriteriaKey;
  selfScore?: number;
  managerScore?: number;
  hrScore?: number;
  comment?: string;
  evidenceLinks?: EvaluationEvidenceLink[];
};

export type UpdateEvaluationInput = Partial<CreateEvaluationInput> & {
  criteria?: EvaluationCriterionInput[];
  status?: EvaluationStatus;
};

export type SubmitEvaluationReviewInput = {
  comment?: string;
  strengths?: string;
  improvementAreas?: string;
  trainingNeeds?: string;
  nextObjectives?: string;
  criteria?: EvaluationCriterionInput[];
};

export type ValidateEvaluationHrInput = {
  finalDecision: EvaluationDecision;
  finalComment?: string;
  criteria?: EvaluationCriterionInput[];
};
