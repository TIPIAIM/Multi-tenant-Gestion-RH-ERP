import mongoose, { Schema, type Model } from "mongoose";
import {
  evaluationCriteriaKeys,
  evaluationDecisions,
  evaluationDataConfidenceLevels,
  evaluationGrades,
  evaluationPotentialLevels,
  evaluationRiskLevels,
  evaluationStatuses,
  type Evaluation,
  type EvaluationAgentSnapshot,
  type EvaluationCriterion,
  type EvaluationEvidenceLink,
  type EvaluationHrValidation,
  type EvaluationIntelligence,
  type EvaluationLeaveBreakdownItem,
  type EvaluationPerformanceSnapshot,
  type EvaluationReviewBlock,
} from "./evaluation.types.js";

const evidenceLinkSchema = new Schema<EvaluationEvidenceLink>(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    url: { type: String, required: true, trim: true, maxlength: 800 },
    description: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const criterionSchema = new Schema<EvaluationCriterion>(
  {
    key: { type: String, required: true, enum: [...evaluationCriteriaKeys] },
    label: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    weight: { type: Number, required: true, min: 0, max: 100 },
    systemSuggestedScore: { type: Number, min: 0, max: 5 },
    selfScore: { type: Number, min: 0, max: 5 },
    managerScore: { type: Number, min: 0, max: 5 },
    hrScore: { type: Number, min: 0, max: 5 },
    finalScore: { type: Number, min: 0, max: 5 },
    comment: { type: String, trim: true, maxlength: 1200 },
    scoreBasis: { type: String, trim: true, maxlength: 1500 },
    automationDetails: { type: [String], default: [] },
    evidenceLinks: { type: [evidenceLinkSchema], default: [] },
  },
  { _id: false },
);

const agentSnapshotSchema = new Schema<EvaluationAgentSnapshot>(
  {
    fullName: { type: String, required: true, trim: true },
    matricule: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    jobTitle: { type: String, required: true, trim: true },
    grade: { type: String, trim: true },
    category: { type: String, trim: true },
    directionName: { type: String, trim: true },
    serviceName: { type: String, trim: true },
    employmentStatus: { type: String, trim: true },
    contractType: { type: String, trim: true },
    employmentStartDate: { type: Date },
    employmentEndDate: { type: Date },
  },
  { _id: false },
);


const leaveBreakdownSchema = new Schema<EvaluationLeaveBreakdownItem>(
  {
    leaveType: {
      type: String,
      required: true,
      enum: [
        "ANNUAL_LEAVE",
        "SICK_LEAVE",
        "MATERNITY_LEAVE",
        "PATERNITY_LEAVE",
        "SPECIAL_LEAVE",
        "UNPAID_LEAVE",
        "TRAINING_LEAVE",
        "OTHER",
      ],
    },
    requestsTotal: { type: Number, required: true, default: 0, min: 0 },
    requestedDays: { type: Number, required: true, default: 0, min: 0 },
    approvedRequests: { type: Number, required: true, default: 0, min: 0 },
    approvedDays: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false },
);

const performanceSnapshotSchema = new Schema<EvaluationPerformanceSnapshot>(
  {
    periodStartDate: { type: Date, required: true },
    periodEndDate: { type: Date, required: true },
    tasksTotal: { type: Number, required: true, default: 0, min: 0 },
    tasksCompleted: { type: Number, required: true, default: 0, min: 0 },
    tasksNotCompleted: { type: Number, required: true, default: 0, min: 0 },
    tasksInProgress: { type: Number, required: true, default: 0, min: 0 },
    tasksBlocked: { type: Number, required: true, default: 0, min: 0 },
    tasksOverdue: { type: Number, required: true, default: 0, min: 0 },
    taskCompletionRate: { type: Number, required: true, default: 0, min: 0, max: 100 },
    averageTaskProgress: { type: Number, required: true, default: 0, min: 0, max: 100 },
    workingDaysExpected: { type: Number, required: true, default: 0, min: 0 },
    attendanceRecords: { type: Number, required: true, default: 0, min: 0 },
    attendanceMarkedDays: { type: Number, required: true, default: 0, min: 0 },
    presentDays: { type: Number, required: true, default: 0, min: 0 },
    lateDays: { type: Number, required: true, default: 0, min: 0 },
    absentDays: { type: Number, required: true, default: 0, min: 0 },
    unrecordedWorkdays: { type: Number, required: true, default: 0, min: 0 },
    leaveRequestsTotal: { type: Number, required: true, default: 0, min: 0 },
    leaveDraftRequests: { type: Number, required: true, default: 0, min: 0 },
    leaveSubmittedRequests: { type: Number, required: true, default: 0, min: 0 },
    leaveManagerApprovedRequests: { type: Number, required: true, default: 0, min: 0 },
    leaveApprovedRequests: { type: Number, required: true, default: 0, min: 0 },
    leaveRejectedRequests: { type: Number, required: true, default: 0, min: 0 },
    leaveCancelledRequests: { type: Number, required: true, default: 0, min: 0 },
    leaveRequestedDays: { type: Number, required: true, default: 0, min: 0 },
    leavePendingDays: { type: Number, required: true, default: 0, min: 0 },
    leaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    leaveRejectedDays: { type: Number, required: true, default: 0, min: 0 },
    leaveCancelledDays: { type: Number, required: true, default: 0, min: 0 },
    leaveCoveredWorkdays: { type: Number, required: true, default: 0, min: 0 },
    leaveApprovalRate: { type: Number, required: true, default: 0, min: 0, max: 100 },
    annualLeaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    sickLeaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    maternityLeaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    paternityLeaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    specialLeaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    unpaidLeaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    trainingLeaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    otherLeaveApprovedDays: { type: Number, required: true, default: 0, min: 0 },
    annualLeaveBalanceConfigured: { type: Boolean, required: true, default: false },
    annualLeaveOpeningDays: { type: Number, required: true, default: 0 },
    annualLeaveEntitledDays: { type: Number, required: true, default: 0 },
    annualLeaveCarriedOverDays: { type: Number, required: true, default: 0 },
    annualLeaveAdjustmentDays: { type: Number, required: true, default: 0 },
    annualLeaveConsumedDays: { type: Number, required: true, default: 0, min: 0 },
    annualLeaveAvailableDays: { type: Number, required: true, default: 0 },
    leaveTypeBreakdown: { type: [leaveBreakdownSchema], default: [] },
    lateMinutes: { type: Number, required: true, default: 0, min: 0 },
    workedMinutes: { type: Number, required: true, default: 0, min: 0 },
    overtimeMinutes: { type: Number, required: true, default: 0, min: 0 },
    roadmapProgress: { type: Number, min: 0, max: 100 },
    roadmapStatus: { type: String, trim: true },
    roadmapTotalItems: { type: Number, required: true, default: 0, min: 0 },
    roadmapCompletedItems: { type: Number, required: true, default: 0, min: 0 },
    roadmapRemainingItems: { type: Number, required: true, default: 0, min: 0 },
    roadmapRemainingPercent: { type: Number, min: 0, max: 100 },
    automaticDataSummary: { type: [String], default: [] },
    dataSources: { type: [String], default: [] },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const reviewBlockSchema = new Schema<EvaluationReviewBlock>(
  {
    comment: { type: String, trim: true, maxlength: 3000 },
    strengths: { type: String, trim: true, maxlength: 2500 },
    improvementAreas: { type: String, trim: true, maxlength: 2500 },
    trainingNeeds: { type: String, trim: true, maxlength: 2500 },
    nextObjectives: { type: String, trim: true, maxlength: 2500 },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedByName: { type: String, trim: true },
    reviewedAt: { type: Date },
  },
  { _id: false },
);

const hrValidationSchema = new Schema<EvaluationHrValidation>(
  {
    finalDecision: { type: String, required: true, enum: [...evaluationDecisions], default: "NO_DECISION" },
    finalComment: { type: String, trim: true, maxlength: 3500 },
    validatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    validatedByName: { type: String, trim: true },
    validatedAt: { type: Date },
  },
  { _id: false },
);

const intelligenceSchema = new Schema<EvaluationIntelligence>(
  {
    dataConfidence: { type: String, required: true, enum: [...evaluationDataConfidenceLevels], default: "LOW" },
    riskLevel: { type: String, required: true, enum: [...evaluationRiskLevels], default: "MODERATE" },
    potentialLevel: { type: String, required: true, enum: [...evaluationPotentialLevels], default: "EMERGING" },
    recommendedDecision: { type: String, required: true, enum: [...evaluationDecisions], default: "NO_DECISION" },
    consistencyIndex: { type: Number, required: true, default: 0, min: 0, max: 100 },
    reliabilityIndex: { type: Number, required: true, default: 0, min: 0, max: 100 },
    objectiveIndex: { type: Number, required: true, default: 0, min: 0, max: 100 },
    attendanceIndex: { type: Number, required: true, default: 0, min: 0, max: 100 },
    developmentPriority: { type: String, required: true, trim: true, maxlength: 500 },
    strengths: { type: [String], default: [] },
    alerts: { type: [String], default: [] },
    recommendedActions: { type: [String], default: [] },
    managerTalkingPoints: { type: [String], default: [] },
    hrExecutiveBrief: { type: String, required: true, trim: true, maxlength: 5000 },
    directorGeneralBrief: { type: String, required: true, trim: true, maxlength: 5000 },
    next90DayPlan: { type: [String], default: [] },
    dataWarnings: { type: [String], default: [] },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const evaluationSchema = new Schema<Evaluation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    reference: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true, maxlength: 220 },
    evaluationYear: { type: Number, required: true, min: 2000, max: 2100 },
    periodStartDate: { type: Date, required: true },
    periodEndDate: { type: Date, required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    directionId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", default: null },
    status: { type: String, required: true, enum: [...evaluationStatuses], default: "DRAFT" },
    agentSnapshot: { type: agentSnapshotSchema, required: true },
    performanceSnapshot: { type: performanceSnapshotSchema, required: true },
    criteria: { type: [criterionSchema], required: true, default: [] },
    evidenceLinks: { type: [evidenceLinkSchema], default: [] },
    selfReview: { type: reviewBlockSchema },
    managerReview: { type: reviewBlockSchema },
    hrValidation: { type: hrValidationSchema },
    finalScore: { type: Number, required: true, default: 0, min: 0, max: 100 },
    grade: { type: String, required: true, enum: [...evaluationGrades], default: "NEEDS_IMPROVEMENT" },
    executiveSummary: { type: String, required: true, trim: true, maxlength: 4000 },
    printableIntro: { type: String, required: true, trim: true, maxlength: 4000 },
    generatedConclusion: { type: String, required: true, trim: true, maxlength: 4000 },
    intelligence: { type: intelligenceSchema, required: true },
    confidentialNote: { type: String, trim: true, maxlength: 4000 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUpdatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    archivedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

evaluationSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
evaluationSchema.index({ tenantId: 1, agentId: 1, evaluationYear: -1 });
evaluationSchema.index({ tenantId: 1, directionId: 1, serviceId: 1, status: 1 });
evaluationSchema.index({ tenantId: 1, periodEndDate: -1 });

export const EvaluationModel: Model<Evaluation> =
  (mongoose.models.Evaluation as Model<Evaluation> | undefined) ??
  mongoose.model<Evaluation>("Evaluation", evaluationSchema);
