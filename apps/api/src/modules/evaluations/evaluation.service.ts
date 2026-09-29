import { Types } from "mongoose";
import { TaskModel } from "../tasks/task.models.js";
import { AttendanceModel } from "../attendance/attendance.models.js";
import { RoadmapModel } from "../roadmaps/roadmap.model.js";
import { LeaveBalanceModel, LeaveRequestModel } from "../leaves/leave.model.js";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { UserModel } from "../users/user.model.js";
import { OrganizationUnitModel } from "../organisation/organization.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import {
  assertCanCreateEvaluation,
  assertCanDeleteEvaluation,
  assertCanManagerReviewEvaluation,
  assertCanReadEvaluation,
  assertCanSelfReviewEvaluation,
  assertCanValidateEvaluation,
  getEvaluationScopeFilter,
  type EvaluationActor,
} from "./evaluation.access.js";
import { EvaluationModel } from "./evaluation.model.js";
import type {
  CreateEvaluationInput,
  HrValidationInput,
  ListEvaluationsQuery,
  ReviewBlockInput,
  UpdateEvaluationInput,
} from "./evaluation.schema.js";
import type {
  EvaluationCriterion,
  EvaluationDocument,
  EvaluationEvidenceLink,
  EvaluationGrade,
  EvaluationHrValidation,
  EvaluationIntelligence,
  EvaluationLeaveBreakdownItem,
  EvaluationLeaveType,
  EvaluationPerformanceSnapshot,
  EvaluationReviewBlock,
  PublicEvaluation,
} from "./evaluation.types.js";

type MongoFilter = Record<string, any>;

type OrganizationReference =
  | Types.ObjectId
  | string
  | {
      _id?: Types.ObjectId | string;
      id?: Types.ObjectId | string;
      name?: string;
      code?: string;
      type?: "DIRECTION" | "SERVICE";
      parentId?: Types.ObjectId | string | null;
    };

type AgentSnapshotSource = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  matricule: string;
  email?: string;
  phone?: string;
  jobTitle: string;
  grade?: string;
  category?: string;
  directionId?: OrganizationReference | null;
  serviceId?: OrganizationReference | null;
  employmentStatus?: string;
  contractType?: string;
  employmentStartDate?: Date;
  employmentEndDate?: Date;
};

const EVALUATION_LEAVE_TYPES: readonly EvaluationLeaveType[] = [
  "ANNUAL_LEAVE",
  "SICK_LEAVE",
  "MATERNITY_LEAVE",
  "PATERNITY_LEAVE",
  "SPECIAL_LEAVE",
  "UNPAID_LEAVE",
  "TRAINING_LEAVE",
  "OTHER",
];

const APPROVED_LEAVE_STATUS = "APPROVED";
const PENDING_LEAVE_STATUSES = ["SUBMITTED", "MANAGER_APPROVED"] as const;

function leaveTypeLabel(type: EvaluationLeaveType): string {
  const labels: Record<EvaluationLeaveType, string> = {
    ANNUAL_LEAVE: "congé annuel",
    SICK_LEAVE: "congé maladie",
    MATERNITY_LEAVE: "congé maternité",
    PATERNITY_LEAVE: "congé paternité",
    SPECIAL_LEAVE: "congé spécial",
    UNPAID_LEAVE: "congé sans solde",
    TRAINING_LEAVE: "congé de formation",
    OTHER: "autre absence autorisée",
  };

  return labels[type];
}

function cleanOptionalText(value?: string): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function parseDate(value: string): Date {
  return new Date(value);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeScore(value?: number): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(5, Number(value)));
}

function gradeFromScore(score: number): EvaluationGrade {
  if (score >= 90) return "EXCELLENT";
  if (score >= 80) return "VERY_GOOD";
  if (score >= 70) return "SATISFACTORY";
  if (score >= 60) return "NEEDS_IMPROVEMENT";
  return "INSUFFICIENT";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "performance excellente";
  if (score >= 80) return "performance très satisfaisante";
  if (score >= 70) return "performance satisfaisante";
  if (score >= 60) return "performance perfectible";
  return "performance insuffisante nécessitant un accompagnement rapproché";
}

function getNumericValue(source: any, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function safeInteger(value: unknown, fallback = 0): number {
  return Math.round(safeNumber(value, fallback));
}

function getSafeArray<T = unknown>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value?: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function isCompletedStatus(value?: unknown): boolean {
  return ["COMPLETED", "DONE", "FINISHED", "CLOSED", "VALIDATED", "APPROVED", "REALIZED", "REALISE", "REALISÉ"].includes(normalizeStatus(value));
}

function isBlockedStatus(value?: unknown): boolean {
  return ["BLOCKED", "CANCELLED", "CANCELED", "SUSPENDED", "ON_HOLD"].includes(normalizeStatus(value));
}

function getProgressValue(source: any): number {
  return clampIndex(getNumericValue(source, [
    "progressPercentage",
    "progressPercent",
    "progress",
    "completionRate",
    "completionPercentage",
    "realizationRate",
    "realisationRate",
    "globalProgress",
  ], 0));
}

function startOfUtcDayForEvaluation(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDayForEvaluation(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getWeekdayKeys(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  let cursor = startOfUtcDayForEvaluation(startDate);
  const end = startOfUtcDayForEvaluation(endDate);

  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) keys.push(toDateKey(cursor));
    cursor = addUtcDays(cursor, 1);
  }

  return keys;
}

function isWeekdayKey(dateKey: string): boolean {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

function normalizeDateKey(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toDateKey(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  const date = new Date(text.length <= 10 ? `${text}T00:00:00.000Z` : text);
  return Number.isNaN(date.getTime()) ? null : toDateKey(date);
}

function roundLeaveDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function getLeaveDaysForEvaluationPeriod(input: {
  leave: Record<string, any>;
  evaluationWeekdayKeys: string[];
  periodStartKey: string;
  periodEndKey: string;
}): {
  days: number;
  coverageByDate: Map<string, number>;
} {
  const leaveStartKey = normalizeDateKey(input.leave.startDate);
  const leaveEndKey = normalizeDateKey(input.leave.endDate);

  if (!leaveStartKey || !leaveEndKey) {
    return { days: 0, coverageByDate: new Map() };
  }

  const leaveWeekdayKeys = getWeekdayKeys(
    new Date(`${leaveStartKey}T00:00:00.000Z`),
    new Date(`${leaveEndKey}T00:00:00.000Z`),
  );

  if (leaveWeekdayKeys.length === 0) {
    return { days: 0, coverageByDate: new Map() };
  }

  const requestedDays = Math.max(
    0,
    safeNumber(input.leave.requestedDays, leaveWeekdayKeys.length),
  );
  const dailyCoverage = Math.min(1, requestedDays / leaveWeekdayKeys.length);
  const relevantKeys = input.evaluationWeekdayKeys.filter(
    (key) =>
      key >= input.periodStartKey &&
      key <= input.periodEndKey &&
      key >= leaveStartKey &&
      key <= leaveEndKey,
  );

  const coverageByDate = new Map<string, number>();
  relevantKeys.forEach((key) => coverageByDate.set(key, dailyCoverage));

  return {
    days: roundLeaveDays(relevantKeys.length * dailyCoverage),
    coverageByDate,
  };
}

function createEmptyLeaveBreakdown(): EvaluationLeaveBreakdownItem[] {
  return EVALUATION_LEAVE_TYPES.map((leaveType) => ({
    leaveType,
    requestsTotal: 0,
    requestedDays: 0,
    approvedRequests: 0,
    approvedDays: 0,
  }));
}

function collectRoadmapUnits(value: any, depth = 0): any[] {
  if (!value || depth > 4) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRoadmapUnits(item, depth + 1));
  }

  if (typeof value !== "object") return [];

  const units: any[] = [];
  const hasOperationalShape =
    value.status !== undefined ||
    value.progress !== undefined ||
    value.progressPercentage !== undefined ||
    value.completionRate !== undefined ||
    value.weight !== undefined ||
    value.title !== undefined ||
    value.label !== undefined ||
    value.description !== undefined;

  if (hasOperationalShape && depth > 0) units.push(value);

  for (const key of ["activities", "actions", "milestones", "kpis", "keyResults", "objectives", "items", "quarters", "steps", "results"]) {
    if (Array.isArray(value[key])) units.push(...collectRoadmapUnits(value[key], depth + 1));
  }

  return units;
}

function computePercentFromParts(done: number, total: number, fallback = 0): number {
  if (!total) return fallback;
  return clampIndex((done / total) * 100);
}


type RoadmapEvaluationCandidate = {
  _id?: Types.ObjectId;
  agentId?: Types.ObjectId | string | null;
  createdByUserId?: Types.ObjectId | string | null;
  calendarYear?: number;
  reference?: string;
  title?: string;
  status?: string;
  items?: Array<Record<string, any>>;
  itemCount?: number;
  completedItemCount?: number;
  progressPercentage?: number;
  updatedAt?: Date | string;
  createdAt?: Date | string;
};

function dateTimeValue(value?: Date | string): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function roadmapCandidateScore(input: {
  roadmap: RoadmapEvaluationCandidate;
  agentId: Types.ObjectId;
  evaluationYear: number;
  periodStartDate: Date;
  periodEndDate: Date;
}): number {
  const year = Number(input.roadmap.calendarYear ?? 0);
  const periodYears = new Set([
    input.evaluationYear,
    input.periodStartDate.getUTCFullYear(),
    input.periodEndDate.getUTCFullYear(),
  ]);

  let score = 0;

  if (input.roadmap.agentId?.toString() === input.agentId.toString()) score += 10_000;
  if (year === input.evaluationYear) score += 5_000;
  else if (periodYears.has(year)) score += 3_000;

  const status = normalizeStatus(input.roadmap.status);
  if (["APPROVED", "CLOSED"].includes(status)) score += 400;
  else if (["SUBMITTED", "PARTIALLY_APPROVED"].includes(status)) score += 250;
  else if (["DRAFT", "RETURNED"].includes(status)) score += 120;

  score += Math.min(999, Math.floor(dateTimeValue(input.roadmap.updatedAt ?? input.roadmap.createdAt) / 86_400_000) % 1000);

  return score;
}

function readRoadmapStats(roadmap?: RoadmapEvaluationCandidate | null): {
  roadmapProgress: number | undefined;
  roadmapStatus: string | undefined;
  roadmapTotalItems: number;
  roadmapCompletedItems: number;
  roadmapRemainingItems: number;
  roadmapRemainingPercent: number | undefined;
  roadmapReference?: string;
  roadmapTitle?: string;
} {
  if (!roadmap) {
    return {
      roadmapProgress: undefined,
      roadmapStatus: undefined,
      roadmapTotalItems: 0,
      roadmapCompletedItems: 0,
      roadmapRemainingItems: 0,
      roadmapRemainingPercent: undefined,
    };
  }

  const items = Array.isArray(roadmap.items) ? roadmap.items : [];
  const completedFromItems = items.filter((item) => normalizeStatus(item.status) === "DONE").length;

  const nativeTotal = safeInteger(roadmap.itemCount, 0);
  const nativeCompleted = safeInteger(roadmap.completedItemCount, 0);

  const roadmapTotalItems = nativeTotal > 0 ? nativeTotal : items.length;
  const roadmapCompletedItems = roadmapTotalItems > 0
    ? Math.min(roadmapTotalItems, nativeCompleted > 0 ? nativeCompleted : completedFromItems)
    : 0;

  const computedProgress = computePercentFromParts(
    roadmapCompletedItems,
    roadmapTotalItems,
    0,
  );

  const nativeProgress = clampIndex(safeNumber(roadmap.progressPercentage, Number.NaN));
  const hasNativeProgress = Number.isFinite(Number(roadmap.progressPercentage));
  const roadmapProgress = roadmapTotalItems > 0
    ? (hasNativeProgress && nativeProgress > 0 ? nativeProgress : computedProgress)
    : undefined;

  const roadmapRemainingItems = Math.max(0, roadmapTotalItems - roadmapCompletedItems);
  const roadmapRemainingPercent = roadmapProgress === undefined
    ? undefined
    : clampIndex(100 - roadmapProgress);

  return {
    roadmapProgress,
    roadmapStatus: String(roadmap.status ?? ""),
    roadmapTotalItems,
    roadmapCompletedItems,
    roadmapRemainingItems,
    roadmapRemainingPercent,
    roadmapReference: roadmap.reference,
    roadmapTitle: roadmap.title,
  };
}

async function findEvaluationRoadmap(input: {
  tenant: TenantDocument;
  agentId: Types.ObjectId;
  periodStartDate: Date;
  periodEndDate: Date;
  evaluationYear: number;
}): Promise<RoadmapEvaluationCandidate | null> {
  const tenantId = input.tenant._id;

  const agent = (await (AgentModel as any)
    .findOne({
      _id: input.agentId,
      tenantId,
    })
    .select("_id userId email matricule firstName lastName")
    .lean()
    .exec()) as {
      _id: Types.ObjectId;
      userId?: Types.ObjectId | string | null;
      email?: string | null;
      matricule?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    } | null;

  const relatedAgentOrClauses: Record<string, any>[] = [
    { _id: input.agentId },
  ];

  const normalizedAgentEmail = agent?.email?.trim().toLowerCase();
  const normalizedMatricule = agent?.matricule?.trim().toUpperCase();

  if (normalizedAgentEmail) {
    relatedAgentOrClauses.push({ email: normalizedAgentEmail });
  }

  if (normalizedMatricule) {
    relatedAgentOrClauses.push({ matricule: normalizedMatricule });
  }

  const relatedAgents = (await (AgentModel as any)
    .find({
      tenantId,
      $or: relatedAgentOrClauses,
    })
    .select("_id userId email matricule")
    .lean()
    .exec()) as Array<{
      _id: Types.ObjectId;
      userId?: Types.ObjectId | string | null;
      email?: string | null;
      matricule?: string | null;
    }>;

  const relatedAgentIds = [
    ...new Map(
      relatedAgents.map((item) => [item._id.toString(), item._id]),
    ).values(),
  ];

  const relatedLegacyUserIds = relatedAgents
    .map((item) => item.userId)
    .filter(Boolean);

  const relatedEmails = [
    ...new Set(
      relatedAgents
        .map((item) => item.email?.trim().toLowerCase())
        .filter(Boolean) as string[],
    ),
  ];

  const linkedUserOrClauses: Record<string, any>[] = [
    { agentId: { $in: relatedAgentIds.length ? relatedAgentIds : [input.agentId] } },
  ];

  if (relatedLegacyUserIds.length > 0) {
    linkedUserOrClauses.push({ _id: { $in: relatedLegacyUserIds } });
  }

  if (relatedEmails.length > 0) {
    linkedUserOrClauses.push({ email: { $in: relatedEmails } });
  }

  const linkedUsers = (await (UserModel as any)
    .find({
      tenantId,
      $or: linkedUserOrClauses,
    })
    .select("_id")
    .lean()
    .exec()) as Array<{ _id: Types.ObjectId }>;

  const linkedUserIds = linkedUsers.map((user) => user._id);

  const orClauses: Record<string, any>[] = [
    { agentId: { $in: relatedAgentIds.length ? relatedAgentIds : [input.agentId] } },
  ];

  if (linkedUserIds.length > 0) {
    orClauses.push({ createdByUserId: { $in: linkedUserIds } });
  }

  const candidates = (await (RoadmapModel as any)
    .find({
      tenantId,
      $or: orClauses,
    })
    .select(
      "_id agentId createdByUserId calendarYear reference title status items itemCount completedItemCount progressPercentage updatedAt createdAt",
    )
    .sort({
      calendarYear: -1,
      updatedAt: -1,
      createdAt: -1,
    })
    .lean()
    .exec()) as RoadmapEvaluationCandidate[];

  if (candidates.length === 0) {
    return null;
  }

  return candidates
    .map((roadmap) => ({
      roadmap,
      score: roadmapCandidateScore({
        roadmap,
        agentId: input.agentId,
        evaluationYear: input.evaluationYear,
        periodStartDate: input.periodStartDate,
        periodEndDate: input.periodEndDate,
      }),
    }))
    .sort((first, second) => second.score - first.score)[0]?.roadmap ?? null;
}

function decisionLabel(value?: string): string {
  const labels: Record<string, string> = {
    CONFIRMATION: "confirmation dans le poste",
    RENEWAL_RECOMMENDED: "renouvellement recommandé",
    PROMOTION_RECOMMENDED: "évolution ou promotion recommandée",
    TRAINING_PLAN: "plan de formation recommandé",
    PERFORMANCE_IMPROVEMENT_PLAN: "plan d’amélioration de la performance",
    MOBILITY_RECOMMENDED: "mobilité ou réaffectation recommandée",
    NO_DECISION: "aucune décision arrêtée à ce stade",
  };

  return labels[value ?? "NO_DECISION"] ?? "aucune décision arrêtée à ce stade";
}

function clampIndex(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreForCriterion(criteria: EvaluationCriterion[], key: EvaluationCriterion["key"]): number {
  const criterion = criteria.find((item) => item.key === key);
  return Math.round(((criterion?.finalScore ?? criterion?.systemSuggestedScore ?? 0) / 5) * 100);
}

function computeFinalScore(criteria: EvaluationCriterion[]): number {
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0) || 100;
  const weighted = criteria.reduce((sum, criterion) => {
    const score =
      normalizeScore(criterion.hrScore) ??
      normalizeScore(criterion.managerScore) ??
      normalizeScore(criterion.selfScore) ??
      normalizeScore(criterion.systemSuggestedScore) ??
      0;

    criterion.finalScore = score;
    return sum + (score / 5) * criterion.weight;
  }, 0);

  return Math.round((weighted / totalWeight) * 100);
}

function formatNarrativeNumber(
  value: number | undefined,
  maximumFractionDigits = 1,
): string {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(safeValue);
}

function performanceInterpretation(score: number): string {
  if (score >= 90) return "niveau d’excellence, nettement supérieur aux attentes";
  if (score >= 80) return "niveau très solide, supérieur aux attentes habituelles";
  if (score >= 70) return "niveau satisfaisant, globalement conforme aux attentes";
  if (score >= 60) return "niveau perfectible, nécessitant des mesures ciblées";
  return "niveau insuffisant, appelant un accompagnement formalisé";
}

function buildEvaluationIntelligence(
  evaluation: Pick<
    EvaluationDocument,
    | "agentSnapshot"
    | "performanceSnapshot"
    | "criteria"
    | "finalScore"
    | "grade"
    | "periodStartDate"
    | "periodEndDate"
    | "hrValidation"
    | "selfReview"
    | "managerReview"
  >,
): EvaluationIntelligence {
  const snapshot = evaluation.performanceSnapshot;
  const agentName = evaluation.agentSnapshot.fullName;
  const directionName =
    evaluation.agentSnapshot.directionName ?? "rattachement non renseigné";
  const serviceName =
    evaluation.agentSnapshot.serviceName ?? "sans service précisé";

  const objectiveIndex = clampIndex(
    scoreForCriterion(evaluation.criteria, "OBJECTIVES_RESULTS"),
  );
  const attendanceIndex = clampIndex(
    scoreForCriterion(evaluation.criteria, "DISCIPLINE_ATTENDANCE"),
  );
  const qualityIndex = clampIndex(
    scoreForCriterion(evaluation.criteria, "WORK_QUALITY"),
  );
  const initiativeIndex = clampIndex(
    scoreForCriterion(evaluation.criteria, "INITIATIVE_AUTONOMY"),
  );
  const collaborationIndex = clampIndex(
    scoreForCriterion(evaluation.criteria, "COLLABORATION_TEAMWORK"),
  );

  const taskDataAvailable = snapshot.tasksTotal > 0;
  const roadmapDataAvailable =
    snapshot.roadmapProgress !== undefined || snapshot.roadmapTotalItems > 0;
  const attendanceDataAvailable =
    snapshot.attendanceRecords > 0 || snapshot.attendanceMarkedDays > 0;
  const leaveDataAvailable =
    snapshot.leaveRequestsTotal > 0 || snapshot.annualLeaveBalanceConfigured;

  const taskCompletionRate = taskDataAvailable
    ? clampIndex(
        snapshot.taskCompletionRate ??
          (snapshot.tasksCompleted / snapshot.tasksTotal) * 100,
      )
    : 0;
  const roadmapProgress = roadmapDataAvailable
    ? clampIndex(
        snapshot.roadmapProgress ??
          computePercentFromParts(
            snapshot.roadmapCompletedItems,
            snapshot.roadmapTotalItems,
          ),
      )
    : 0;

  const effectiveExpectedDays = Math.max(
    0,
    snapshot.workingDaysExpected - snapshot.leaveCoveredWorkdays,
  );
  const absenceRate = effectiveExpectedDays
    ? (snapshot.absentDays / effectiveExpectedDays) * 100
    : 0;
  const punctualityBase = Math.max(
    1,
    snapshot.attendanceMarkedDays || snapshot.presentDays,
  );
  const lateRate = attendanceDataAvailable
    ? (snapshot.lateDays / punctualityBase) * 100
    : 0;
  const overdueRate = taskDataAvailable
    ? (snapshot.tasksOverdue / snapshot.tasksTotal) * 100
    : 0;

  const reliabilityIndex = clampIndex(
    100 -
      Math.min(45, absenceRate * 2.2) -
      Math.min(22, lateRate * 0.8) -
      Math.min(25, overdueRate * 0.9) -
      Math.min(18, snapshot.unrecordedWorkdays * 3),
  );
  const consistencyIndex = clampIndex(
    (qualityIndex + attendanceIndex + objectiveIndex + reliabilityIndex) / 4,
  );

  const dataPoints = [
    taskDataAvailable,
    roadmapDataAvailable,
    snapshot.workingDaysExpected > 0,
    attendanceDataAvailable,
    leaveDataAvailable,
    evaluation.selfReview !== undefined,
    evaluation.managerReview !== undefined,
  ].filter(Boolean).length;
  const dataConfidence: EvaluationIntelligence["dataConfidence"] =
    dataPoints >= 6 ? "HIGH" : dataPoints >= 4 ? "MEDIUM" : "LOW";

  let riskLevel: EvaluationIntelligence["riskLevel"] = "LOW";
  if (
    evaluation.finalScore < 55 ||
    attendanceIndex < 40 ||
    reliabilityIndex < 40 ||
    snapshot.absentDays >= 5 ||
    (taskDataAvailable && taskCompletionRate < 45)
  ) {
    riskLevel = "CRITICAL";
  } else if (
    evaluation.finalScore < 68 ||
    snapshot.tasksOverdue >= 3 ||
    attendanceIndex < 58 ||
    reliabilityIndex < 60 ||
    snapshot.absentDays >= 3 ||
    (taskDataAvailable && taskCompletionRate < 65)
  ) {
    riskLevel = "HIGH";
  } else if (
    evaluation.finalScore < 80 ||
    snapshot.lateDays > 3 ||
    snapshot.unrecordedWorkdays > 2 ||
    (taskDataAvailable && taskCompletionRate < 78) ||
    (roadmapDataAvailable && roadmapProgress < 65)
  ) {
    riskLevel = "MODERATE";
  }

  let potentialLevel: EvaluationIntelligence["potentialLevel"] = "SOLID";
  if (
    dataConfidence !== "LOW" &&
    evaluation.finalScore >= 86 &&
    objectiveIndex >= 80 &&
    initiativeIndex >= 75 &&
    reliabilityIndex >= 75
  ) {
    potentialLevel = "HIGH_POTENTIAL";
  } else if (
    evaluation.finalScore >= 72 &&
    initiativeIndex >= 65 &&
    riskLevel !== "HIGH" &&
    riskLevel !== "CRITICAL"
  ) {
    potentialLevel = "EMERGING";
  } else if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
    potentialLevel = "TO_SUPPORT";
  }

  let recommendedDecision: EvaluationIntelligence["recommendedDecision"] =
    "CONFIRMATION";
  if (riskLevel === "CRITICAL") {
    recommendedDecision = "PERFORMANCE_IMPROVEMENT_PLAN";
  } else if (riskLevel === "HIGH") {
    recommendedDecision = "TRAINING_PLAN";
  } else if (potentialLevel === "HIGH_POTENTIAL") {
    recommendedDecision = "PROMOTION_RECOMMENDED";
  } else if (
    evaluation.agentSnapshot.contractType === "FIXED_TERM" &&
    evaluation.finalScore >= 70
  ) {
    recommendedDecision = "RENEWAL_RECOMMENDED";
  } else if (
    dataConfidence === "LOW" &&
    !evaluation.managerReview &&
    !evaluation.hrValidation
  ) {
    recommendedDecision = "NO_DECISION";
  }

  const taskInterpretation = !taskDataAvailable
    ? "Aucune tâche exploitable n’est disponible ; le système ne déduit donc pas une contre-performance de cette absence de données."
    : taskCompletionRate >= 90
      ? `L’exécution opérationnelle est remarquable : ${snapshot.tasksCompleted}/${snapshot.tasksTotal} tâche(s) sont clôturées, soit ${taskCompletionRate} %.`
      : taskCompletionRate >= 75
        ? `L’exécution opérationnelle est globalement maîtrisée : ${snapshot.tasksCompleted}/${snapshot.tasksTotal} tâche(s) sont clôturées (${taskCompletionRate} %), avec ${snapshot.tasksOverdue} retard(s) à sécuriser.`
        : taskCompletionRate >= 55
          ? `L’exécution demeure partielle : ${snapshot.tasksCompleted}/${snapshot.tasksTotal} tâche(s) sont clôturées (${taskCompletionRate} %). Les travaux non terminés ou échus nécessitent une clarification des priorités et des moyens.`
          : `L’exécution est insuffisamment matérialisée : ${snapshot.tasksCompleted}/${snapshot.tasksTotal} tâche(s) sont clôturées (${taskCompletionRate} %). Un plan de rattrapage et une revue des causes sont nécessaires.`;

  const roadmapInterpretation = !roadmapDataAvailable
    ? "Aucune feuille de route exploitable n’est rattachée à la période ; l’alignement stratégique doit être apprécié pendant l’entretien."
    : roadmapProgress >= 85
      ? `La feuille de route est très avancée (${roadmapProgress} % ; ${snapshot.roadmapCompletedItems}/${snapshot.roadmapTotalItems} élément(s) réalisés), ce qui confirme un bon alignement sur les priorités annuelles.`
      : roadmapProgress >= 65
        ? `La feuille de route progresse de manière satisfaisante (${roadmapProgress} %), mais ${snapshot.roadmapRemainingItems} élément(s) restent à finaliser ou à documenter.`
        : `La feuille de route reste insuffisamment réalisée (${roadmapProgress} % ; ${snapshot.roadmapRemainingItems} élément(s) restant(s)). La hiérarchie doit distinguer un retard réel d’un défaut de mise à jour des preuves.`;

  let alignmentInterpretation =
    "La cohérence entre activité quotidienne et feuille de route ne peut pas être pleinement mesurée.";
  if (taskDataAvailable && roadmapDataAvailable) {
    const gap = taskCompletionRate - roadmapProgress;
    if (Math.abs(gap) <= 15) {
      alignmentInterpretation =
        "Les tâches exécutées et la feuille de route évoluent de façon cohérente ; l’activité courante paraît bien orientée vers les objectifs .";
    } else if (gap > 15) {
      alignmentInterpretation =
        "Le taux de clôture des tâches dépasse nettement l’avancement de la feuille de route. Il convient de vérifier que l’activité produite contribue effectivement aux priorités annuelles et que la feuille de route est correctement mise à jour.";
    } else {
      alignmentInterpretation =
        "La feuille de route paraît plus avancée que les tâches tracées. Cette situation peut révéler une traçabilité incomplète des activités ou des résultats renseignés hors du module Tâches.";
    }
  }

  const attendanceInterpretation = !attendanceDataAvailable
    ? "Les données de pointage sont insuffisantes ; aucune conclusion définitive sur l’assiduité ne doit être tirée sans vérification RH."
    : snapshot.absentDays === 0 && snapshot.lateMinutes === 0
      ? `La disponibilité est régulière sur ${snapshot.workingDaysExpected} jour(s) ouvré(s) évaluables, sans absence non couverte ni retard enregistré.`
      : `La disponibilité fait apparaître ${formatNarrativeNumber(snapshot.absentDays)} jour(s) non couvert(s), ${snapshot.lateDays} jour(s) de retard et ${snapshot.lateMinutes} minute(s) cumulée(s). Ces éléments doivent être rapprochés des justificatifs et du contexte de travail.`;

  const leaveInterpretation = !leaveDataAvailable
    ? "Aucune demande de congé ni solde annuel exploitable n’est disponible."
    : `${formatNarrativeNumber(snapshot.leaveApprovedDays)} jour(s) de congé approuvé(s) ont été distingués des absences et neutralisés dans la note d’assiduité. ${
        snapshot.leavePendingDays > 0
          ? `${formatNarrativeNumber(snapshot.leavePendingDays)} jour(s) restent en validation et limitent provisoirement la fiabilité du constat.`
          : "Aucune demande en attente n’altère le constat au jour du calcul."
      }`;

  const overtimeHours = snapshot.overtimeMinutes / 60;
  const workloadInterpretation =
    snapshot.overtimeMinutes <= 0
      ? "Aucune heure supplémentaire n’est enregistrée ; ce point est neutre dans la notation."
      : overtimeHours < 8
        ? `${formatNarrativeNumber(overtimeHours)} heure(s) supplémentaire(s) sont enregistrées. Elles attestent d’une mobilisation ponctuelle, sans constituer à elles seules une preuve de performance.`
        : `${formatNarrativeNumber(overtimeHours)} heure(s) supplémentaire(s) sont enregistrées. Ce volume doit être analysé comme un signal de charge, de priorisation ou de capacité, et non comme un bonus automatique.`;

  const strengths: string[] = [];
  if (objectiveIndex >= 80 && taskDataAvailable) {
    strengths.push(
      `Capacité d’exécution démontrée avec ${taskCompletionRate} % de tâches clôturées.`,
    );
  }
  if (roadmapDataAvailable && roadmapProgress >= 80) {
    strengths.push(
      `Contribution stratégique visible : feuille de route réalisée à ${roadmapProgress} %.`,
    );
  }
  if (qualityIndex >= 80) {
    strengths.push(
      "Qualité et fiabilité du travail supérieures aux attentes ressortant de la grille consolidée.",
    );
  }
  if (
    attendanceDataAvailable &&
    attendanceIndex >= 80 &&
    snapshot.absentDays === 0
  ) {
    strengths.push(
      `Assiduité solide ; ${formatNarrativeNumber(snapshot.leaveCoveredWorkdays)} jour(s) de congé autorisé(s) ont été correctement neutralisés.`,
    );
  }
  if (collaborationIndex >= 80) {
    strengths.push(
      "Coopération et contribution au fonctionnement collectif favorablement appréciées.",
    );
  }
  if (!strengths.length) {
    strengths.push(
      "Des marges de progression sont identifiées et peuvent être transformées en résultats par des objectifs plus précis, un suivi régulier et des preuves mieux documentées.",
    );
  }

  const alerts: string[] = [];
  if (dataConfidence === "LOW") {
    alerts.push(
      "La couverture des données est limitée : la décision finale doit rester subordonnée à l’entretien contradictoire et aux preuves complémentaires.",
    );
  }
  if (snapshot.tasksOverdue > 0) {
    alerts.push(
      `${snapshot.tasksOverdue} tâche(s) échue(s) ou non clôturée(s) doivent être qualifiées : retard imputable, dépendance externe, changement de priorité ou défaut de mise à jour.`,
    );
  }
  if (roadmapDataAvailable && roadmapProgress < 65) {
    alerts.push(
      `L’avancement de la feuille de route (${roadmapProgress} %) est inférieur au niveau attendu et requiert un plan de sécurisation.`,
    );
  }
  if (snapshot.absentDays > 0) {
    alerts.push(
      `${formatNarrativeNumber(snapshot.absentDays)} jour(s) non couvert(s) ou sans pointage subsistent après neutralisation des congés approuvés.`,
    );
  }
  if (snapshot.lateDays > 3 || snapshot.lateMinutes >= 120) {
    alerts.push(
      `La ponctualité appelle une action corrective : ${snapshot.lateDays} jour(s) de retard, soit ${snapshot.lateMinutes} minute(s) cumulée(s).`,
    );
  }
  if (snapshot.leavePendingDays > 0) {
    alerts.push(
      `${formatNarrativeNumber(snapshot.leavePendingDays)} jour(s) de congé sont encore en validation ; le constat d’assiduité devra être recalculé après décision.`,
    );
  }
  if (overtimeHours >= 8) {
    alerts.push(
      `Le volume d’heures supplémentaires (${formatNarrativeNumber(overtimeHours)} h) peut signaler une surcharge, une mauvaise répartition des tâches ou un besoin de renforcement des moyens.`,
    );
  }
  if (evaluation.finalScore < 70) {
    alerts.push(
      "Le score consolidé justifie des objectifs correctifs formalisés, mesurables et datés.",
    );
  }

  const dataWarnings: string[] = [];
  if (!taskDataAvailable) {
    dataWarnings.push(
      "Aucune tâche exploitable n’a été trouvée ; le score ne doit pas être interprété comme une mesure exhaustive de l’activité.",
    );
  }
  if (snapshot.workingDaysExpected === 0) {
    dataWarnings.push(
      "La période évaluée ne contient aucun jour ouvré exploitable.",
    );
  }
  if (!attendanceDataAvailable) {
    dataWarnings.push(
      "Aucun pointage exploitable n’a été trouvé ; l’indicateur d’assiduité est principalement déclaratif.",
    );
  }
  if (!roadmapDataAvailable) {
    dataWarnings.push(
      "Aucune feuille de route annuelle exploitable n’a été trouvée pour cette évaluation.",
    );
  }
  if (!snapshot.annualLeaveBalanceConfigured) {
    dataWarnings.push(
      `Le solde de congé annuel ${evaluation.periodEndDate.getUTCFullYear()} n’est pas configuré ; les demandes sont comptabilisées, mais le disponible annuel ne peut pas être certifié.`,
    );
  }

  const recommendedActions: string[] = [];
  if (riskLevel === "CRITICAL") {
    recommendedActions.push(
      "Mettre en place un plan d’amélioration de la performance sur 90 jours, avec objectifs hebdomadaires, responsables d’appui et critères de sortie explicites.",
    );
  } else if (riskLevel === "HIGH") {
    recommendedActions.push(
      "Ouvrir un accompagnement managérial renforcé avec revue bimensuelle des résultats, difficultés et moyens nécessaires.",
    );
  } else if (potentialLevel === "HIGH_POTENTIAL") {
    recommendedActions.push(
      "Préparer un parcours de développement : mission élargie, responsabilité transversale ou vivier de mobilité, sous réserve de résultats durables.",
    );
  } else {
    recommendedActions.push(
      "Consolider les acquis et fixer trois objectifs SMART directement reliés à la feuille de route du service.",
    );
  }

  if (snapshot.tasksOverdue > 0 || snapshot.tasksNotCompleted > 0) {
    recommendedActions.push(
      "Reclasser les tâches restantes par priorité, dépendance et échéance ; fermer ou replanifier celles qui ne sont plus pertinentes.",
    );
  }
  if (roadmapDataAvailable && roadmapProgress < 75) {
    recommendedActions.push(
      "Établir un plan de rattrapage de la feuille de route, avec jalons mensuels et pièces justificatives obligatoires.",
    );
  }
  if (snapshot.leavePendingDays > 0) {
    recommendedActions.push(
      "Finaliser les demandes de congé en attente avant validation définitive de l’indicateur d’assiduité.",
    );
  }
  if (snapshot.absentDays > 0 || snapshot.lateMinutes >= 60) {
    recommendedActions.push(
      "Vérifier les justificatifs, rappeler les règles de pointage et convenir d’une mesure de régularisation proportionnée.",
    );
  }
  if (overtimeHours >= 8) {
    recommendedActions.push(
      "Analyser la charge de travail, la répartition des responsabilités et les ressources disponibles afin de limiter la dépendance aux heures supplémentaires.",
    );
  }
  recommendedActions.push(
    "Conserver dans la fiche les preuves déterminantes : livrables, rapports, validations de feuille de route, décisions de congé et observations hiérarchiques.",
  );

  const managerTalkingPoints = [
    `Résultats : ${taskInterpretation}`,
    `Alignement stratégique : ${roadmapInterpretation}`,
    `Cohérence des données : ${alignmentInterpretation}`,
    `Assiduité : ${attendanceInterpretation}`,
    `Congés : ${leaveInterpretation}`,
    `Charge de travail : ${workloadInterpretation}`,
    "Décision : recueillir les observations de l’agent, distinguer les causes maîtrisables des dépendances externes et arrêter des engagements réciproques datés.",
  ];

  const developmentPriority =
    recommendedDecision === "PERFORMANCE_IMPROVEMENT_PLAN"
      ? "Redressement de la performance, sécurisation des priorités et suivi rapproché"
      : recommendedDecision === "TRAINING_PLAN"
        ? "Montée en compétence ciblée, organisation du travail et accompagnement opérationnel"
        : potentialLevel === "HIGH_POTENTIAL"
          ? "Capitalisation sur le potentiel et préparation progressive à des responsabilités élargies"
          : roadmapDataAvailable && roadmapProgress < 70
            ? "Recentrage de l’activité sur les priorités de la feuille de route"
            : "Consolidation des acquis, traçabilité des résultats et progression continue";

  const period = `du ${toDateKey(evaluation.periodStartDate)} au ${toDateKey(evaluation.periodEndDate)}`;
  const coverageText =
    dataConfidence === "HIGH"
      ? "La couverture des données est robuste."
      : dataConfidence === "MEDIUM"
        ? "La couverture des données est suffisante, avec quelques réserves à lever pendant l’entretien."
        : "La couverture des données reste limitée ; aucune décision irréversible ne doit reposer sur les seuls indicateurs automatisés.";

  const hrExecutiveBrief = [
    `${agentName}, rattaché(e) à ${directionName} — ${serviceName}, obtient ${evaluation.finalScore}/100 sur la période ${period}, soit un ${performanceInterpretation(evaluation.finalScore)}.`,
    `${taskInterpretation} ${roadmapInterpretation} ${alignmentInterpretation}`,
    `${attendanceInterpretation} ${leaveInterpretation} ${workloadInterpretation}`,
    `Lecture RH : risque ${riskLevel}, potentiel ${potentialLevel}, fiabilité ${reliabilityIndex}/100 et constance ${consistencyIndex}/100. ${coverageText}`,
    `Priorité recommandée : ${developmentPriority}.`,
  ].join("\n\n");

  const directorGeneralBrief = [
    "APPRÉCIATION GLOBALE",
    `${agentName} — ${directionName} / ${serviceName} — obtient ${evaluation.finalScore}/100. Le niveau consolidé correspond à un ${performanceInterpretation(evaluation.finalScore)}. L’indice d’objectifs est de ${objectiveIndex}/100, l’assiduité de ${attendanceIndex}/100, la fiabilité de ${reliabilityIndex}/100 et la constance de ${consistencyIndex}/100.`,
    "RÉSULTATS ET ALIGNEMENT STRATÉGIQUE",
    `${taskInterpretation} ${roadmapInterpretation} ${alignmentInterpretation}`,
    "DISCIPLINE, DISPONIBILITÉ ET CHARGE",
    `${attendanceInterpretation} ${leaveInterpretation} ${workloadInterpretation}`,
    "RISQUES ET POINTS D’ARBITRAGE",
    alerts.length
      ? alerts.slice(0, 4).join(" ")
      : "Aucun risque majeur n’est identifié par les données disponibles. La continuité des résultats doit néanmoins être confirmée dans le temps.",
    "DÉCISION PROPOSÉE",
    `La recommandation est : ${decisionLabel(recommendedDecision)}. Cette orientation est fondée sur un niveau de risque ${riskLevel}, un potentiel ${potentialLevel} et une confiance des données ${dataConfidence}. Elle doit être confirmée après entretien contradictoire, examen des justificatifs et appréciation du contexte opérationnel.`,
  ].join("\n\n");

  const next90DayPlan: string[] = [
    "Sous 15 jours : tenir l’entretien contradictoire, valider les faits, les contraintes et trois objectifs prioritaires assortis d’indicateurs.",
    "Sous 30 jours : régulariser les données manquantes, les demandes de congé en attente et les tâches ou jalons non documentés.",
    "Sous 45 jours : mesurer l’avancement réel, lever les blocages et ajuster les moyens, la charge ou les échéances.",
    "Sous 90 jours : réaliser une revue RH formelle, comparer les résultats aux engagements et confirmer, adapter ou clôturer la mesure décidée.",
  ];

  return {
    dataConfidence,
    riskLevel,
    potentialLevel,
    recommendedDecision,
    consistencyIndex,
    reliabilityIndex,
    objectiveIndex,
    attendanceIndex,
    developmentPriority,
    strengths,
    alerts,
    recommendedActions,
    managerTalkingPoints,
    hrExecutiveBrief,
    directorGeneralBrief,
    next90DayPlan,
    dataWarnings,
    generatedAt: new Date(),
  };
}


function buildNarratives(
  evaluation: Pick<
    EvaluationDocument,
    | "agentSnapshot"
    | "performanceSnapshot"
    | "criteria"
    | "finalScore"
    | "grade"
    | "periodStartDate"
    | "periodEndDate"
    | "hrValidation"
    | "intelligence"
  >,
): {
  printableIntro: string;
  executiveSummary: string;
  generatedConclusion: string;
} {
  const agentName = evaluation.agentSnapshot.fullName;
  const directionName =
    evaluation.agentSnapshot.directionName ??
    "rattachement organisationnel à régulariser";
  const serviceName =
    evaluation.agentSnapshot.serviceName ?? "sans service précisé";
  const period = `du ${toDateKey(evaluation.periodStartDate)} au ${toDateKey(evaluation.periodEndDate)}`;
  const label = scoreLabel(evaluation.finalScore);
  const decision = decisionLabel(
    evaluation.hrValidation?.finalDecision ??
      evaluation.intelligence?.recommendedDecision,
  );
  const snapshot = evaluation.performanceSnapshot;
  const taskCompletionRate = snapshot.tasksTotal
    ? clampIndex(
        snapshot.taskCompletionRate ??
          (snapshot.tasksCompleted / snapshot.tasksTotal) * 100,
      )
    : 0;
  const roadmapProgress =
    snapshot.roadmapProgress ??
    (snapshot.roadmapTotalItems
      ? computePercentFromParts(
          snapshot.roadmapCompletedItems,
          snapshot.roadmapTotalItems,
        )
      : undefined);

  const resultReading = snapshot.tasksTotal
    ? `${snapshot.tasksCompleted}/${snapshot.tasksTotal} tâche(s) clôturée(s), soit ${taskCompletionRate} %`
    : "aucune tâche suffisamment renseignée pour une mesure exhaustive";
  const roadmapReading =
    roadmapProgress === undefined
      ? "aucune feuille de route exploitable"
      : `une feuille de route réalisée à ${roadmapProgress} % (${snapshot.roadmapCompletedItems}/${snapshot.roadmapTotalItems} élément(s))`;
  const availabilityReading =
    `${formatNarrativeNumber(snapshot.absentDays)} jour(s) non couvert(s), ` +
    `${snapshot.lateMinutes} minute(s) de retard et ` +
    `${formatNarrativeNumber(snapshot.leaveApprovedDays)} jour(s) de congé régulièrement approuvé(s)`;

  return {
    printableIntro:
      `La présente fiche porte sur l’évaluation professionnelle de ${agentName}, rattaché(e) à ${directionName} — ${serviceName}, pour la période ${period}. Elle croise les données disponibles dans la Plateforme-RH— tâches, feuille de route, pointage, congés et dossier administratif — avec les appréciations de l’agent, de la hiérarchie et de la RH. Les indicateurs automatisés constituent une aide à la décision : ils doivent être lus avec les justificatifs, les contraintes du poste et les observations contradictoires. Les congés approuvés sont neutralisés et ne sont jamais assimilés à une absence injustifiée.`,
    executiveSummary:
      `${agentName} obtient ${evaluation.finalScore}/100, correspondant à une ${label}. La lecture opérationnelle fait ressortir ${resultReading} et ${roadmapReading}. Sur le plan de la disponibilité, la période présente ${availabilityReading}. L’analyse distingue les résultats effectivement tracés, les données manquantes et les situations administrativement justifiées ; elle ne transforme ni l’absence de saisie en faute automatique, ni les heures supplémentaires en preuve autonome de performance. Le niveau de risque est ${evaluation.intelligence.riskLevel}, le potentiel ${evaluation.intelligence.potentialLevel} et la confiance des données ${evaluation.intelligence.dataConfidence}.`,
    generatedConclusion:
      `Au terme de l’analyse, l’orientation proposée est : ${decision}. Cette recommandation résulte du rapprochement entre l’atteinte des objectifs, la progression de la feuille de route, la qualité et la traçabilité du travail, l’assiduité corrigée des congés autorisés, ainsi que les appréciations humaines disponibles. Elle doit être confirmée après entretien contradictoire et examen des éléments probants. La décision finale devra préciser les objectifs, les moyens, les échéances et les modalités de suivi afin de garantir une appréciation équitable, compréhensible et directement exploitable par la Direction et la RH.`,
  };
}


function serializeLink(link: EvaluationEvidenceLink): EvaluationEvidenceLink {
  return {
    title: link.title,
    url: link.url,
    description: link.description,
  };
}

function serializeReview(review?: EvaluationReviewBlock) {
  if (!review) return undefined;
  return {
    comment: review.comment,
    strengths: review.strengths,
    improvementAreas: review.improvementAreas,
    trainingNeeds: review.trainingNeeds,
    nextObjectives: review.nextObjectives,
    reviewedByUserId: review.reviewedByUserId?.toString(),
    reviewedByName: review.reviewedByName,
    reviewedAt: review.reviewedAt?.toISOString(),
  };
}

function serializeHrValidation(validation?: EvaluationHrValidation) {
  if (!validation) return undefined;
  return {
    finalDecision: validation.finalDecision,
    finalComment: validation.finalComment,
    validatedByUserId: validation.validatedByUserId?.toString(),
    validatedByName: validation.validatedByName,
    validatedAt: validation.validatedAt?.toISOString(),
  };
}

function serializePerformanceSnapshot(
  snapshot: Partial<EvaluationPerformanceSnapshot> | undefined,
  fallback: { periodStartDate: Date; periodEndDate: Date },
) {
  const safeDate = (value: unknown, fallbackDate: Date): Date => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return fallbackDate;
  };

  const periodStartDate = safeDate(snapshot?.periodStartDate, fallback.periodStartDate);
  const periodEndDate = safeDate(snapshot?.periodEndDate, fallback.periodEndDate);
  const generatedAt = safeDate(snapshot?.generatedAt, new Date());

  return {
    periodStartDate: periodStartDate.toISOString(),
    periodEndDate: periodEndDate.toISOString(),
    tasksTotal: safeInteger(snapshot?.tasksTotal),
    tasksCompleted: safeInteger(snapshot?.tasksCompleted),
    tasksNotCompleted: safeInteger(snapshot?.tasksNotCompleted),
    tasksInProgress: safeInteger(snapshot?.tasksInProgress),
    tasksBlocked: safeInteger(snapshot?.tasksBlocked),
    tasksOverdue: safeInteger(snapshot?.tasksOverdue),
    taskCompletionRate: clampIndex(safeNumber(snapshot?.taskCompletionRate)),
    averageTaskProgress: clampIndex(safeNumber(snapshot?.averageTaskProgress)),
    workingDaysExpected: safeInteger(snapshot?.workingDaysExpected),
    attendanceRecords: safeInteger(snapshot?.attendanceRecords),
    attendanceMarkedDays: safeInteger(snapshot?.attendanceMarkedDays),
    presentDays: safeInteger(snapshot?.presentDays),
    lateDays: safeInteger(snapshot?.lateDays),
    absentDays: safeInteger(snapshot?.absentDays),
    unrecordedWorkdays: safeNumber(snapshot?.unrecordedWorkdays),
    leaveRequestsTotal: safeInteger(snapshot?.leaveRequestsTotal),
    leaveDraftRequests: safeInteger(snapshot?.leaveDraftRequests),
    leaveSubmittedRequests: safeInteger(snapshot?.leaveSubmittedRequests),
    leaveManagerApprovedRequests: safeInteger(snapshot?.leaveManagerApprovedRequests),
    leaveApprovedRequests: safeInteger(snapshot?.leaveApprovedRequests),
    leaveRejectedRequests: safeInteger(snapshot?.leaveRejectedRequests),
    leaveCancelledRequests: safeInteger(snapshot?.leaveCancelledRequests),
    leaveRequestedDays: safeNumber(snapshot?.leaveRequestedDays),
    leavePendingDays: safeNumber(snapshot?.leavePendingDays),
    leaveApprovedDays: safeNumber(snapshot?.leaveApprovedDays),
    leaveRejectedDays: safeNumber(snapshot?.leaveRejectedDays),
    leaveCancelledDays: safeNumber(snapshot?.leaveCancelledDays),
    leaveCoveredWorkdays: safeNumber(snapshot?.leaveCoveredWorkdays),
    leaveApprovalRate: clampIndex(safeNumber(snapshot?.leaveApprovalRate)),
    annualLeaveApprovedDays: safeNumber(snapshot?.annualLeaveApprovedDays),
    sickLeaveApprovedDays: safeNumber(snapshot?.sickLeaveApprovedDays),
    maternityLeaveApprovedDays: safeNumber(snapshot?.maternityLeaveApprovedDays),
    paternityLeaveApprovedDays: safeNumber(snapshot?.paternityLeaveApprovedDays),
    specialLeaveApprovedDays: safeNumber(snapshot?.specialLeaveApprovedDays),
    unpaidLeaveApprovedDays: safeNumber(snapshot?.unpaidLeaveApprovedDays),
    trainingLeaveApprovedDays: safeNumber(snapshot?.trainingLeaveApprovedDays),
    otherLeaveApprovedDays: safeNumber(snapshot?.otherLeaveApprovedDays),
    annualLeaveBalanceConfigured: Boolean(snapshot?.annualLeaveBalanceConfigured),
    annualLeaveOpeningDays: safeNumber(snapshot?.annualLeaveOpeningDays),
    annualLeaveEntitledDays: safeNumber(snapshot?.annualLeaveEntitledDays),
    annualLeaveCarriedOverDays: safeNumber(snapshot?.annualLeaveCarriedOverDays),
    annualLeaveAdjustmentDays: safeNumber(snapshot?.annualLeaveAdjustmentDays),
    annualLeaveConsumedDays: safeNumber(snapshot?.annualLeaveConsumedDays),
    annualLeaveAvailableDays: safeNumber(snapshot?.annualLeaveAvailableDays),
    leaveTypeBreakdown: getSafeArray<EvaluationLeaveBreakdownItem>(snapshot?.leaveTypeBreakdown).map((item) => ({
      leaveType: item.leaveType,
      requestsTotal: safeInteger(item.requestsTotal),
      requestedDays: safeNumber(item.requestedDays),
      approvedRequests: safeInteger(item.approvedRequests),
      approvedDays: safeNumber(item.approvedDays),
    })),
    lateMinutes: safeInteger(snapshot?.lateMinutes),
    workedMinutes: safeInteger(snapshot?.workedMinutes),
    overtimeMinutes: safeInteger(snapshot?.overtimeMinutes),
    roadmapProgress: snapshot?.roadmapProgress === undefined ? undefined : clampIndex(safeNumber(snapshot.roadmapProgress)),
    roadmapStatus: snapshot?.roadmapStatus,
    roadmapTotalItems: safeInteger(snapshot?.roadmapTotalItems),
    roadmapCompletedItems: safeInteger(snapshot?.roadmapCompletedItems),
    roadmapRemainingItems: safeInteger(snapshot?.roadmapRemainingItems),
    roadmapRemainingPercent: snapshot?.roadmapRemainingPercent === undefined ? undefined : clampIndex(safeNumber(snapshot.roadmapRemainingPercent)),
    automaticDataSummary: getSafeArray(snapshot?.automaticDataSummary),
    dataSources: getSafeArray(snapshot?.dataSources),
    generatedAt: generatedAt.toISOString(),
  };
}

function serializeIntelligence(intelligence: EvaluationIntelligence) {
  return {
    dataConfidence: intelligence.dataConfidence,
    riskLevel: intelligence.riskLevel,
    potentialLevel: intelligence.potentialLevel,
    recommendedDecision: intelligence.recommendedDecision,
    consistencyIndex: intelligence.consistencyIndex,
    reliabilityIndex: intelligence.reliabilityIndex,
    objectiveIndex: intelligence.objectiveIndex,
    attendanceIndex: intelligence.attendanceIndex,
    developmentPriority: intelligence.developmentPriority,
    strengths: [...intelligence.strengths],
    alerts: [...intelligence.alerts],
    recommendedActions: [...intelligence.recommendedActions],
    managerTalkingPoints: [...intelligence.managerTalkingPoints],
    hrExecutiveBrief: intelligence.hrExecutiveBrief,
    directorGeneralBrief: intelligence.directorGeneralBrief,
    next90DayPlan: [...intelligence.next90DayPlan],
    dataWarnings: [...intelligence.dataWarnings],
    generatedAt: intelligence.generatedAt.toISOString(),
  };
}

function serializeEvaluation(evaluation: EvaluationDocument): PublicEvaluation {
  return {
    id: evaluation.id,
    tenantId: evaluation.tenantId.toString(),
    reference: evaluation.reference,
    title: evaluation.title,
    evaluationYear: evaluation.evaluationYear,
    periodStartDate: evaluation.periodStartDate.toISOString(),
    periodEndDate: evaluation.periodEndDate.toISOString(),
    agentId: evaluation.agentId.toString(),
    directionId: evaluation.directionId.toString(),
    serviceId: evaluation.serviceId ? evaluation.serviceId.toString() : null,
    status: evaluation.status,
    agentSnapshot: {
      fullName: evaluation.agentSnapshot.fullName,
      matricule: evaluation.agentSnapshot.matricule,
      email: evaluation.agentSnapshot.email,
      phone: evaluation.agentSnapshot.phone,
      jobTitle: evaluation.agentSnapshot.jobTitle,
      grade: evaluation.agentSnapshot.grade,
      category: evaluation.agentSnapshot.category,
      directionName: evaluation.agentSnapshot.directionName,
      serviceName: evaluation.agentSnapshot.serviceName,
      employmentStatus: evaluation.agentSnapshot.employmentStatus,
      contractType: evaluation.agentSnapshot.contractType,
      employmentStartDate: evaluation.agentSnapshot.employmentStartDate?.toISOString(),
      employmentEndDate: evaluation.agentSnapshot.employmentEndDate?.toISOString(),
    },
    performanceSnapshot: serializePerformanceSnapshot(evaluation.performanceSnapshot, {
      periodStartDate: evaluation.periodStartDate,
      periodEndDate: evaluation.periodEndDate,
    }),
    criteria: evaluation.criteria.map((criterion) => ({
      key: criterion.key,
      label: criterion.label,
      description: criterion.description,
      weight: criterion.weight,
      systemSuggestedScore: criterion.systemSuggestedScore,
      selfScore: criterion.selfScore,
      managerScore: criterion.managerScore,
      hrScore: criterion.hrScore,
      finalScore: criterion.finalScore,
      comment: criterion.comment,
      scoreBasis: criterion.scoreBasis,
      automationDetails: criterion.automationDetails ?? [],
      evidenceLinks: criterion.evidenceLinks.map(serializeLink),
    })),
    evidenceLinks: evaluation.evidenceLinks.map(serializeLink),
    selfReview: serializeReview(evaluation.selfReview),
    managerReview: serializeReview(evaluation.managerReview),
    hrValidation: serializeHrValidation(evaluation.hrValidation),
    finalScore: evaluation.finalScore,
    grade: evaluation.grade,
    executiveSummary: evaluation.executiveSummary,
    printableIntro: evaluation.printableIntro,
    generatedConclusion: evaluation.generatedConclusion,
    intelligence: serializeIntelligence(evaluation.intelligence ?? buildEvaluationIntelligence(evaluation)),
    confidentialNote: evaluation.confidentialNote,
    createdByUserId: evaluation.createdByUserId.toString(),
    lastUpdatedByUserId: evaluation.lastUpdatedByUserId?.toString(),
    archivedAt: evaluation.archivedAt?.toISOString(),
    createdAt: evaluation.createdAt?.toISOString(),
    updatedAt: evaluation.updatedAt?.toISOString(),
  };
}

async function nextReference(tenant: TenantDocument, year: number): Promise<string> {
  const count = await EvaluationModel.countDocuments({
    tenantId: tenant._id,
    evaluationYear: year,
  }).exec();

  return `EVAL-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function getEvaluationOrThrow(
  tenant: TenantDocument,
  evaluationId: string,
): Promise<EvaluationDocument> {
  const evaluation = await EvaluationModel.findOne({
    _id: evaluationId,
    tenantId: tenant._id,
  }).exec();

  if (!evaluation) {
    throw new AppError("L'évaluation demandée est introuvable.", 404, "EVALUATION_NOT_FOUND");
  }

  return evaluation;
}

async function getAgentSnapshotOrThrow(tenant: TenantDocument, agentId: string): Promise<AgentSnapshotSource> {
  const agent = await (AgentModel as any).findOne({ _id: agentId, tenantId: tenant._id })
    .select(
      "_id firstName lastName matricule email phone jobTitle grade category directionId serviceId employmentStatus contractType employmentStartDate employmentEndDate",
    )
    .lean()
    .exec();

  if (!agent) {
    throw new AppError("L'agent sélectionné est introuvable.", 404, "EVALUATION_AGENT_NOT_FOUND");
  }

  const raw = agent as AgentSnapshotSource;
  if (!raw.directionId && !raw.serviceId) {
    throw new AppError(
      "L'agent sélectionné doit être rattaché à une Direction ou à un Service actif.",
      400,
      "EVALUATION_AGENT_DIRECTION_REQUIRED",
    );
  }

  return raw;
}

type LeanEvaluationOrganizationUnit = {
  _id: Types.ObjectId;
  name?: string;
  code?: string;
  type?: "DIRECTION" | "SERVICE";
  parentId?: Types.ObjectId | string | null;
  status?: string;
};

function getOrganizationReferenceId(
  reference?: OrganizationReference | null,
): string | null {
  if (!reference) return null;

  if (
    typeof reference === "string" ||
    reference instanceof Types.ObjectId
  ) {
    const value = reference.toString().trim();
    return Types.ObjectId.isValid(value) ? value : null;
  }

  const rawId = reference._id ?? reference.id;
  if (!rawId) return null;

  const value = rawId.toString().trim();
  return Types.ObjectId.isValid(value) ? value : null;
}

function getOrganizationReferenceName(
  reference?: OrganizationReference | null,
): string | undefined {
  if (
    !reference ||
    typeof reference === "string" ||
    reference instanceof Types.ObjectId
  ) {
    return undefined;
  }

  return cleanOptionalText(reference.name);
}

async function getUnitNames(
  tenant: TenantDocument,
  input: {
    directionId?: OrganizationReference | null;
    serviceId?: OrganizationReference | null;
  },
): Promise<{
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
  directionName?: string;
  serviceName?: string;
}> {
  const tenantId = tenant._id as Types.ObjectId;
  const rawDirectionId = getOrganizationReferenceId(input.directionId);
  const rawServiceId = getOrganizationReferenceId(input.serviceId);

  const initialIds = [
    ...new Set([rawDirectionId, rawServiceId].filter(Boolean) as string[]),
  ];

  const initialUnits = initialIds.length
    ? ((await (OrganizationUnitModel as any)
        .find({
          tenantId,
          _id: { $in: initialIds },
        })
        .select("_id name code type parentId status")
        .lean()
        .exec()) as LeanEvaluationOrganizationUnit[])
    : [];

  const unitsById = new Map(
    initialUnits.map((unit) => [unit._id.toString(), unit]),
  );

  let directionUnit = rawDirectionId
    ? unitsById.get(rawDirectionId)
    : undefined;
  let serviceUnit = rawServiceId
    ? unitsById.get(rawServiceId)
    : undefined;

  // Répare les anciennes données où un Service a été enregistré à la place
  // de la Direction, puis remonte automatiquement vers sa Direction parente.
  if (directionUnit?.type === "SERVICE") {
    serviceUnit = serviceUnit ?? directionUnit;
    directionUnit = undefined;
  }

  if (serviceUnit?.type === "DIRECTION" && !directionUnit) {
    directionUnit = serviceUnit;
    serviceUnit = undefined;
  }

  const embeddedServiceParentId =
    typeof input.serviceId === "object" &&
    input.serviceId !== null &&
    !(input.serviceId instanceof Types.ObjectId)
      ? input.serviceId.parentId?.toString()
      : undefined;

  const parentDirectionId =
    serviceUnit?.parentId?.toString() ?? embeddedServiceParentId;

  if (
    !directionUnit &&
    parentDirectionId &&
    Types.ObjectId.isValid(parentDirectionId)
  ) {
    directionUnit =
      ((await (OrganizationUnitModel as any)
        .findOne({
          _id: parentDirectionId,
          tenantId,
          type: "DIRECTION",
        })
        .select("_id name code type parentId status")
        .lean()
        .exec()) as LeanEvaluationOrganizationUnit | null) ?? undefined;
  }

  const resolvedDirectionId =
    directionUnit?._id ??
    (rawDirectionId && Types.ObjectId.isValid(rawDirectionId)
      ? new Types.ObjectId(rawDirectionId)
      : undefined);
  const resolvedServiceId =
    serviceUnit?._id ??
    (rawServiceId && Types.ObjectId.isValid(rawServiceId)
      ? new Types.ObjectId(rawServiceId)
      : null);

  return {
    directionId: resolvedDirectionId,
    serviceId: resolvedServiceId,
    directionName:
      cleanOptionalText(directionUnit?.name) ??
      getOrganizationReferenceName(input.directionId),
    serviceName:
      cleanOptionalText(serviceUnit?.name) ??
      getOrganizationReferenceName(input.serviceId),
  };
}

async function buildAgentIdentityPayload(
  tenant: TenantDocument,
  agent: AgentSnapshotSource,
) {
  const unitNames = await getUnitNames(tenant, {
    directionId: agent.directionId,
    serviceId: agent.serviceId ?? null,
  });

  if (!unitNames.directionId || !unitNames.directionName) {
    throw new AppError(
      "La Direction de l'agent est introuvable dans l'organisation FADES. Vérifiez son rattachement dans le module Agents.",
      400,
      "EVALUATION_AGENT_DIRECTION_NOT_RESOLVED",
    );
  }

  const fullName = `${agent.firstName} ${agent.lastName}`.trim();

  return {
    fullName,
    directionId: unitNames.directionId,
    serviceId: unitNames.serviceId ?? null,
    agentSnapshot: {
      fullName,
      matricule: agent.matricule,
      email: agent.email,
      phone: agent.phone,
      jobTitle: agent.jobTitle,
      grade: agent.grade,
      category: agent.category,
      directionName: unitNames.directionName,
      serviceName: unitNames.serviceName,
      employmentStatus: agent.employmentStatus,
      contractType: agent.contractType,
      employmentStartDate: agent.employmentStartDate,
      employmentEndDate: agent.employmentEndDate,
    },
  };
}

async function refreshEvaluationAgentIdentity(
  tenant: TenantDocument,
  evaluation: EvaluationDocument,
): Promise<void> {
  const agent = (await (AgentModel as any)
    .findOne({
      _id: evaluation.agentId,
      tenantId: tenant._id,
    })
    .select(
      "_id firstName lastName matricule email phone jobTitle grade category directionId serviceId employmentStatus contractType employmentStartDate employmentEndDate",
    )
    .lean()
    .exec()) as AgentSnapshotSource | null;

  if (agent) {
    try {
      const identity = await buildAgentIdentityPayload(tenant, agent);

      evaluation.directionId = identity.directionId;
      evaluation.serviceId = identity.serviceId;
      evaluation.agentSnapshot = identity.agentSnapshot;
      return;
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      // Ancienne fiche : on conserve le snapshot historique, puis on tente
      // de réparer le rattachement à partir des identifiants déjà enregistrés.
    }
  }

  const unitNames = await getUnitNames(tenant, {
    directionId: evaluation.directionId,
    serviceId: evaluation.serviceId ?? null,
  });

  if (unitNames.directionId) {
    evaluation.directionId = unitNames.directionId;
  }

  if (unitNames.serviceId !== undefined) {
    evaluation.serviceId = unitNames.serviceId;
  }

  evaluation.agentSnapshot.directionName =
    unitNames.directionName ??
    evaluation.agentSnapshot.directionName ??
    "Rattachement organisationnel à régulariser";
  evaluation.agentSnapshot.serviceName =
    unitNames.serviceName ?? evaluation.agentSnapshot.serviceName;
}

async function refreshEvaluationListIdentities(
  tenant: TenantDocument,
  evaluations: EvaluationDocument[],
): Promise<void> {
  await Promise.all(
    evaluations.map((evaluation) =>
      refreshEvaluationAgentIdentity(tenant, evaluation),
    ),
  );
}

async function buildPerformanceSnapshot(input: {
  tenant: TenantDocument;
  agentId: Types.ObjectId;
  periodStartDate: Date;
  periodEndDate: Date;
  evaluationYear: number;
}): Promise<EvaluationPerformanceSnapshot> {
  const { tenant, agentId, periodStartDate, periodEndDate, evaluationYear } = input;

  const todayUtc = startOfUtcDayForEvaluation(new Date());
  const todayEndUtc = endOfUtcDayForEvaluation(todayUtc);
  const requestedEndInclusive = endOfUtcDayForEvaluation(periodEndDate);
  const isFuturePeriodEnd =
    requestedEndInclusive.getTime() > todayEndUtc.getTime();
  const calculationEndDate = isFuturePeriodEnd
    ? todayEndUtc
    : requestedEndInclusive;
  const startDateKey = toDateKey(periodStartDate);
  const endDateKey = toDateKey(calculationEndDate);
  const weekdayKeys =
    periodStartDate.getTime() <= calculationEndDate.getTime()
      ? getWeekdayKeys(periodStartDate, calculationEndDate)
      : [];
  const dataSources: string[] = [];

  if (isFuturePeriodEnd) {
    dataSources.push(
      `Données de performance arrêtées au ${endDateKey} afin de ne pas comptabiliser les jours futurs comme absences.`,
    );
  }

  let taskData = {
    tasksTotal: 0,
    tasksCompleted: 0,
    tasksNotCompleted: 0,
    tasksInProgress: 0,
    tasksBlocked: 0,
    tasksOverdue: 0,
    taskCompletionRate: 0,
    averageTaskProgress: 0,
  };

  {
    dataSources.push("Tâches");
    const tasks = await (TaskModel as any).find({
      tenantId: tenant._id,
      $and: [
        {
          $or: [
            { assignedToAgentId: agentId },
            { assignedAgentId: agentId },
            { agentId },
            { ownerAgentId: agentId },
            { responsibleAgentId: agentId },
            { responsibleAgentIds: agentId },
            { assignedAgentIds: agentId },
            { assigneeAgentIds: agentId },
            { "assignees.agentId": agentId },
          ],
        },
        {
          $or: [
            { startDate: { $gte: periodStartDate, $lte: calculationEndDate } },
            { dueDate: { $gte: periodStartDate, $lte: calculationEndDate } },
            { completedAt: { $gte: periodStartDate, $lte: calculationEndDate } },
            { createdAt: { $gte: periodStartDate, $lte: calculationEndDate } },
            { updatedAt: { $gte: periodStartDate, $lte: calculationEndDate } },
            { startDate: { $lte: calculationEndDate }, dueDate: { $gte: periodStartDate } },
            { dueDate: { $exists: false }, createdAt: { $lte: calculationEndDate }, status: { $ne: "COMPLETED" } },
          ],
        },
      ],
    })
      .lean()
      .exec();

    const completedTasks = tasks.filter((task: any) => isCompletedStatus(task.status));
    const totalProgress = tasks.reduce((sum: number, task: any) => sum + safeNumber(getProgressValue(task), 0), 0);

    taskData = {
      tasksTotal: tasks.length,
      tasksCompleted: completedTasks.length,
      tasksNotCompleted: Math.max(0, tasks.length - completedTasks.length),
      tasksInProgress: tasks.filter((task: any) => ["IN_PROGRESS", "ONGOING", "ACTIVE"].includes(normalizeStatus(task.status))).length,
      tasksBlocked: tasks.filter((task: any) => isBlockedStatus(task.status)).length,
      tasksOverdue: tasks.filter((task: any) => task.dueDate && !isCompletedStatus(task.status) && new Date(task.dueDate).getTime() < calculationEndDate.getTime()).length,
      taskCompletionRate: computePercentFromParts(completedTasks.length, tasks.length),
      averageTaskProgress: tasks.length ? clampIndex(Math.round(totalProgress / tasks.length)) : 0,
    };
  }

  let approvedLeaveCoverageByDate = new Map<string, number>();
  let leaveData = {
    leaveRequestsTotal: 0,
    leaveDraftRequests: 0,
    leaveSubmittedRequests: 0,
    leaveManagerApprovedRequests: 0,
    leaveApprovedRequests: 0,
    leaveRejectedRequests: 0,
    leaveCancelledRequests: 0,
    leaveRequestedDays: 0,
    leavePendingDays: 0,
    leaveApprovedDays: 0,
    leaveRejectedDays: 0,
    leaveCancelledDays: 0,
    leaveCoveredWorkdays: 0,
    leaveApprovalRate: 0,
    annualLeaveApprovedDays: 0,
    sickLeaveApprovedDays: 0,
    maternityLeaveApprovedDays: 0,
    paternityLeaveApprovedDays: 0,
    specialLeaveApprovedDays: 0,
    unpaidLeaveApprovedDays: 0,
    trainingLeaveApprovedDays: 0,
    otherLeaveApprovedDays: 0,
    annualLeaveBalanceConfigured: false,
    annualLeaveOpeningDays: 0,
    annualLeaveEntitledDays: 0,
    annualLeaveCarriedOverDays: 0,
    annualLeaveAdjustmentDays: 0,
    annualLeaveConsumedDays: 0,
    annualLeaveAvailableDays: 0,
    leaveTypeBreakdown: createEmptyLeaveBreakdown(),
  };

  {
    dataSources.push("Congés");

    const [leaves, annualLeaveBalance] = await Promise.all([
      (LeaveRequestModel as any)
        .find({
          tenantId: tenant._id,
          agentId,
          startDate: { $lte: endDateKey },
          endDate: { $gte: startDateKey },
        })
        .select(
          "leaveType startDate endDate requestedDays status managerReview finalReview submittedAt",
        )
        .lean()
        .exec(),
      (LeaveBalanceModel as any)
        .findOne({
          tenantId: tenant._id,
          agentId,
          calendarYear: evaluationYear,
          leaveType: "ANNUAL_LEAVE",
        })
        .select(
          "openingDays entitledDays carriedOverDays adjustmentDays consumedDays",
        )
        .lean()
        .exec(),
    ]);

    const breakdownMap = new Map(
      leaveData.leaveTypeBreakdown.map((item) => [item.leaveType, item]),
    );

    for (const leave of leaves as Array<Record<string, any>>) {
      const leaveType = EVALUATION_LEAVE_TYPES.includes(leave.leaveType)
        ? (leave.leaveType as EvaluationLeaveType)
        : "OTHER";
      const status = normalizeStatus(leave.status);
      const periodLeave = getLeaveDaysForEvaluationPeriod({
        leave,
        evaluationWeekdayKeys: weekdayKeys,
        periodStartKey: startDateKey,
        periodEndKey: endDateKey,
      });
      const days = periodLeave.days;
      const breakdown = breakdownMap.get(leaveType);

      leaveData.leaveRequestsTotal += 1;
      if (status !== "CANCELLED") {
        leaveData.leaveRequestedDays += days;
      }

      if (breakdown) {
        breakdown.requestsTotal += 1;
        if (status !== "CANCELLED") {
          breakdown.requestedDays = roundLeaveDays(
            breakdown.requestedDays + days,
          );
        }
      }

      if (status === "DRAFT") leaveData.leaveDraftRequests += 1;
      if (status === "SUBMITTED") leaveData.leaveSubmittedRequests += 1;
      if (status === "MANAGER_APPROVED") {
        leaveData.leaveManagerApprovedRequests += 1;
      }
      if (PENDING_LEAVE_STATUSES.includes(status as (typeof PENDING_LEAVE_STATUSES)[number])) {
        leaveData.leavePendingDays += days;
      }
      if (status === "REJECTED") {
        leaveData.leaveRejectedRequests += 1;
        leaveData.leaveRejectedDays += days;
      }
      if (status === "CANCELLED") {
        leaveData.leaveCancelledRequests += 1;
        leaveData.leaveCancelledDays += days;
      }

      if (status !== APPROVED_LEAVE_STATUS) continue;

      leaveData.leaveApprovedRequests += 1;
      leaveData.leaveApprovedDays += days;

      if (breakdown) {
        breakdown.approvedRequests += 1;
        breakdown.approvedDays = roundLeaveDays(
          breakdown.approvedDays + days,
        );
      }

      periodLeave.coverageByDate.forEach((coverage, dateKey) => {
        approvedLeaveCoverageByDate.set(
          dateKey,
          Math.min(
            1,
            (approvedLeaveCoverageByDate.get(dateKey) ?? 0) + coverage,
          ),
        );
      });

      if (leaveType === "ANNUAL_LEAVE") leaveData.annualLeaveApprovedDays += days;
      if (leaveType === "SICK_LEAVE") leaveData.sickLeaveApprovedDays += days;
      if (leaveType === "MATERNITY_LEAVE") leaveData.maternityLeaveApprovedDays += days;
      if (leaveType === "PATERNITY_LEAVE") leaveData.paternityLeaveApprovedDays += days;
      if (leaveType === "SPECIAL_LEAVE") leaveData.specialLeaveApprovedDays += days;
      if (leaveType === "UNPAID_LEAVE") leaveData.unpaidLeaveApprovedDays += days;
      if (leaveType === "TRAINING_LEAVE") leaveData.trainingLeaveApprovedDays += days;
      if (leaveType === "OTHER") leaveData.otherLeaveApprovedDays += days;
    }

    const reviewedRequests =
      leaveData.leaveApprovedRequests + leaveData.leaveRejectedRequests;
    leaveData.leaveApprovalRate = reviewedRequests
      ? clampIndex((leaveData.leaveApprovedRequests / reviewedRequests) * 100)
      : 0;
    leaveData.leaveCoveredWorkdays = roundLeaveDays(
      [...approvedLeaveCoverageByDate.values()].reduce(
        (sum, coverage) => sum + coverage,
        0,
      ),
    );

    leaveData.leaveRequestedDays = roundLeaveDays(leaveData.leaveRequestedDays);
    leaveData.leavePendingDays = roundLeaveDays(leaveData.leavePendingDays);
    leaveData.leaveApprovedDays = roundLeaveDays(leaveData.leaveApprovedDays);
    leaveData.leaveRejectedDays = roundLeaveDays(leaveData.leaveRejectedDays);
    leaveData.leaveCancelledDays = roundLeaveDays(leaveData.leaveCancelledDays);
    leaveData.annualLeaveApprovedDays = roundLeaveDays(leaveData.annualLeaveApprovedDays);
    leaveData.sickLeaveApprovedDays = roundLeaveDays(leaveData.sickLeaveApprovedDays);
    leaveData.maternityLeaveApprovedDays = roundLeaveDays(leaveData.maternityLeaveApprovedDays);
    leaveData.paternityLeaveApprovedDays = roundLeaveDays(leaveData.paternityLeaveApprovedDays);
    leaveData.specialLeaveApprovedDays = roundLeaveDays(leaveData.specialLeaveApprovedDays);
    leaveData.unpaidLeaveApprovedDays = roundLeaveDays(leaveData.unpaidLeaveApprovedDays);
    leaveData.trainingLeaveApprovedDays = roundLeaveDays(leaveData.trainingLeaveApprovedDays);
    leaveData.otherLeaveApprovedDays = roundLeaveDays(leaveData.otherLeaveApprovedDays);

    if (annualLeaveBalance) {
      leaveData.annualLeaveBalanceConfigured = true;
      leaveData.annualLeaveOpeningDays = safeNumber(annualLeaveBalance.openingDays);
      leaveData.annualLeaveEntitledDays = safeNumber(annualLeaveBalance.entitledDays);
      leaveData.annualLeaveCarriedOverDays = safeNumber(annualLeaveBalance.carriedOverDays);
      leaveData.annualLeaveAdjustmentDays = safeNumber(annualLeaveBalance.adjustmentDays);
      leaveData.annualLeaveConsumedDays = safeNumber(annualLeaveBalance.consumedDays);
      leaveData.annualLeaveAvailableDays = roundLeaveDays(
        leaveData.annualLeaveOpeningDays +
          leaveData.annualLeaveEntitledDays +
          leaveData.annualLeaveCarriedOverDays +
          leaveData.annualLeaveAdjustmentDays -
          leaveData.annualLeaveConsumedDays,
      );
    }

    const approvedLeaveLabels = leaveData.leaveTypeBreakdown
      .filter((item) => item.approvedDays > 0)
      .map((item) => `${leaveTypeLabel(item.leaveType)} : ${item.approvedDays} j`)
      .join(" · ");

    dataSources.push(
      `Congés retenus : ${leaveData.leaveApprovedRequests} demande(s) approuvée(s), ${leaveData.leaveApprovedDays} jour(s) autorisé(s) sur la période${approvedLeaveLabels ? ` · ${approvedLeaveLabels}` : ""}.`,
    );
    dataSources.push(
      annualLeaveBalance
        ? `Solde annuel ${evaluationYear} : ${leaveData.annualLeaveAvailableDays} jour(s) disponible(s), ${leaveData.annualLeaveConsumedDays} consommé(s).`
        : `Aucun solde de congé annuel configuré pour ${evaluationYear}.`,
    );
  }

  let attendanceData = {
    workingDaysExpected: weekdayKeys.length,
    attendanceRecords: 0,
    attendanceMarkedDays: 0,
    presentDays: 0,
    lateDays: 0,
    absentDays: 0,
    unrecordedWorkdays: 0,
    lateMinutes: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
  };

  {
    dataSources.push("Pointage");
    const attendances = await (AttendanceModel as any).find({
      tenantId: tenant._id,
      agentId,
      $or: [
        { attendanceDate: { $gte: startDateKey, $lte: endDateKey } },
        { date: { $gte: periodStartDate, $lte: calculationEndDate } },
        { createdAt: { $gte: periodStartDate, $lte: calculationEndDate } },
      ],
    })
      .lean()
      .exec();

    const weekdayAttendances = attendances.filter((row: any) => {
      const key = normalizeDateKey(row.attendanceDate ?? row.date ?? row.createdAt);
      return key ? isWeekdayKey(key) : false;
    });

    const recordedDateKeys = new Set(
      weekdayAttendances
        .map((row: any) => normalizeDateKey(row.attendanceDate ?? row.date ?? row.createdAt))
        .filter(Boolean) as string[],
    );

    const presentDays = weekdayAttendances.filter((row: any) =>
      ["PRESENT", "LATE", "REMOTE", "BUSINESS_TRIP", "EXCUSED"].includes(normalizeStatus(row.status)),
    ).length;
    const explicitAbsentDateKeys = new Set(
      weekdayAttendances
        .filter((row: any) => normalizeStatus(row.status) === "ABSENT")
        .map((row: any) =>
          normalizeDateKey(row.attendanceDate ?? row.date ?? row.createdAt),
        )
        .filter(Boolean) as string[],
    );

    let explicitAbsentDays = 0;
    let unrecordedWorkdays = 0;

    weekdayKeys.forEach((dateKey) => {
      const approvedLeaveCoverage = approvedLeaveCoverageByDate.get(dateKey) ?? 0;
      const unexplainedFraction = Math.max(0, 1 - approvedLeaveCoverage);

      if (explicitAbsentDateKeys.has(dateKey)) {
        explicitAbsentDays += unexplainedFraction;
        return;
      }

      if (!recordedDateKeys.has(dateKey)) {
        unrecordedWorkdays += unexplainedFraction;
      }
    });

    explicitAbsentDays = roundLeaveDays(explicitAbsentDays);
    unrecordedWorkdays = roundLeaveDays(unrecordedWorkdays);

    attendanceData = {
      workingDaysExpected: weekdayKeys.length,
      attendanceRecords: attendances.length,
      attendanceMarkedDays: recordedDateKeys.size,
      presentDays,
      lateDays: weekdayAttendances.filter((row: any) => normalizeStatus(row.status) === "LATE" || safeNumber(row.lateMinutes, 0) > 0).length,
      absentDays: roundLeaveDays(explicitAbsentDays + unrecordedWorkdays),
      unrecordedWorkdays,
      lateMinutes: weekdayAttendances.reduce((sum: number, row: any) => sum + safeNumber(row.lateMinutes, 0), 0),
      workedMinutes: weekdayAttendances.reduce((sum: number, row: any) => sum + safeNumber(row.workedMinutes, 0), 0),
      overtimeMinutes: weekdayAttendances.reduce((sum: number, row: any) => sum + safeNumber(row.overtimeMinutes, 0), 0),
    };
  }

  let roadmapProgress: number | undefined;
  let roadmapStatus: string | undefined;
  let roadmapTotalItems = 0;
  let roadmapCompletedItems = 0;
  let roadmapRemainingItems = 0;
  let roadmapRemainingPercent: number | undefined;

  {
    dataSources.push("Feuilles de route");

    const roadmap = await findEvaluationRoadmap({
      tenant,
      agentId,
      periodStartDate,
      periodEndDate,
      evaluationYear,
    });

    const roadmapStats = readRoadmapStats(roadmap);

    roadmapProgress = roadmapStats.roadmapProgress;
    roadmapStatus = roadmapStats.roadmapStatus;
    roadmapTotalItems = roadmapStats.roadmapTotalItems;
    roadmapCompletedItems = roadmapStats.roadmapCompletedItems;
    roadmapRemainingItems = roadmapStats.roadmapRemainingItems;
    roadmapRemainingPercent = roadmapStats.roadmapRemainingPercent;

    if (roadmapStats.roadmapReference || roadmapStats.roadmapTitle) {
      dataSources.push(
        `Feuille de route retenue : ${roadmapStats.roadmapReference ?? "sans référence"} · ${roadmapStats.roadmapTitle ?? "sans intitulé"}`
      );
    } else {
      dataSources.push(
        `Aucune feuille de route trouvée pour l'agent ${agentId.toString()} sur l'année ${evaluationYear}.`
      );
    }
  }

  const automaticDataSummary = [
    ...(isFuturePeriodEnd
      ? [`Données arrêtées au ${endDateKey} : les jours futurs ne sont pas comptés dans l'assiduité.`]
      : []),
    `Tâches : ${taskData.tasksCompleted}/${taskData.tasksTotal} terminée(s), ${taskData.tasksNotCompleted} non terminée(s), taux de réalisation ${taskData.taskCompletionRate}%.`,
    `Feuille de route : ${roadmapCompletedItems}/${roadmapTotalItems} élément(s) réalisé(s), ${roadmapRemainingItems} restant(s), progression ${roadmapProgress ?? 0}%.`,
    `Congés : ${leaveData.leaveApprovedRequests} demande(s) approuvée(s), ${leaveData.leaveApprovedDays} jour(s) autorisé(s), ${leaveData.leavePendingDays} jour(s) encore en validation.`,
    `Solde annuel : ${leaveData.annualLeaveBalanceConfigured ? `${leaveData.annualLeaveAvailableDays} jour(s) disponible(s) sur ${evaluationYear}` : `non configuré pour ${evaluationYear}`}.`,
    `Pointage : ${attendanceData.absentDays} jour(s) d'absence non couverte sur ${attendanceData.workingDaysExpected} jour(s) ouvré(s) ; ${leaveData.leaveCoveredWorkdays} jour(s) de congé approuvé ont été neutralisés.`,
    `Retards : ${attendanceData.lateDays} jour(s), ${attendanceData.lateMinutes} minute(s) cumulée(s).`,
    `Heures supplémentaires : ${Math.round(attendanceData.overtimeMinutes / 60)} heure(s) environ (${attendanceData.overtimeMinutes} minute(s)).`,
  ];

  return {
    periodStartDate,
    periodEndDate,
    ...taskData,
    ...attendanceData,
    ...leaveData,
    roadmapProgress,
    roadmapStatus,
    roadmapTotalItems,
    roadmapCompletedItems,
    roadmapRemainingItems,
    roadmapRemainingPercent,
    automaticDataSummary,
    dataSources,
    generatedAt: new Date(),
  };
}


function scoreFromPercent(percent: number): number {
  return Math.max(0, Math.min(5, Number((percent / 20).toFixed(1))));
}

function buildDefaultCriteria(snapshot: EvaluationPerformanceSnapshot): EvaluationCriterion[] {
  const taskCompletionRate = snapshot.taskCompletionRate ?? (snapshot.tasksTotal ? Math.round((snapshot.tasksCompleted / snapshot.tasksTotal) * 100) : 0);
  const roadmapPercent = snapshot.roadmapProgress ?? (snapshot.roadmapTotalItems ? computePercentFromParts(snapshot.roadmapCompletedItems, snapshot.roadmapTotalItems) : undefined);
  const objectivePercent = roadmapPercent === undefined
    ? (snapshot.tasksTotal ? taskCompletionRate : 60)
    : Math.round(taskCompletionRate * 0.6 + roadmapPercent * 0.4);

  const attendanceBase = snapshot.workingDaysExpected
    ? Math.round((Math.max(0, snapshot.workingDaysExpected - snapshot.absentDays) / snapshot.workingDaysExpected) * 100)
    : 65;
  const latePenalty = Math.min(25, Math.round((snapshot.lateMinutes / 60) * 2));
  // Les heures supplémentaires sont un signal de charge ou d'organisation.
  // Elles ne constituent pas un bonus automatique d'assiduité.
  const attendancePercent = clampIndex(attendanceBase - latePenalty);

  const taskDetails = [
    `Tâches confiées : ${snapshot.tasksTotal}.`,
    `Tâches terminées : ${snapshot.tasksCompleted}/${snapshot.tasksTotal}.`,
    `Tâches non terminées : ${snapshot.tasksNotCompleted}.`,
    `Tâches en retard : ${snapshot.tasksOverdue}.`,
    `Progression moyenne des tâches : ${snapshot.averageTaskProgress}%.`,
  ];

  const roadmapDetails = [
    `Feuille de route : ${snapshot.roadmapCompletedItems}/${snapshot.roadmapTotalItems} élément(s) réalisé(s).`,
    `Reste à réaliser : ${snapshot.roadmapRemainingItems} élément(s).`,
    `Progression globale feuille de route : ${snapshot.roadmapProgress ?? 0}%.`,
  ];

  const leaveDetails = [
    `Demandes de congé sur la période : ${snapshot.leaveRequestsTotal}.`,
    `Congés approuvés : ${snapshot.leaveApprovedRequests} demande(s), soit ${snapshot.leaveApprovedDays} jour(s).`,
    `Congés en validation : ${snapshot.leaveSubmittedRequests + snapshot.leaveManagerApprovedRequests} demande(s), soit ${snapshot.leavePendingDays} jour(s).`,
    `Congés refusés : ${snapshot.leaveRejectedRequests} demande(s), soit ${snapshot.leaveRejectedDays} jour(s).`,
    `Solde annuel disponible : ${snapshot.annualLeaveBalanceConfigured ? `${snapshot.annualLeaveAvailableDays} jour(s)` : "non configuré"}.`,
  ];

  const attendanceDetails = [
    `Jours ouvrés évaluables : ${snapshot.workingDaysExpected} jour(s), hors samedis et dimanches.`,
    `Présences ou jours marqués : ${snapshot.attendanceMarkedDays} jour(s).`,
    `Absences non couvertes ou jours ouvrés sans pointage : ${snapshot.absentDays} jour(s).`,
    `Congés approuvés neutralisés dans l'assiduité : ${snapshot.leaveCoveredWorkdays} jour(s).`,
    `Retard cumulé : ${snapshot.lateMinutes} minute(s), soit ${Math.round(snapshot.lateMinutes / 60)} heure(s) environ.`,
    `Heures supplémentaires : ${snapshot.overtimeMinutes} minute(s), soit ${Math.round(snapshot.overtimeMinutes / 60)} heure(s) environ.`,
  ];

  return [
    {
      key: "OBJECTIVES_RESULTS",
      label: "Réalisation des objectifs et résultats attendus",
      description: "Apprécie le niveau d’atteinte des objectifs, la contribution aux feuilles de route, l’exécution des tâches et la production de résultats mesurables. La note automatique combine principalement les tâches terminées/non terminées et la progression de la feuille de route.",
      weight: 25,
      systemSuggestedScore: scoreFromPercent(objectivePercent),
      scoreBasis: `Score automatique : tâches ${taskCompletionRate}% et feuille de route ${roadmapPercent ?? 0}%, soit ${objectivePercent}%.`,
      automationDetails: [...taskDetails, ...roadmapDetails],
      evidenceLinks: [],
    },
    {
      key: "WORK_QUALITY",
      label: "Qualité du travail et fiabilité professionnelle",
      description: "Évalue la précision, la rigueur, la constance, le respect des standards de qualité et la capacité à livrer un travail exploitable sans reprise excessive.",
      weight: 15,
      systemSuggestedScore: scoreFromPercent(Math.max(50, Math.round((snapshot.averageTaskProgress + objectivePercent) / 2))),
      scoreBasis: `Score automatique fondé sur la progression moyenne des tâches (${snapshot.averageTaskProgress}%) et le niveau d’objectifs (${objectivePercent}%).`,
      automationDetails: taskDetails,
      evidenceLinks: [],
    },
    {
      key: "TECHNICAL_SKILLS",
      label: "Compétences techniques",
      description: "Mesure la maîtrise des outils, méthodes, procédures et savoir-faire nécessaires au poste occupé. Cette rubrique doit être confirmée par l’appréciation du responsable, car elle ne peut pas être entièrement déduite des seules données chiffrées.",
      weight: 10,
      systemSuggestedScore: scoreFromPercent(Math.max(55, snapshot.averageTaskProgress || objectivePercent)),
      scoreBasis: "Score indicatif basé sur l’exécution et la progression des tâches ; validation humaine nécessaire.",
      automationDetails: taskDetails,
      evidenceLinks: [],
    },
    {
      key: "DISCIPLINE_ATTENDANCE",
      label: "Discipline, assiduité et respect des procédures",
      description: "Tient compte de la présence, des absences, des retards cumulés, du respect des horaires, de la ponctualité et de l’observation des règles internes. Les samedis et dimanches sont exclus du calcul.",
      weight: 10,
      systemSuggestedScore: scoreFromPercent(attendancePercent),
      scoreBasis: `Score automatique : base assiduité ${attendanceBase} %, après neutralisation de ${snapshot.leaveCoveredWorkdays} jour(s) de congé approuvé ; pénalité de ponctualité ${latePenalty} point(s). Les heures supplémentaires restent un indicateur de charge et ne majorent pas la note.`,
      automationDetails: [...attendanceDetails, ...leaveDetails],
      evidenceLinks: [],
    },
    {
      key: "INITIATIVE_AUTONOMY",
      label: "Initiative, autonomie et amélioration continue",
      description: "Apprécie la capacité à anticiper, proposer des solutions, travailler avec autonomie et contribuer à l’amélioration du service.",
      weight: 10,
      systemSuggestedScore: scoreFromPercent(
        Math.max(
          55,
          Math.round(
            (objectivePercent + (snapshot.averageTaskProgress || objectivePercent)) / 2,
          ),
        ),
      ),
      scoreBasis: "Score indicatif croisant les résultats atteints et la progression documentée des travaux. Les heures supplémentaires ne constituent pas un bonus automatique et doivent être appréciées comme un signal de charge.",
      automationDetails: [
        ...taskDetails,
        `Heures supplémentaires enregistrées : ${Math.round(snapshot.overtimeMinutes / 60)} heure(s) environ, à analyser au regard de la charge et des moyens.`,
      ],
      evidenceLinks: [],
    },
    {
      key: "COLLABORATION_TEAMWORK",
      label: "Collaboration et esprit d’équipe",
      description: "Évalue la qualité de la coopération, l’esprit d’équipe, la disponibilité et la contribution au climat professionnel. La donnée automatique reste indicative et doit être enrichie par l’appréciation managériale.",
      weight: 10,
      systemSuggestedScore: scoreFromPercent(Math.max(60, Math.round((attendancePercent + objectivePercent) / 2))),
      scoreBasis: "Score indicatif fondé sur la disponibilité et la contribution aux résultats collectifs.",
      automationDetails: [...attendanceDetails.slice(0, 3), ...taskDetails.slice(0, 3)],
      evidenceLinks: [],
    },
    {
      key: "COMMUNICATION_REPORTING",
      label: "Communication professionnelle et reporting",
      description: "Apprécie la clarté de la communication, la remontée d’informations, la traçabilité et la qualité du reporting.",
      weight: 10,
      systemSuggestedScore: scoreFromPercent(Math.max(55, snapshot.tasksTotal ? snapshot.averageTaskProgress : 60)),
      scoreBasis: "Score indicatif basé sur la traçabilité des tâches et livrables ; à compléter par le responsable.",
      automationDetails: taskDetails,
      evidenceLinks: [],
    },
    {
      key: "FADES_VALUES_COMMITMENT",
      label: "Adhésion aux valeurs et à la mission du FADES",
      description: "Mesure l’engagement, le sens du service, l’éthique professionnelle et l’alignement avec l’ambition du FADES au service du sport.",
      weight: 10,
      systemSuggestedScore: scoreFromPercent(Math.max(60, Math.round((attendancePercent + objectivePercent) / 2))),
      scoreBasis: "Score indicatif fondé sur l’assiduité, la contribution aux objectifs et la régularité professionnelle.",
      automationDetails: [...taskDetails.slice(0, 3), ...roadmapDetails, ...attendanceDetails.slice(0, 4), ...leaveDetails.slice(0, 2)],
      evidenceLinks: [],
    },
  ];
}


function mergeCriteria(
  currentCriteria: EvaluationCriterion[],
  inputCriteria?: Array<{
    key: EvaluationCriterion["key"];
    selfScore?: number;
    managerScore?: number;
    hrScore?: number;
    comment?: string;
    evidenceLinks?: EvaluationEvidenceLink[];
  }>,
): EvaluationCriterion[] {
  if (!inputCriteria?.length) return currentCriteria;

  const patchMap = new Map(inputCriteria.map((criterion) => [criterion.key, criterion]));

  return currentCriteria.map((criterion) => {
    const patch = patchMap.get(criterion.key);
    if (!patch) return criterion;

    return {
      ...criterion,
      selfScore: patch.selfScore !== undefined ? normalizeScore(patch.selfScore) : criterion.selfScore,
      managerScore: patch.managerScore !== undefined ? normalizeScore(patch.managerScore) : criterion.managerScore,
      hrScore: patch.hrScore !== undefined ? normalizeScore(patch.hrScore) : criterion.hrScore,
      comment: patch.comment !== undefined ? cleanOptionalText(patch.comment) : criterion.comment,
      scoreBasis: criterion.scoreBasis,
      automationDetails: criterion.automationDetails ?? [],
      evidenceLinks: patch.evidenceLinks ? patch.evidenceLinks.map(serializeLink) : criterion.evidenceLinks,
    };
  });
}

function refreshSystemSuggestedCriteria(
  currentCriteria: EvaluationCriterion[],
  performanceSnapshot: EvaluationPerformanceSnapshot,
): EvaluationCriterion[] {
  const suggestedCriteria = buildDefaultCriteria(performanceSnapshot);
  const currentMap = new Map(currentCriteria.map((criterion) => [criterion.key, criterion]));

  return suggestedCriteria.map((suggested) => {
    const current = currentMap.get(suggested.key);

    return {
      ...suggested,
      selfScore: current?.selfScore,
      managerScore: current?.managerScore,
      hrScore: current?.hrScore,
      finalScore: current?.finalScore,
      comment: current?.comment,
      scoreBasis: suggested.scoreBasis,
      automationDetails: suggested.automationDetails ?? [],
      evidenceLinks: current?.evidenceLinks ?? [],
    };
  });
}

function refreshEvaluationComputedFields(evaluation: EvaluationDocument): void {
  evaluation.finalScore = computeFinalScore(evaluation.criteria);
  evaluation.grade = gradeFromScore(evaluation.finalScore);
  evaluation.intelligence = buildEvaluationIntelligence(evaluation);

  const narratives = buildNarratives(evaluation);
  evaluation.printableIntro = narratives.printableIntro;
  evaluation.executiveSummary = narratives.executiveSummary;
  evaluation.generatedConclusion = narratives.generatedConclusion;
}


async function refreshEvaluationAutomaticSnapshot(
  tenant: TenantDocument,
  evaluation: EvaluationDocument,
): Promise<void> {
  evaluation.performanceSnapshot = await buildPerformanceSnapshot({
    tenant,
    agentId: evaluation.agentId,
    periodStartDate: evaluation.periodStartDate,
    periodEndDate: evaluation.periodEndDate,
    evaluationYear: evaluation.evaluationYear,
  });

  evaluation.criteria = refreshSystemSuggestedCriteria(
    evaluation.criteria,
    evaluation.performanceSnapshot,
  );

  refreshEvaluationComputedFields(evaluation);
}

function buildReviewBlock(input: ReviewBlockInput, actor: EvaluationActor): EvaluationReviewBlock {
  return {
    comment: cleanOptionalText(input.comment),
    strengths: cleanOptionalText(input.strengths),
    improvementAreas: cleanOptionalText(input.improvementAreas),
    trainingNeeds: cleanOptionalText(input.trainingNeeds),
    nextObjectives: cleanOptionalText(input.nextObjectives),
    reviewedByUserId: actor.userId,
    reviewedByName: actor.fullName,
    reviewedAt: new Date(),
  };
}

function buildFilter(input: {
  tenant: TenantDocument;
  actor: EvaluationActor;
  query: ListEvaluationsQuery;
}): MongoFilter {
  const clauses: MongoFilter[] = [{ tenantId: input.tenant._id }];
  const scope = getEvaluationScopeFilter(input.actor);

  if (Object.keys(scope).length > 0) clauses.push(scope);
  if (input.query.status) clauses.push({ status: input.query.status });
  if (input.query.evaluationYear) clauses.push({ evaluationYear: input.query.evaluationYear });
  if (input.query.agentId) clauses.push({ agentId: input.query.agentId });
  if (input.query.directionId && ["TENANT_ADMIN", "RH_MANAGER"].includes(input.actor.role)) clauses.push({ directionId: input.query.directionId });
  if (input.query.serviceId && ["TENANT_ADMIN", "RH_MANAGER", "DIRECTION"].includes(input.actor.role)) clauses.push({ serviceId: input.query.serviceId });

  if (input.query.dateFrom || input.query.dateTo) {
    clauses.push({
      periodEndDate: {
        ...(input.query.dateFrom ? { $gte: parseDate(input.query.dateFrom) } : {}),
        ...(input.query.dateTo ? { $lte: parseDate(input.query.dateTo) } : {}),
      },
    });
  }

  if (input.query.search) {
    const pattern = new RegExp(escapeRegex(input.query.search), "i");
    clauses.push({
      $or: [
        { reference: pattern },
        { title: pattern },
        { "agentSnapshot.fullName": pattern },
        { "agentSnapshot.matricule": pattern },
        { "agentSnapshot.jobTitle": pattern },
      ],
    });
  }

  return clauses.length === 1 ? clauses[0]! : { $and: clauses };}

export async function createEvaluation(
  tenant: TenantDocument,
  actor: EvaluationActor,
  input: CreateEvaluationInput,
): Promise<PublicEvaluation> {
  assertCanCreateEvaluation(actor);

  const agent = await getAgentSnapshotOrThrow(tenant, input.agentId);
  const periodStartDate = parseDate(input.periodStartDate);
  const periodEndDate = parseDate(input.periodEndDate);
  const evaluationYear = input.evaluationYear ?? periodEndDate.getUTCFullYear();
  const identity = await buildAgentIdentityPayload(tenant, agent);

  const duplicate = await EvaluationModel.exists({
    tenantId: tenant._id,
    agentId: agent._id,
    evaluationYear,
    periodStartDate,
    periodEndDate,
  }).exec();

  if (duplicate) {
    throw new AppError(
      "Une évaluation existe déjà pour cet agent sur la même période.",
      409,
      "EVALUATION_DUPLICATE_PERIOD",
    );
  }

  const performanceSnapshot = await buildPerformanceSnapshot({
    tenant,
    agentId: agent._id,
    periodStartDate,
    periodEndDate,
    evaluationYear,
  });

  const criteria = buildDefaultCriteria(performanceSnapshot);
  const finalScore = computeFinalScore(criteria);
  const grade = gradeFromScore(finalScore);
  const reference = await nextReference(tenant, evaluationYear);

  const evaluation = await EvaluationModel.create({
    tenantId: tenant._id,
    reference,
    title:
      input.title?.trim() ||
      `Évaluation professionnelle ${evaluationYear} · ${identity.fullName}`,
    evaluationYear,
    periodStartDate,
    periodEndDate,
    agentId: agent._id,
    directionId: identity.directionId,
    serviceId: identity.serviceId,
    status: "DRAFT",
    agentSnapshot: identity.agentSnapshot,
    performanceSnapshot,
    criteria,
    evidenceLinks: input.evidenceLinks?.map(serializeLink) ?? [],
    finalScore,
    grade,
    printableIntro: "Généré automatiquement.",
    executiveSummary: "Généré automatiquement.",
    generatedConclusion: "Généré automatiquement.",
    intelligence: {
      dataConfidence: "LOW",
      riskLevel: "MODERATE",
      potentialLevel: "EMERGING",
      recommendedDecision: "NO_DECISION",
      consistencyIndex: 0,
      reliabilityIndex: 0,
      objectiveIndex: 0,
      attendanceIndex: 0,
      developmentPriority: "Analyse en cours",
      strengths: [],
      alerts: [],
      recommendedActions: [],
      managerTalkingPoints: [],
      hrExecutiveBrief: "Analyse en cours",
      directorGeneralBrief: "Analyse en cours",
      next90DayPlan: [],
      dataWarnings: [],
      generatedAt: new Date(),
    },
    confidentialNote: cleanOptionalText(input.confidentialNote),
    createdByUserId: actor.userId,
    lastUpdatedByUserId: actor.userId,
  });

  refreshEvaluationComputedFields(evaluation);
  await evaluation.save();

  return serializeEvaluation(evaluation);
}

export async function getEvaluationById(
  tenant: TenantDocument,
  actor: EvaluationActor,
  evaluationId: string,
): Promise<PublicEvaluation> {
  const evaluation = await getEvaluationOrThrow(tenant, evaluationId);
  await refreshEvaluationAgentIdentity(tenant, evaluation);
  assertCanReadEvaluation(evaluation, actor);
  await refreshEvaluationAutomaticSnapshot(tenant, evaluation);
  await evaluation.save();
  return serializeEvaluation(evaluation);
}

export async function listEvaluations(
  tenant: TenantDocument,
  actor: EvaluationActor,
  query: ListEvaluationsQuery,
): Promise<{
  items: PublicEvaluation[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const filter = buildFilter({ tenant, actor, query });
  type EvaluationSortDefinition = Record<string, 1 | -1>;

  const defaultSort: EvaluationSortDefinition = { createdAt: -1 };

  const sortMap: Record<string, EvaluationSortDefinition> = {
    CREATED_DESC: defaultSort,
    PERIOD_DESC: { periodEndDate: -1, createdAt: -1 },
    SCORE_DESC: { finalScore: -1, periodEndDate: -1 },
    AGENT_ASC: { "agentSnapshot.fullName": 1, periodEndDate: -1 },
  };

  const sort: EvaluationSortDefinition =
    sortMap[query.sort] ?? defaultSort;

  const skip = (query.page - 1) * query.limit;

  const [evaluations, total] = await Promise.all([
    EvaluationModel.find(filter).sort(sort).skip(skip).limit(query.limit).exec(),
    EvaluationModel.countDocuments(filter).exec(),
  ]);

  await refreshEvaluationListIdentities(tenant, evaluations);

  await Promise.all(
    evaluations.map(async (evaluation) => {
      await refreshEvaluationAutomaticSnapshot(tenant, evaluation);
      await evaluation.save();
    }),
  );

  return {
    items: evaluations.map(serializeEvaluation),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getEvaluationStats(
  tenant: TenantDocument,
  actor: EvaluationActor,
): Promise<{
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
}> {
  const baseFilter: MongoFilter = { tenantId: tenant._id, ...getEvaluationScopeFilter(actor) };

  const currentYear = new Date().getUTCFullYear();
  const leaveYearStart = `${currentYear}-01-01`;
  const leaveYearEnd = `${currentYear}-12-31`;
  const leaveScope = getEvaluationScopeFilter(actor);

  const [rows, totals, leaveTotals] = await Promise.all([
    EvaluationModel.aggregate<{ _id: string; count: number }>([
      { $match: baseFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).exec(),
    EvaluationModel.aggregate<{
      _id: null;
      total: number;
      averageScore: number;
      excellent: number;
      needsImprovement: number;
    }>([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          averageScore: { $avg: "$finalScore" },
          excellent: { $sum: { $cond: [{ $eq: ["$grade", "EXCELLENT"] }, 1, 0] } },
          needsImprovement: { $sum: { $cond: [{ $in: ["$grade", ["NEEDS_IMPROVEMENT", "INSUFFICIENT"]] }, 1, 0] } },
        },
      },
    ]).exec(),
    (LeaveRequestModel as any).aggregate([
      {
        $match: {
          tenantId: tenant._id,
          ...leaveScope,
          startDate: { $lte: leaveYearEnd },
          endDate: { $gte: leaveYearStart },
        },
      },
      {
        $group: {
          _id: null,
          leaveRequestsTotal: { $sum: 1 },
          approvedLeaveDays: {
            $sum: {
              $cond: [
                { $eq: ["$status", "APPROVED"] },
                { $ifNull: ["$requestedDays", 0] },
                0,
              ],
            },
          },
          pendingLeaveDays: {
            $sum: {
              $cond: [
                { $in: ["$status", ["SUBMITTED", "MANAGER_APPROVED"]] },
                { $ifNull: ["$requestedDays", 0] },
                0,
              ],
            },
          },
        },
      },
    ]).exec(),
  ]);

  const result = {
    total: totals[0]?.total ?? 0,
    draft: 0,
    selfReviewed: 0,
    managerReviewed: 0,
    hrValidated: 0,
    averageScore: Math.round(totals[0]?.averageScore ?? 0),
    excellent: totals[0]?.excellent ?? 0,
    needsImprovement: totals[0]?.needsImprovement ?? 0,
    leaveRequestsTotal: safeInteger(leaveTotals[0]?.leaveRequestsTotal),
    approvedLeaveDays: roundLeaveDays(leaveTotals[0]?.approvedLeaveDays ?? 0),
    pendingLeaveDays: roundLeaveDays(leaveTotals[0]?.pendingLeaveDays ?? 0),
  };

  rows.forEach((row) => {
    if (row._id === "DRAFT") result.draft = row.count;
    if (row._id === "SELF_REVIEWED") result.selfReviewed = row.count;
    if (row._id === "MANAGER_REVIEWED") result.managerReviewed = row.count;
    if (row._id === "HR_VALIDATED") result.hrValidated = row.count;
  });

  return result;
}

export async function updateEvaluation(
  tenant: TenantDocument,
  actor: EvaluationActor,
  evaluationId: string,
  input: UpdateEvaluationInput,
): Promise<PublicEvaluation> {
  assertCanCreateEvaluation(actor);
  const evaluation = await getEvaluationOrThrow(tenant, evaluationId);
  assertCanReadEvaluation(evaluation, actor);

  const shouldRecomputePerformance =
    input.periodStartDate !== undefined || input.periodEndDate !== undefined;

  if (input.title !== undefined) evaluation.title = input.title;
  if (input.periodStartDate !== undefined) {
    evaluation.periodStartDate = parseDate(input.periodStartDate);
  }
  if (input.periodEndDate !== undefined) {
    evaluation.periodEndDate = parseDate(input.periodEndDate);
  }
  if (input.evidenceLinks !== undefined) {
    evaluation.evidenceLinks = input.evidenceLinks.map(serializeLink);
  }
  if (input.confidentialNote !== undefined) {
    evaluation.confidentialNote = cleanOptionalText(input.confidentialNote);
  }
  if (input.status !== undefined) evaluation.status = input.status;
  if (input.criteria !== undefined) {
    evaluation.criteria = mergeCriteria(evaluation.criteria, input.criteria);
  }

  await refreshEvaluationAgentIdentity(tenant, evaluation);

  if (shouldRecomputePerformance) {
    evaluation.performanceSnapshot = await buildPerformanceSnapshot({
      tenant,
      agentId: evaluation.agentId,
      periodStartDate: evaluation.periodStartDate,
      periodEndDate: evaluation.periodEndDate,
      evaluationYear: evaluation.evaluationYear,
    });

    evaluation.criteria = refreshSystemSuggestedCriteria(
      evaluation.criteria,
      evaluation.performanceSnapshot,
    );
  }

  evaluation.lastUpdatedByUserId = actor.userId;
  refreshEvaluationComputedFields(evaluation);
  await evaluation.save();

  return serializeEvaluation(evaluation);
}

export async function submitSelfReview(
  tenant: TenantDocument,
  actor: EvaluationActor,
  evaluationId: string,
  input: ReviewBlockInput,
): Promise<PublicEvaluation> {
  const evaluation = await getEvaluationOrThrow(tenant, evaluationId);
  assertCanSelfReviewEvaluation(evaluation, actor);

  evaluation.selfReview = buildReviewBlock(input, actor);
  evaluation.criteria = mergeCriteria(evaluation.criteria, input.criteria);
  if (evaluation.status === "DRAFT") evaluation.status = "SELF_REVIEWED";
  evaluation.lastUpdatedByUserId = actor.userId;

  refreshEvaluationComputedFields(evaluation);
  await evaluation.save();
  return serializeEvaluation(evaluation);
}

export async function submitManagerReview(
  tenant: TenantDocument,
  actor: EvaluationActor,
  evaluationId: string,
  input: ReviewBlockInput,
): Promise<PublicEvaluation> {
  const evaluation = await getEvaluationOrThrow(tenant, evaluationId);
  assertCanManagerReviewEvaluation(evaluation, actor);

  evaluation.managerReview = buildReviewBlock(input, actor);
  evaluation.criteria = mergeCriteria(evaluation.criteria, input.criteria);
  evaluation.status = "MANAGER_REVIEWED";
  evaluation.lastUpdatedByUserId = actor.userId;

  refreshEvaluationComputedFields(evaluation);
  await evaluation.save();
  return serializeEvaluation(evaluation);
}

export async function validateEvaluationHr(
  tenant: TenantDocument,
  actor: EvaluationActor,
  evaluationId: string,
  input: HrValidationInput,
): Promise<PublicEvaluation> {
  assertCanValidateEvaluation(actor);

  const evaluation = await getEvaluationOrThrow(tenant, evaluationId);
  assertCanReadEvaluation(evaluation, actor);

  evaluation.criteria = mergeCriteria(evaluation.criteria, input.criteria);
  evaluation.hrValidation = {
    finalDecision: input.finalDecision,
    finalComment: cleanOptionalText(input.finalComment),
    validatedByUserId: actor.userId,
    validatedByName: actor.fullName,
    validatedAt: new Date(),
  };
  evaluation.status = "HR_VALIDATED";
  evaluation.lastUpdatedByUserId = actor.userId;

  refreshEvaluationComputedFields(evaluation);
  await evaluation.save();
  return serializeEvaluation(evaluation);
}

export async function recomputeEvaluationIntelligence(
  tenant: TenantDocument,
  actor: EvaluationActor,
  evaluationId: string,
): Promise<PublicEvaluation> {
  assertCanCreateEvaluation(actor);

  const evaluation = await getEvaluationOrThrow(tenant, evaluationId);
  await refreshEvaluationAgentIdentity(tenant, evaluation);
  assertCanReadEvaluation(evaluation, actor);

  await refreshEvaluationAutomaticSnapshot(tenant, evaluation);

  evaluation.lastUpdatedByUserId = actor.userId;

  await evaluation.save();

  return serializeEvaluation(evaluation);
}

export async function deleteEvaluation(
  tenant: TenantDocument,
  actor: EvaluationActor,
  evaluationId: string,
): Promise<{ deletedEvaluationId: string }> {
  assertCanDeleteEvaluation(actor);
  const evaluation = await getEvaluationOrThrow(tenant, evaluationId);
  const deletedEvaluationId = evaluation.id;
  await EvaluationModel.deleteOne({ _id: evaluation._id, tenantId: tenant._id }).exec();
  return { deletedEvaluationId };
}

function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportEvaluationsCsv(
  tenant: TenantDocument,
  actor: EvaluationActor,
  query: ListEvaluationsQuery,
): Promise<string> {
  const result = await listEvaluations(tenant, actor, { ...query, page: 1, limit: 100 });
  const header = [
    "Référence",
    "Agent",
    "Matricule",
    "Poste",
    "Direction",
    "Service",
    "Année",
    "Période début",
    "Période fin",
    "Statut",
    "Score /100",
    "Niveau",
    "Décision RH",
    "Risque HRS",
    "Potentiel",
    "Tâches terminées",
    "Tâches confiées",
    "Tâches non terminées",
    "Feuille route réalisée %",
    "Feuille route restant",
    "Jours ouvrés",
    "Absences non couvertes",
    "Demandes de congé",
    "Jours de congé demandés",
    "Demandes en validation",
    "Jours en validation",
    "Demandes approuvées",
    "Jours de congé approuvés",
    "Demandes refusées",
    "Jours refusés",
    "Demandes annulées",
    "Jours annulés",
    "Solde annuel configuré",
    "Droits annuels",
    "Jours annuels consommés",
    "Jours annuels disponibles",
    "Retard cumulé minutes",
    "Heures supplémentaires minutes",
    "Priorité RH",
    "Brief Direction générale",
    "Synthèse",
  ];

  const rows = result.items.map((evaluation) => [
    evaluation.reference,
    evaluation.agentSnapshot.fullName,
    evaluation.agentSnapshot.matricule,
    evaluation.agentSnapshot.jobTitle,
    evaluation.agentSnapshot.directionName ?? "",
    evaluation.agentSnapshot.serviceName ?? "",
    evaluation.evaluationYear,
    evaluation.periodStartDate.slice(0, 10),
    evaluation.periodEndDate.slice(0, 10),
    evaluation.status,
    evaluation.finalScore,
    evaluation.grade,
    evaluation.hrValidation?.finalDecision ?? evaluation.intelligence.recommendedDecision,
    evaluation.intelligence.riskLevel,
    evaluation.intelligence.potentialLevel,
    evaluation.performanceSnapshot.tasksCompleted,
    evaluation.performanceSnapshot.tasksTotal,
    evaluation.performanceSnapshot.tasksNotCompleted,
    evaluation.performanceSnapshot.roadmapProgress ?? 0,
    evaluation.performanceSnapshot.roadmapRemainingItems,
    evaluation.performanceSnapshot.workingDaysExpected,
    evaluation.performanceSnapshot.absentDays,
    evaluation.performanceSnapshot.leaveRequestsTotal,
    evaluation.performanceSnapshot.leaveRequestedDays,
    evaluation.performanceSnapshot.leaveSubmittedRequests +
      evaluation.performanceSnapshot.leaveManagerApprovedRequests,
    evaluation.performanceSnapshot.leavePendingDays,
    evaluation.performanceSnapshot.leaveApprovedRequests,
    evaluation.performanceSnapshot.leaveApprovedDays,
    evaluation.performanceSnapshot.leaveRejectedRequests,
    evaluation.performanceSnapshot.leaveRejectedDays,
    evaluation.performanceSnapshot.leaveCancelledRequests,
    evaluation.performanceSnapshot.leaveCancelledDays,
    evaluation.performanceSnapshot.annualLeaveBalanceConfigured ? "Oui" : "Non",
    evaluation.performanceSnapshot.annualLeaveEntitledDays,
    evaluation.performanceSnapshot.annualLeaveConsumedDays,
    evaluation.performanceSnapshot.annualLeaveAvailableDays,
    evaluation.performanceSnapshot.lateMinutes,
    evaluation.performanceSnapshot.overtimeMinutes,
    evaluation.intelligence.developmentPriority,
    evaluation.intelligence.directorGeneralBrief,
    evaluation.executiveSummary,
  ]);

  return `\ufeff${[header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n")}`;
}
