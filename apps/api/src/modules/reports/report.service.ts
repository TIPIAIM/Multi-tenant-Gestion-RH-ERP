import mongoose, { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { AttendanceModel } from "../attendance/attendance.models.js";
import { EvaluationModel } from "../evaluations/evaluation.model.js";
import { LeaveRequestModel } from "../leaves/leave.model.js";
import { OrganizationUnitModel } from "../organisation/organization.model.js";
import { RoadmapModel } from "../roadmaps/roadmap.model.js";
import { TaskModel } from "../tasks/task.models.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import {
  assertCanArchiveReport,
  assertCanDeleteReport,
  assertCanEditReport,
  assertCanReadReport,
  assertCanRecomputeReport,
  assertCanUseReports,
  assertCanValidateReport,
  getReportPermissions,
  getStoredReportScopeFilter,
  normalizeRequestedReportScope,
  type ReportActor,
} from "./report.access.js";
import { ManagementReportModel } from "./report.model.js";
import type {
  ListManagementReportsQuery,
  ReportGenerationInput,
  UpdateManagementReportInput,
  ValidateManagementReportInput,
} from "./report.schema.js";
import type {
  AttendanceReportSnapshot,
  EvaluationReportSnapshot,
  LeaveReportSnapshot,
  ManagementReportComparison,
  ManagementReportDataConfidence,
  ManagementReportDocument,
  ManagementReportEditorial,
  ManagementReportGovernanceLevel,
  ManagementReportIntelligence,
  ManagementReportRiskLevel,
  ManagementReportScopeSnapshot,
  ManagementReportSnapshot,
  ManagementReportTrendPoint,
  ManagementReportType,
  PublicManagementReport,
  RoadmapReportSnapshot,
  TaskReportSnapshot,
  UnitReportBreakdownItem,
  WorkforceReportSnapshot,
} from "./report.types.js";

type MongoFilter = Record<string, any>;
type PlainRecord = Record<string, any>;

type ReportPeriod = {
  startDate: Date;
  endDate: Date;
  calculationEndDate: Date;
  label: string;
  futureCapped: boolean;
};

type ResolvedScope = {
  scopeType: "INSTITUTION" | "DIRECTION" | "SERVICE";
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
  snapshot: ManagementReportScopeSnapshot;
};

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function safeNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
function safeInteger(value: unknown, fallback = 0): number {
  return Math.round(safeNumber(value, fallback));
}
function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}
function percent(part: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((part / total) * 100))) : 0;
}
function clampIndex(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}
function cleanText(value?: string): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}
function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}
function isCompletedTask(status: unknown): boolean {
  return ["COMPLETED", "DONE", "FINISHED", "CLOSED", "VALIDATED", "APPROVED", "REALIZED", "REALISE", "REALISÉ"].includes(normalizeStatus(status));
}
function isBlockedTask(status: unknown): boolean {
  return ["BLOCKED", "SUSPENDED", "ON_HOLD", "CANCELLED", "CANCELED"].includes(normalizeStatus(status));
}
function objectIdString(value: unknown): string | null {
  if (!value) return null;
  const candidate = typeof value === "object" && value !== null && "_id" in value
    ? String((value as PlainRecord)._id)
    : String(value);
  return Types.ObjectId.isValid(candidate) ? candidate : null;
}
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}
function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function weekdaysBetween(startDate: Date, endDate: Date): number {
  let count = 0;
  let cursor = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor = addUtcDays(cursor, 1);
  }
  return count;
}
function parseLooseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value).length <= 10 ? `${String(value)}T00:00:00.000Z` : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function formatFrenchNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value);
}

function resolvePeriod(input: ReportGenerationInput): ReportPeriod {
  const year = input.reportYear;
  let startDate: Date;
  let endDate: Date;
  let label: string;

  if (input.reportType === "MONTHLY") {
    const month = input.reportMonth ?? 1;
    startDate = new Date(Date.UTC(year, month - 1, 1));
    endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    label = `${MONTHS_FR[month - 1]} ${year}`;
  } else if (input.reportType === "SEMIANNUAL") {
    const semester = input.reportSemester ?? 1;
    startDate = new Date(Date.UTC(year, semester === 1 ? 0 : 6, 1));
    endDate = new Date(Date.UTC(year, semester === 1 ? 6 : 12, 0, 23, 59, 59, 999));
    label = `${semester === 1 ? "1er" : "2e"} semestre ${year}`;
  } else {
    startDate = new Date(Date.UTC(year, 0, 1));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    label = `année ${year}`;
  }

  const todayEnd = endOfUtcDay(new Date());
  const futureCapped = endDate.getTime() > todayEnd.getTime();
  const calculationEndDate = futureCapped ? todayEnd : endDate;
  return { startDate, endDate, calculationEndDate, label, futureCapped };
}

function reportTypeLabel(type: ManagementReportType): string {
  if (type === "MONTHLY") return "mensuel";
  if (type === "SEMIANNUAL") return "semestriel";
  return "annuel";
}

async function resolveScope(tenant: TenantDocument, actor: ReportActor, input: ReportGenerationInput): Promise<ResolvedScope> {
  const normalized = normalizeRequestedReportScope(actor, input);
  if (normalized.scopeType === "INSTITUTION") {
    return { scopeType: "INSTITUTION", snapshot: { scopeType: "INSTITUTION" } };
  }

  const ids = [normalized.directionId, normalized.serviceId].filter(Boolean);
  const units = (await (OrganizationUnitModel as any)
    .find({ tenantId: tenant._id, _id: { $in: ids } })
    .select("_id name type parentId status")
    .lean()
    .exec()) as PlainRecord[];
  const map = new Map(units.map((unit) => [String(unit._id), unit]));
  const direction = normalized.directionId ? map.get(String(normalized.directionId)) : undefined;
  const service = normalized.serviceId ? map.get(String(normalized.serviceId)) : undefined;

  if (!direction || direction.type !== "DIRECTION") {
    throw new AppError("La Direction sélectionnée est introuvable ou invalide.", 400, "REPORT_DIRECTION_INVALID");
  }
  if (normalized.scopeType === "SERVICE") {
    if (!service || service.type !== "SERVICE") throw new AppError("Le Service sélectionné est introuvable ou invalide.", 400, "REPORT_SERVICE_INVALID");
    if (String(service.parentId ?? "") !== String(direction._id)) throw new AppError("Le Service sélectionné n'appartient pas à cette Direction.", 400, "REPORT_SERVICE_DIRECTION_MISMATCH");
  }

  return {
    scopeType: normalized.scopeType,
    directionId: direction._id,
    serviceId: normalized.scopeType === "SERVICE" ? service?._id ?? null : null,
    snapshot: {
      scopeType: normalized.scopeType,
      directionName: cleanText(direction.name),
      serviceName: normalized.scopeType === "SERVICE" ? cleanText(service?.name) : undefined,
    },
  };
}

function scopeFilter(scope: ResolvedScope): MongoFilter {
  return {
    ...(scope.directionId ? { directionId: scope.directionId } : {}),
    ...(scope.serviceId ? { serviceId: scope.serviceId } : {}),
  };
}

function taskPeriodFilter(startDate: Date, endDate: Date): MongoFilter {
  return {
    $or: [
      { createdAt: { $gte: startDate, $lte: endDate } },
      { startDate: { $gte: startDate, $lte: endDate } },
      { dueDate: { $gte: startDate, $lte: endDate } },
      { completedAt: { $gte: startDate, $lte: endDate } },
      { startDate: { $lte: endDate }, dueDate: { $gte: startDate } },
      { createdAt: { $lte: endDate }, status: { $nin: ["COMPLETED", "DONE", "CLOSED"] } },
    ],
  };
}

function leaveDaysInsidePeriod(leave: PlainRecord, startDate: Date, endDate: Date): number {
  const leaveStart = parseLooseDate(leave.startDate);
  const leaveEnd = parseLooseDate(leave.endDate);
  if (!leaveStart || !leaveEnd) return 0;
  const overlapStart = new Date(Math.max(startOfUtcDay(leaveStart).getTime(), startOfUtcDay(startDate).getTime()));
  const overlapEnd = new Date(Math.min(startOfUtcDay(leaveEnd).getTime(), startOfUtcDay(endDate).getTime()));
  if (overlapStart.getTime() > overlapEnd.getTime()) return 0;
  const totalWeekdays = Math.max(1, weekdaysBetween(leaveStart, leaveEnd));
  const overlapWeekdays = weekdaysBetween(overlapStart, overlapEnd);
  const requestedDays = Math.max(0, safeNumber(leave.requestedDays, totalWeekdays));
  return round(overlapWeekdays * Math.min(1, requestedDays / totalWeekdays), 2);
}

async function loadDocumentRows(
  tenantId: Types.ObjectId,
  agentIds: Types.ObjectId[],
  restrictToAgentIds: boolean,
): Promise<{ available: boolean; rows: PlainRecord[] }> {
  try {
    const db = mongoose.connection.db;
    if (!db) return { available: false, rows: [] };
    const names = await db.listCollections({}, { nameOnly: true }).toArray();
    const candidate = ["agentdocumentfiles", "agentdocuments"].find((name) =>
      names.some((item) => item.name === name),
    );
    if (!candidate) return { available: false, rows: [] };

    // Un périmètre Direction/Service sans Agent ne doit jamais récupérer
    // les documents de l'ensemble du tenant.
    if (restrictToAgentIds && agentIds.length === 0) {
      return { available: true, rows: [] };
    }

    const filter: MongoFilter = {
      tenantId,
      ...(restrictToAgentIds || agentIds.length
        ? { agentId: { $in: agentIds } }
        : {}),
    };
    const rows = await db
      .collection(candidate)
      .find(filter)
      .project({ status: 1, expiresAt: 1, createdAt: 1 })
      .toArray();
    return { available: true, rows };
  } catch {
    return { available: false, rows: [] };
  }
}

function agentIsActiveDuringPeriod(agent: PlainRecord, period: ReportPeriod): boolean {
  const employmentStart = parseLooseDate(agent.employmentStartDate)?.getTime() ?? 0;
  const employmentEnd =
    parseLooseDate(agent.employmentEndDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  return (
    normalizeStatus(agent.employmentStatus) === "ACTIVE" &&
    employmentStart <= period.calculationEndDate.getTime() &&
    employmentEnd >= period.startDate.getTime()
  );
}

function buildWorkforceSnapshot(input: {
  agents: PlainRecord[];
  users: PlainRecord[];
  units: PlainRecord[];
  documents: PlainRecord[];
  period: ReportPeriod;
}): WorkforceReportSnapshot {
  const calculationEnd = input.period.calculationEndDate.getTime();
  const start = input.period.startDate.getTime();
  const activeAgents = input.agents.filter((agent) =>
    agentIsActiveDuringPeriod(agent, input.period),
  );
  const permanentContracts = activeAgents.filter((agent) => ["PERMANENT", "CDI", "INDEFINITE_TERM"].includes(normalizeStatus(agent.contractType))).length;
  const fixedTermContracts = activeAgents.filter((agent) => ["FIXED_TERM", "CDD", "TEMPORARY"].includes(normalizeStatus(agent.contractType))).length;
  const newHires = input.agents.filter((agent) => {
    const value = parseLooseDate(agent.employmentStartDate)?.getTime();
    return value !== undefined && value >= start && value <= calculationEnd;
  }).length;
  const departures = input.agents.filter((agent) => {
    const value = parseLooseDate(agent.employmentEndDate)?.getTime();
    return value !== undefined && value >= start && value <= calculationEnd;
  }).length;
  const soon = addUtcDays(startOfUtcDay(input.period.calculationEndDate), 60).getTime();
  const documentsActive = input.documents.filter((doc) => normalizeStatus(doc.status) === "ACTIVE").length;
  const documentsArchived = input.documents.filter((doc) => normalizeStatus(doc.status) === "ARCHIVED").length;
  const documentsExpired = input.documents.filter((doc) => {
    const expiry = parseLooseDate(doc.expiresAt)?.getTime();
    return normalizeStatus(doc.status) === "ACTIVE" && expiry !== undefined && expiry < calculationEnd;
  }).length;
  const documentsExpiringSoon = input.documents.filter((doc) => {
    const expiry = parseLooseDate(doc.expiresAt)?.getTime();
    return normalizeStatus(doc.status) === "ACTIVE" && expiry !== undefined && expiry >= calculationEnd && expiry <= soon;
  }).length;

  return {
    agentsTotal: input.agents.length,
    agentsActive: activeAgents.length,
    agentsInactive: Math.max(0, input.agents.length - activeAgents.length),
    permanentContracts,
    fixedTermContracts,
    otherContracts: Math.max(0, activeAgents.length - permanentContracts - fixedTermContracts),
    newHires,
    departures,
    usersTotal: input.users.length,
    usersActive: input.users.filter((user) => Boolean(user.isActive)).length,
    usersInactive: input.users.filter((user) => !user.isActive).length,
    verifiedUsers: input.users.filter((user) => Boolean(user.emailVerifiedAt)).length,
    directionsTotal: input.units.filter((unit) => unit.type === "DIRECTION" && normalizeStatus(unit.status) !== "INACTIVE").length,
    servicesTotal: input.units.filter((unit) => unit.type === "SERVICE" && normalizeStatus(unit.status) !== "INACTIVE").length,
    documentsActive,
    documentsArchived,
    documentsExpiringSoon,
    documentsExpired,
  };
}

function buildTaskSnapshot(tasks: PlainRecord[], calculationEndDate: Date): TaskReportSnapshot {
  const completed = tasks.filter((task) => isCompletedTask(task.status)).length;
  const overdue = tasks.filter((task) => {
    const dueDate = parseLooseDate(task.dueDate);
    return dueDate && dueDate.getTime() < calculationEndDate.getTime() && !isCompletedTask(task.status);
  }).length;
  const totalProgress = tasks.reduce((sum, task) => sum + safeNumber(task.progressPercentage ?? task.progress ?? task.completionRate), 0);
  return {
    total: tasks.length,
    completed,
    inProgress: tasks.filter((task) => ["IN_PROGRESS", "ONGOING", "ACTIVE"].includes(normalizeStatus(task.status))).length,
    todo: tasks.filter((task) => ["TODO", "PENDING", "NOT_STARTED"].includes(normalizeStatus(task.status))).length,
    blocked: tasks.filter((task) => isBlockedTask(task.status)).length,
    overdue,
    completionRate: percent(completed, tasks.length),
    averageProgress: tasks.length ? clampIndex(totalProgress / tasks.length) : 0,
    highPriority: tasks.filter((task) => normalizeStatus(task.priority) === "HIGH").length,
    criticalPriority: tasks.filter((task) => ["CRITICAL", "URGENT"].includes(normalizeStatus(task.priority))).length,
  };
}

function attendanceStatusIsPresent(status: unknown): boolean {
  return ["PRESENT", "LATE", "REMOTE", "BUSINESS_TRIP", "EXCUSED"].includes(normalizeStatus(status));
}

function buildAttendanceSnapshot(input: {
  attendance: PlainRecord[];
  activeAgents: number;
  weekdays: number;
  approvedLeaveDays: number;
}): AttendanceReportSnapshot {
  const expected = input.activeAgents * input.weekdays;
  const expectedAfterLeave = Math.max(0, round(expected - input.approvedLeaveDays, 2));
  const presentDays = input.attendance.filter((row) => attendanceStatusIsPresent(row.status)).length;
  const absentDays = input.attendance.filter((row) => normalizeStatus(row.status) === "ABSENT").length;
  const lateDays = input.attendance.filter((row) => normalizeStatus(row.status) === "LATE" || safeNumber(row.lateMinutes) > 0).length;
  const markedDays = input.attendance.length;
  return {
    weekdays: input.weekdays,
    expectedAgentWorkdays: expected,
    expectedAfterApprovedLeave: expectedAfterLeave,
    markedDays,
    presentDays,
    absentDays,
    lateDays,
    unrecordedDays: Math.max(0, round(expectedAfterLeave - markedDays, 2)),
    coverageRate: percent(markedDays, expectedAfterLeave),
    presenceRate: percent(presentDays, expectedAfterLeave),
    punctualityRate: presentDays ? clampIndex(100 - (lateDays / presentDays) * 100) : 0,
    lateMinutes: input.attendance.reduce((sum, row) => sum + safeNumber(row.lateMinutes), 0),
    workedMinutes: input.attendance.reduce((sum, row) => sum + safeNumber(row.workedMinutes), 0),
    overtimeMinutes: input.attendance.reduce((sum, row) => sum + safeNumber(row.overtimeMinutes), 0),
    earlyDepartureMinutes: input.attendance.reduce((sum, row) => sum + safeNumber(row.earlyDepartureMinutes), 0),
  };
}

function buildLeaveSnapshot(leaves: PlainRecord[], period: ReportPeriod): LeaveReportSnapshot {
  const map = new Map<string, { leaveType: string; requests: number; approvedRequests: number; requestedDays: number; approvedDays: number }>();
  const result: LeaveReportSnapshot = {
    requestsTotal: leaves.length,
    draftRequests: 0,
    submittedRequests: 0,
    managerApprovedRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    cancelledRequests: 0,
    requestedDays: 0,
    pendingDays: 0,
    approvedDays: 0,
    rejectedDays: 0,
    cancelledDays: 0,
    approvalRate: 0,
    byType: [],
  };

  for (const leave of leaves) {
    const status = normalizeStatus(leave.status);
    const type = normalizeStatus(leave.leaveType) || "OTHER";
    const days = leaveDaysInsidePeriod(leave, period.startDate, period.calculationEndDate);
    const item = map.get(type) ?? { leaveType: type, requests: 0, approvedRequests: 0, requestedDays: 0, approvedDays: 0 };
    item.requests += 1;
    if (status !== "CANCELLED") item.requestedDays += days;
    result.requestedDays += status === "CANCELLED" ? 0 : days;
    if (status === "DRAFT") result.draftRequests += 1;
    if (status === "SUBMITTED") result.submittedRequests += 1;
    if (status === "MANAGER_APPROVED") result.managerApprovedRequests += 1;
    if (["SUBMITTED", "MANAGER_APPROVED"].includes(status)) result.pendingDays += days;
    if (status === "APPROVED") {
      result.approvedRequests += 1;
      result.approvedDays += days;
      item.approvedRequests += 1;
      item.approvedDays += days;
    }
    if (status === "REJECTED") { result.rejectedRequests += 1; result.rejectedDays += days; }
    if (status === "CANCELLED") { result.cancelledRequests += 1; result.cancelledDays += days; }
    map.set(type, item);
  }
  result.approvalRate = percent(result.approvedRequests, result.approvedRequests + result.rejectedRequests);
  result.requestedDays = round(result.requestedDays, 2);
  result.pendingDays = round(result.pendingDays, 2);
  result.approvedDays = round(result.approvedDays, 2);
  result.rejectedDays = round(result.rejectedDays, 2);
  result.cancelledDays = round(result.cancelledDays, 2);
  result.byType = [...map.values()].map((item) => ({ ...item, requestedDays: round(item.requestedDays, 2), approvedDays: round(item.approvedDays, 2) })).sort((a, b) => b.approvedDays - a.approvedDays);
  return result;
}

function buildRoadmapSnapshot(roadmaps: PlainRecord[]): RoadmapReportSnapshot {
  const itemCount = roadmaps.reduce((sum, roadmap) => sum + safeNumber(roadmap.itemCount, Array.isArray(roadmap.items) ? roadmap.items.length : 0), 0);
  const completedItemCount = roadmaps.reduce((sum, roadmap) => sum + safeNumber(roadmap.completedItemCount, Array.isArray(roadmap.items) ? roadmap.items.filter((item: PlainRecord) => normalizeStatus(item.status) === "DONE").length : 0), 0);
  const progressTotal = roadmaps.reduce((sum, roadmap) => sum + safeNumber(roadmap.progressPercentage, 0), 0);
  return {
    total: roadmaps.length,
    draft: roadmaps.filter((item) => normalizeStatus(item.status) === "DRAFT").length,
    submitted: roadmaps.filter((item) => normalizeStatus(item.status) === "SUBMITTED").length,
    approved: roadmaps.filter((item) => ["APPROVED", "PARTIALLY_APPROVED"].includes(normalizeStatus(item.status))).length,
    returned: roadmaps.filter((item) => normalizeStatus(item.status) === "RETURNED").length,
    closed: roadmaps.filter((item) => normalizeStatus(item.status) === "CLOSED").length,
    itemCount,
    completedItemCount,
    remainingItemCount: Math.max(0, itemCount - completedItemCount),
    averageProgress: roadmaps.length ? clampIndex(progressTotal / roadmaps.length) : 0,
    completionRate: percent(completedItemCount, itemCount),
  };
}

function buildEvaluationSnapshot(evaluations: PlainRecord[]): EvaluationReportSnapshot {
  const averageScore = evaluations.length ? round(evaluations.reduce((sum, item) => sum + safeNumber(item.finalScore), 0) / evaluations.length, 1) : 0;
  return {
    total: evaluations.length,
    draft: evaluations.filter((item) => normalizeStatus(item.status) === "DRAFT").length,
    selfReviewed: evaluations.filter((item) => normalizeStatus(item.status) === "SELF_REVIEWED").length,
    managerReviewed: evaluations.filter((item) => normalizeStatus(item.status) === "MANAGER_REVIEWED").length,
    hrValidated: evaluations.filter((item) => normalizeStatus(item.status) === "HR_VALIDATED").length,
    averageScore,
    excellent: evaluations.filter((item) => normalizeStatus(item.grade) === "EXCELLENT").length,
    veryGood: evaluations.filter((item) => normalizeStatus(item.grade) === "VERY_GOOD").length,
    satisfactory: evaluations.filter((item) => normalizeStatus(item.grade) === "SATISFACTORY").length,
    needsImprovement: evaluations.filter((item) => normalizeStatus(item.grade) === "NEEDS_IMPROVEMENT").length,
    insufficient: evaluations.filter((item) => normalizeStatus(item.grade) === "INSUFFICIENT").length,
    highRisk: evaluations.filter((item) => normalizeStatus(item.intelligence?.riskLevel) === "HIGH").length,
    criticalRisk: evaluations.filter((item) => normalizeStatus(item.intelligence?.riskLevel) === "CRITICAL").length,
    promotionRecommended: evaluations.filter((item) => normalizeStatus(item.intelligence?.recommendedDecision) === "PROMOTION_RECOMMENDED").length,
    trainingPlans: evaluations.filter((item) => normalizeStatus(item.intelligence?.recommendedDecision) === "TRAINING_PLAN").length,
    improvementPlans: evaluations.filter((item) => normalizeStatus(item.intelligence?.recommendedDecision) === "PERFORMANCE_IMPROVEMENT_PLAN").length,
  };
}

function buildMonthlyTrend(input: {
  period: ReportPeriod;
  agents: PlainRecord[];
  tasks: PlainRecord[];
  attendance: PlainRecord[];
  leaves: PlainRecord[];
}): ManagementReportTrendPoint[] {
  const points: ManagementReportTrendPoint[] = [];
  let cursor = new Date(
    Date.UTC(
      input.period.startDate.getUTCFullYear(),
      input.period.startDate.getUTCMonth(),
      1,
    ),
  );

  while (cursor.getTime() <= input.period.calculationEndDate.getTime()) {
    const monthStart = new Date(
      Math.max(cursor.getTime(), input.period.startDate.getTime()),
    );
    const monthEndCandidate = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const monthEnd = new Date(
      Math.min(monthEndCandidate.getTime(), input.period.calculationEndDate.getTime()),
    );
    const startKey = dateKey(monthStart);
    const endKey = dateKey(monthEnd);
    const monthPeriod: ReportPeriod = {
      startDate: monthStart,
      endDate: monthEnd,
      calculationEndDate: monthEnd,
      label: `${MONTHS_FR[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      futureCapped: false,
    };
    const activeAgents = input.agents.filter((agent) =>
      agentIsActiveDuringPeriod(agent, monthPeriod),
    ).length;
    const monthLeaves = input.leaves.filter((leave) => {
      const start = parseLooseDate(leave.startDate);
      const end = parseLooseDate(leave.endDate);
      return Boolean(
        start &&
          end &&
          start.getTime() <= monthEnd.getTime() &&
          end.getTime() >= monthStart.getTime(),
      );
    });
    const leaveSnapshot = buildLeaveSnapshot(monthLeaves, monthPeriod);
    const monthAttendance = input.attendance.filter((row) => {
      const key = String(row.attendanceDate ?? "");
      return key >= startKey && key <= endKey;
    });
    const attendanceSnapshot = buildAttendanceSnapshot({
      attendance: monthAttendance,
      activeAgents,
      weekdays: weekdaysBetween(monthStart, monthEnd),
      approvedLeaveDays: leaveSnapshot.approvedDays,
    });
    const tasksCreated = input.tasks.filter((task) => {
      const createdAt = parseLooseDate(task.createdAt);
      return Boolean(
        createdAt &&
          createdAt.getTime() >= monthStart.getTime() &&
          createdAt.getTime() <= monthEnd.getTime(),
      );
    }).length;
    const tasksCompleted = input.tasks.filter((task) => {
      const completedAt = parseLooseDate(
        task.completedAt ?? (isCompletedTask(task.status) ? task.updatedAt : undefined),
      );
      return Boolean(
        completedAt &&
          completedAt.getTime() >= monthStart.getTime() &&
          completedAt.getTime() <= monthEnd.getTime(),
      );
    }).length;

    points.push({
      periodKey: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
      label: monthPeriod.label,
      tasksCreated,
      tasksCompleted,
      attendancePresenceRate: attendanceSnapshot.presenceRate,
      attendanceCoverageRate: attendanceSnapshot.coverageRate,
      approvedLeaveDays: leaveSnapshot.approvedDays,
      lateMinutes: attendanceSnapshot.lateMinutes,
    });

    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }

  return points;
}

async function findPreviousReportComparison(input: {
  tenantId: Types.ObjectId;
  scope: ResolvedScope;
  reportType: ManagementReportType;
  period: ReportPeriod;
  currentPerformanceIndex: number;
  tasks: TaskReportSnapshot;
  attendance: AttendanceReportSnapshot;
  roadmaps: RoadmapReportSnapshot;
  evaluations: EvaluationReportSnapshot;
}): Promise<ManagementReportComparison | undefined> {
  const previous = await ManagementReportModel.findOne({
    tenantId: input.tenantId,
    reportType: input.reportType,
    scopeType: input.scope.scopeType,
    directionId: input.scope.directionId ?? null,
    serviceId: input.scope.serviceId ?? null,
    periodEndDate: { $lt: input.period.startDate },
    status: { $in: ["VALIDATED", "ARCHIVED"] },
  })
    .sort({ periodEndDate: -1, createdAt: -1 })
    .select(
      "reference periodStartDate periodEndDate snapshot intelligence",
    )
    .lean()
    .exec() as (PlainRecord & { _id: Types.ObjectId }) | null;

  if (!previous) return undefined;

  return {
    previousReportId: previous._id.toString(),
    previousReference: String(previous.reference ?? ""),
    previousPeriodStartDate: new Date(previous.periodStartDate),
    previousPeriodEndDate: new Date(previous.periodEndDate),
    performanceIndexDelta: round(
      input.currentPerformanceIndex -
        safeNumber(previous.intelligence?.performanceIndex),
      1,
    ),
    taskCompletionRateDelta: round(
      input.tasks.completionRate -
        safeNumber(previous.snapshot?.tasks?.completionRate),
      1,
    ),
    attendancePresenceRateDelta: round(
      input.attendance.presenceRate -
        safeNumber(previous.snapshot?.attendance?.presenceRate),
      1,
    ),
    attendanceCoverageRateDelta: round(
      input.attendance.coverageRate -
        safeNumber(previous.snapshot?.attendance?.coverageRate),
      1,
    ),
    roadmapProgressDelta: round(
      input.roadmaps.averageProgress -
        safeNumber(previous.snapshot?.roadmaps?.averageProgress),
      1,
    ),
    evaluationScoreDelta: round(
      input.evaluations.averageScore -
        safeNumber(previous.snapshot?.evaluations?.averageScore),
      1,
    ),
  };
}

function groupId(record: PlainRecord, scope: ResolvedScope): string {
  if (scope.scopeType === "INSTITUTION") return objectIdString(record.directionId) ?? "UNASSIGNED_DIRECTION";
  if (scope.scopeType === "DIRECTION") return objectIdString(record.serviceId) ?? "UNASSIGNED_SERVICE";
  return objectIdString(record.serviceId) ?? objectIdString(scope.serviceId) ?? "CURRENT_SERVICE";
}

function buildUnitBreakdown(input: {
  scope: ResolvedScope;
  units: PlainRecord[];
  agents: PlainRecord[];
  tasks: PlainRecord[];
  attendance: PlainRecord[];
  leaves: PlainRecord[];
  roadmaps: PlainRecord[];
  evaluations: PlainRecord[];
  period: ReportPeriod;
}): UnitReportBreakdownItem[] {
  const unitMap = new Map(input.units.map((unit) => [String(unit._id), unit]));
  const ids = new Set<string>();
  for (const collection of [input.agents, input.tasks, input.attendance, input.leaves, input.roadmaps, input.evaluations]) {
    collection.forEach((record) => ids.add(groupId(record, input.scope)));
  }
  if (input.scope.scopeType === "SERVICE" && input.scope.serviceId) ids.add(String(input.scope.serviceId));
  
  const weekdays = weekdaysBetween(input.period.startDate, input.period.calculationEndDate);
  const unitType: UnitReportBreakdownItem["unitType"] =
  input.scope.scopeType === "INSTITUTION" ? "DIRECTION" : "SERVICE";

  return [...ids].map((id) => {
    const filter = (rows: PlainRecord[]) => rows.filter((row) => groupId(row, input.scope) === id);
    const agents = filter(input.agents);
    const activeAgents = agents.filter((agent) =>
      agentIsActiveDuringPeriod(agent, input.period),
    ).length;
    const tasks = filter(input.tasks);
    const attendance = filter(input.attendance);
    const leaves = filter(input.leaves);
    const roadmaps = filter(input.roadmaps);
    const evaluations = filter(input.evaluations);
    const taskSnapshot = buildTaskSnapshot(tasks, input.period.calculationEndDate);
    const leaveSnapshot = buildLeaveSnapshot(leaves, input.period);
    const attendanceSnapshot = buildAttendanceSnapshot({ attendance, activeAgents, weekdays, approvedLeaveDays: leaveSnapshot.approvedDays });
    const roadmapSnapshot = buildRoadmapSnapshot(roadmaps);
    const evaluationSnapshot = buildEvaluationSnapshot(evaluations);
    const unit = unitMap.get(id);
    const fallbackName = id.startsWith("UNASSIGNED") ? (input.scope.scopeType === "INSTITUTION" ? "Direction non renseignée" : "Sans service") : input.scope.snapshot.serviceName ?? input.scope.snapshot.directionName ?? "Périmètre courant";
    const alertsCount = [taskSnapshot.overdue > 0, attendanceSnapshot.unrecordedDays > 0, leaveSnapshot.pendingDays > 0, roadmapSnapshot.total > 0 && roadmapSnapshot.averageProgress < 60, evaluationSnapshot.highRisk + evaluationSnapshot.criticalRisk > 0].filter(Boolean).length;
    return {
      unitId: id,
      unitName: cleanText(unit?.name) ?? fallbackName,
      unitType,
            agentsActive: activeAgents,
      tasksTotal: taskSnapshot.total,
      tasksCompleted: taskSnapshot.completed,
      tasksOverdue: taskSnapshot.overdue,
      taskCompletionRate: taskSnapshot.completionRate,
      attendancePresenceRate: attendanceSnapshot.presenceRate,
      attendanceCoverageRate: attendanceSnapshot.coverageRate,
      absenceDays: attendanceSnapshot.absentDays,
      lateMinutes: attendanceSnapshot.lateMinutes,
      approvedLeaveDays: leaveSnapshot.approvedDays,
      pendingLeaveDays: leaveSnapshot.pendingDays,
      roadmapAverageProgress: roadmapSnapshot.averageProgress,
      evaluationAverageScore: evaluationSnapshot.averageScore,
      alertsCount,
    };
  }).sort((a, b) => b.alertsCount - a.alertsCount || a.unitName.localeCompare(b.unitName, "fr"));
}

function buildIntelligence(input: {
  scope: ResolvedScope;
  period: ReportPeriod;
  reportType: ManagementReportType;
  workforce: WorkforceReportSnapshot;
  tasks: TaskReportSnapshot;
  attendance: AttendanceReportSnapshot;
  leaves: LeaveReportSnapshot;
  roadmaps: RoadmapReportSnapshot;
  evaluations: EvaluationReportSnapshot;
  documentsAvailable: boolean;
  warnings: string[];
  comparison?: ManagementReportComparison;
}): ManagementReportIntelligence {
  const executionIndex = input.tasks.total ? input.tasks.completionRate : 0;
  const attendanceIndex = input.attendance.expectedAfterApprovedLeave
    ? clampIndex(input.attendance.presenceRate * 0.5 + input.attendance.coverageRate * 0.3 + input.attendance.punctualityRate * 0.2)
    : 0;
  const roadmapIndex = input.roadmaps.total ? input.roadmaps.averageProgress : 0;
  const evaluationIndex = input.evaluations.total ? clampIndex(input.evaluations.averageScore) : 0;

  const availableDimensions = [
    { available: input.tasks.total > 0, value: executionIndex, weight: 30 },
    { available: input.attendance.expectedAfterApprovedLeave > 0, value: attendanceIndex, weight: 25 },
    { available: input.roadmaps.total > 0, value: roadmapIndex, weight: 25 },
    { available: input.evaluations.total > 0, value: evaluationIndex, weight: 20 },
  ];
  const used = availableDimensions.filter((item) => item.available);
  const weightTotal = used.reduce((sum, item) => sum + item.weight, 0);
  const performanceIndex = weightTotal ? clampIndex(used.reduce((sum, item) => sum + item.value * item.weight, 0) / weightTotal) : 0;

  const moduleCoverage = [
    input.workforce.agentsTotal > 0,
    input.tasks.total > 0,
    input.attendance.expectedAfterApprovedLeave > 0,
    input.leaves.requestsTotal > 0,
    input.roadmaps.total > 0,
    input.evaluations.total > 0,
    input.documentsAvailable,
  ].filter(Boolean).length;
  const dataQualityIndex = clampIndex((moduleCoverage / 7) * 70 + Math.min(30, input.attendance.coverageRate * 0.3));
  const dataConfidence: ManagementReportDataConfidence = moduleCoverage >= 6 && input.attendance.coverageRate >= 75 ? "HIGH" : moduleCoverage >= 4 ? "MEDIUM" : "LOW";

  let riskLevel: ManagementReportRiskLevel = "LOW";
  if (performanceIndex < 50 || input.attendance.coverageRate < 40 || input.evaluations.criticalRisk > 0 || input.tasks.overdue >= Math.max(5, input.tasks.total * 0.3)) riskLevel = "CRITICAL";
  else if (performanceIndex < 65 || input.attendance.coverageRate < 65 || input.evaluations.highRisk > 0 || input.tasks.overdue >= 3) riskLevel = "HIGH";
  else if (performanceIndex < 78 || input.leaves.pendingDays > 0 || input.tasks.overdue > 0 || input.workforce.documentsExpired > 0) riskLevel = "MODERATE";

  let governanceLevel: ManagementReportGovernanceLevel = "MAITRISE";
  if (riskLevel === "CRITICAL") governanceLevel = "CRITIQUE";
  else if (riskLevel === "HIGH") governanceLevel = "A_RENFORCER";
  else if (riskLevel === "MODERATE") governanceLevel = "SOUS_CONTROLE";

  const scopeLabel = input.scope.scopeType === "INSTITUTION"
    ? "l’ensemble du FADES"
    : input.scope.scopeType === "DIRECTION"
      ? `la Direction ${input.scope.snapshot.directionName ?? "concernée"}`
      : `le Service ${input.scope.snapshot.serviceName ?? "concerné"}`;

  const keyAchievements: string[] = [];
  if (input.tasks.total > 0 && input.tasks.completionRate >= 80) keyAchievements.push(`Exécution opérationnelle soutenue : ${input.tasks.completed}/${input.tasks.total} tâche(s) clôturée(s), soit ${input.tasks.completionRate} %.`);
  if (input.roadmaps.total > 0 && input.roadmaps.averageProgress >= 75) keyAchievements.push(`Feuilles de route bien avancées : progression moyenne de ${input.roadmaps.averageProgress} %.`);
  if (input.attendance.coverageRate >= 85 && input.attendance.punctualityRate >= 85) keyAchievements.push(`Discipline de présence satisfaisante : couverture ${input.attendance.coverageRate} % et ponctualité ${input.attendance.punctualityRate} %.`);
  if (input.evaluations.total > 0 && input.evaluations.averageScore >= 80) keyAchievements.push(`Performance RH favorable : score moyen des évaluations de ${formatFrenchNumber(input.evaluations.averageScore)}/100.`);
  if (input.workforce.newHires > 0) keyAchievements.push(`${input.workforce.newHires} nouvelle(s) prise(s) de fonction enregistrée(s) sur la période.`);
  if (input.comparison?.performanceIndexDelta && input.comparison.performanceIndexDelta >= 5) {
    keyAchievements.push(
      `L’indice consolidé progresse de ${formatFrenchNumber(input.comparison.performanceIndexDelta)} point(s) par rapport au rapport ${input.comparison.previousReference}.`,
    );
  }
  if (!keyAchievements.length) keyAchievements.push("Les résultats disponibles permettent d’identifier une base de pilotage, mais aucun acquis majeur ne doit être affirmé sans consolidation complémentaire.");

  const alerts: string[] = [];
  if (input.tasks.overdue > 0) alerts.push(`${input.tasks.overdue} tâche(s) échue(s) ou non clôturée(s) nécessitent arbitrage ou replanification.`);
  if (input.attendance.unrecordedDays > 0) alerts.push(`${formatFrenchNumber(input.attendance.unrecordedDays)} journée(s)-agent ne disposent pas d’un pointage exploitable après neutralisation des congés approuvés.`);
  if (input.leaves.pendingDays > 0) alerts.push(`${formatFrenchNumber(input.leaves.pendingDays)} jour(s) de congé restent en attente de décision.`);
  if (input.roadmaps.total > 0 && input.roadmaps.averageProgress < 60) alerts.push(`La progression moyenne des feuilles de route est limitée à ${input.roadmaps.averageProgress} %.`);
  if (input.evaluations.highRisk + input.evaluations.criticalRisk > 0) alerts.push(`${input.evaluations.highRisk + input.evaluations.criticalRisk} évaluation(s) présentent un niveau de risque élevé ou critique.`);
  if (input.workforce.documentsExpired > 0) alerts.push(`${input.workforce.documentsExpired} document(s) RH actif(s) sont expirés.`);
  if (input.workforce.documentsExpiringSoon > 0) alerts.push(`${input.workforce.documentsExpiringSoon} document(s) RH arrivent à expiration dans les 60 jours.`);
  if (dataConfidence === "LOW") alerts.push("La couverture des données est insuffisante pour soutenir seule une décision structurante.");
  if (input.comparison?.performanceIndexDelta && input.comparison.performanceIndexDelta <= -5) {
    alerts.push(
      `L’indice consolidé recule de ${formatFrenchNumber(Math.abs(input.comparison.performanceIndexDelta))} point(s) par rapport au rapport ${input.comparison.previousReference}.`,
    );
  }
  if (!alerts.length) alerts.push("Aucune alerte critique n’est détectée ; les indicateurs doivent néanmoins être suivis à la période suivante.");

  const recommendations = [
    input.tasks.overdue > 0 ? "Tenir une revue des tâches échues, qualifier les blocages et fixer des échéances réalistes assorties de responsables." : "Maintenir une revue périodique des tâches prioritaires et de leur contribution aux objectifs.",
    input.attendance.coverageRate < 85 ? "Fiabiliser le pointage quotidien et traiter séparément les absences, les congés autorisés et les défauts de saisie." : "Maintenir la discipline de pointage et analyser les retards récurrents sans transformer les heures supplémentaires en bonus automatique.",
    input.roadmaps.total === 0 || input.roadmaps.averageProgress < 70 ? "Rattacher chaque Agent aux objectifs annuels et documenter les preuves de réalisation des feuilles de route." : "Consolider les preuves KPI et sécuriser les éléments restant à réaliser dans les feuilles de route.",
    input.evaluations.total === 0 ? "Planifier les évaluations professionnelles du périmètre et garantir l’entretien contradictoire." : "Mettre en œuvre les décisions issues des évaluations : formation, accompagnement, mobilité ou valorisation des potentiels.",
    "Présenter à la Direction un tableau limité de décisions attendues, avec responsable, échéance et indicateur de clôture.",
  ];

  const decisionsRequired: string[] = [];
  if (input.tasks.overdue >= 3) decisionsRequired.push("Arbitrer les priorités et les moyens relatifs aux tâches en retard.");
  if (input.attendance.coverageRate < 70) decisionsRequired.push("Décider d’un plan de fiabilisation du pointage et de régularisation des données manquantes.");
  if (input.leaves.pendingDays > 0) decisionsRequired.push("Faire statuer les demandes de congé encore en attente.");
  if (input.workforce.documentsExpired > 0) decisionsRequired.push("Autoriser la campagne de mise à jour des documents RH expirés.");
  if (input.evaluations.improvementPlans > 0) decisionsRequired.push("Valider les plans d’amélioration de la performance et leurs modalités de suivi.");
  if (!decisionsRequired.length) decisionsRequired.push("Prendre acte des résultats et valider les priorités proposées pour la période suivante.");

  const nextPeriodPriorities = [
    "Clôturer ou replanifier les tâches échues et matérialiser les livrables.",
    "Mettre à jour les feuilles de route et les preuves KPI avant la prochaine clôture.",
    "Régulariser les données de présence, congés et documents administratifs en attente.",
    "Suivre les décisions d’évaluation et mesurer leur effet sur la performance.",
  ];

  const executiveSummary = [
    `Le présent rapport ${reportTypeLabel(input.reportType)} porte sur ${scopeLabel}. L’indice consolidé de pilotage est de ${performanceIndex}/100, avec un niveau de gouvernance ${governanceLevel} .`,//et un risque ${riskLevel}
    `L’activité comprend ${input.tasks.total} tâche(s), dont ${input.tasks.completed} clôturée(s) (${input.tasks.completionRate} %), ainsi que ${input.roadmaps.total} feuille(s) de route présentant une progression moyenne de ${input.roadmaps.averageProgress} %.`,
    `La présence couvre ${input.attendance.coverageRate} % des journées-agent attendues après déduction de ${formatFrenchNumber(input.leaves.approvedDays)} jour(s) de congé approuvé(s). Les évaluations disponibles affichent une moyenne de ${formatFrenchNumber(input.evaluations.averageScore)}/100.`,
    input.comparison
      ? `Par rapport au rapport ${input.comparison.previousReference}, l’indice global évolue de ${formatFrenchNumber(input.comparison.performanceIndexDelta)} point(s), le taux de clôture des tâches de ${formatFrenchNumber(input.comparison.taskCompletionRateDelta)} point(s) et la présence de ${formatFrenchNumber(input.comparison.attendancePresenceRateDelta)} point(s).`
      : "Aucun rapport antérieur validé ou archivé de même nature n’est disponible pour une comparaison historique fiable.",
    `La confiance des données est ${dataConfidence}. Les principales décisions portent sur les retards, la qualité du pointage, les demandes en attente et la mise en œuvre des actions RH.`
  ].join("\n\n");

  const directorGeneralNote = [
    "1. SITUATION GÉNÉRALE",
    `Sur la période considérée, ${scopeLabel} présente un indice de performance consolidé de ${performanceIndex}/100. La gouvernance est classée ${governanceLevel}, avec un niveau de confiance des données ${dataConfidence}.`,//avec un niveau de risque ${riskLevel} et une confiance des données ${dataConfidence}.`
    "2. EXÉCUTION ET PRIORITÉS",
    `${input.tasks.completed}/${input.tasks.total} tâche(s) sont clôturées ; ${input.tasks.overdue} restent échues. Les feuilles de route atteignent ${input.roadmaps.averageProgress} % en moyenne, avec ${input.roadmaps.remainingItemCount} élément(s) restant(s).`,
    "3. DISCIPLINE ADMINISTRATIVE ET RH",
    `Le périmètre compte ${input.workforce.agentsActive} Agent(s) actif(s). La couverture du pointage est de ${input.attendance.coverageRate} %, la présence de ${input.attendance.presenceRate} % et la ponctualité de ${input.attendance.punctualityRate} %. ${formatFrenchNumber(input.leaves.approvedDays)} jour(s) de congé approuvé(s) ont été neutralisés.`,
    "4. PERFORMANCE ET DÉVELOPPEMENT",
    `${input.evaluations.total} évaluation(s) sont disponibles, avec un score moyen de ${formatFrenchNumber(input.evaluations.averageScore)}/100. ${input.evaluations.promotionRecommended} recommandation(s) de promotion, ${input.evaluations.trainingPlans} plan(s) de formation et ${input.evaluations.improvementPlans} plan(s) d’amélioration sont recensés.`,
    "5. ÉVOLUTION PAR RAPPORT À LA PÉRIODE DE RÉFÉRENCE",
    input.comparison
      ? `Comparaison avec ${input.comparison.previousReference} : indice global ${formatFrenchNumber(input.comparison.performanceIndexDelta)} point(s), clôture des tâches ${formatFrenchNumber(input.comparison.taskCompletionRateDelta)} point(s), présence ${formatFrenchNumber(input.comparison.attendancePresenceRateDelta)} point(s), couverture du pointage ${formatFrenchNumber(input.comparison.attendanceCoverageRateDelta)} point(s), feuille de route ${formatFrenchNumber(input.comparison.roadmapProgressDelta)} point(s) et évaluations ${formatFrenchNumber(input.comparison.evaluationScoreDelta)} point(s).`
      : "Aucune référence antérieure validée ou archivée n’est disponible pour établir une variation fiable.",
    "6. ARBITRAGES PROPOSÉS",
    decisionsRequired.map((item, index) => `${index + 1}. ${item}`).join(" "),
  ].join("\n\n");

  return {
    performanceIndex,
    executionIndex,
    attendanceIndex,
    roadmapIndex,
    evaluationIndex,
    dataQualityIndex,
    riskLevel,
    governanceLevel,
    dataConfidence,
    executiveSummary,
    directorGeneralNote,
    keyAchievements,
    alerts,
    recommendations,
    nextPeriodPriorities,
    decisionsRequired,
    generatedAt: new Date(),
  };
}

async function computeReport(input: {
  tenant: TenantDocument;
  actor: ReportActor;
  generation: ReportGenerationInput;
}): Promise<{
  period: ReportPeriod;
  scope: ResolvedScope;
  snapshot: ManagementReportSnapshot;
  intelligence: ManagementReportIntelligence;
  title: string;
}> {
  assertCanUseReports(input.actor);
  const period = resolvePeriod(input.generation);
  if (period.calculationEndDate.getTime() < period.startDate.getTime()) {
    throw new AppError("La période sélectionnée n'a pas encore commencé.", 400, "REPORT_PERIOD_NOT_STARTED");
  }
  const scope = await resolveScope(input.tenant, input.actor, input.generation);
  const scoped = scopeFilter(scope);
  const tenantId = input.tenant._id as Types.ObjectId;
  const startKey = dateKey(period.startDate);
  const endKey = dateKey(period.calculationEndDate);

  const agents = (await (AgentModel as any).find({ tenantId, ...scoped }).select("_id directionId serviceId employmentStatus contractType employmentStartDate employmentEndDate").lean().exec()) as PlainRecord[];
  const agentIds = agents.map((agent) => agent._id as Types.ObjectId);

  const userFilter: MongoFilter = { tenantId, ...(scope.scopeType === "INSTITUTION" ? {} : { agentId: { $in: agentIds } }) };
  const unitFilter: MongoFilter = { tenantId };
  if (scope.scopeType === "DIRECTION" && scope.directionId) unitFilter.$or = [{ _id: scope.directionId }, { parentId: scope.directionId }];
  if (scope.scopeType === "SERVICE" && scope.directionId && scope.serviceId) unitFilter._id = { $in: [scope.directionId, scope.serviceId] };

  const [users, units, tasks, attendance, leaves, roadmaps, evaluations, documentResult] = await Promise.all([
    (UserModel as any).find(userFilter).select("_id agentId role isActive emailVerifiedAt lastLoginAt").lean().exec(),
    (OrganizationUnitModel as any).find(unitFilter).select("_id name type parentId status").lean().exec(),
    (TaskModel as any).find({ tenantId, ...scoped, ...taskPeriodFilter(period.startDate, period.calculationEndDate) }).select("directionId serviceId status priority progressPercentage startDate dueDate completedAt createdAt updatedAt").lean().exec(),
    (AttendanceModel as any).find({ tenantId, ...scoped, attendanceDate: { $gte: startKey, $lte: endKey } }).select("directionId serviceId attendanceDate status lateMinutes workedMinutes overtimeMinutes earlyDepartureMinutes").lean().exec(),
    (LeaveRequestModel as any).find({ tenantId, ...scoped, startDate: { $lte: endKey }, endDate: { $gte: startKey } }).select("directionId serviceId leaveType startDate endDate requestedDays status").lean().exec(),
    (RoadmapModel as any).find({ tenantId, ...scoped, calendarYear: input.generation.reportYear }).select("directionId serviceId status itemCount completedItemCount progressPercentage items calendarYear").lean().exec(),
    (EvaluationModel as any).find({ tenantId, ...scoped, periodStartDate: { $lte: period.calculationEndDate }, periodEndDate: { $gte: period.startDate } }).select("directionId serviceId status finalScore grade intelligence").lean().exec(),
    loadDocumentRows(
      tenantId,
      agentIds,
      scope.scopeType !== "INSTITUTION",
    ),
  ]);

  const leaveSnapshot = buildLeaveSnapshot(leaves as PlainRecord[], period);
  const workforce = buildWorkforceSnapshot({ agents, users: users as PlainRecord[], units: units as PlainRecord[], documents: documentResult.rows, period });
  const taskSnapshot = buildTaskSnapshot(tasks as PlainRecord[], period.calculationEndDate);
  const attendanceSnapshot = buildAttendanceSnapshot({ attendance: attendance as PlainRecord[], activeAgents: workforce.agentsActive, weekdays: weekdaysBetween(period.startDate, period.calculationEndDate), approvedLeaveDays: leaveSnapshot.approvedDays });
  const roadmapSnapshot = buildRoadmapSnapshot(roadmaps as PlainRecord[]);
  const evaluationSnapshot = buildEvaluationSnapshot(evaluations as PlainRecord[]);
  const monthlyTrend = buildMonthlyTrend({
    period,
    agents,
    tasks: tasks as PlainRecord[],
    attendance: attendance as PlainRecord[],
    leaves: leaves as PlainRecord[],
  });
  const unitBreakdown = buildUnitBreakdown({ scope, units: units as PlainRecord[], agents, tasks: tasks as PlainRecord[], attendance: attendance as PlainRecord[], leaves: leaves as PlainRecord[], roadmaps: roadmaps as PlainRecord[], evaluations: evaluations as PlainRecord[], period });

  const warnings: string[] = [];
  if (period.futureCapped) warnings.push(`Les données sont arrêtées au ${endKey}; les jours futurs de la période ne sont pas comptabilisés.`);
  if (!agents.length) warnings.push("Aucun Agent n'est rattaché au périmètre sélectionné.");
  if (!tasks.length) warnings.push("Aucune tâche exploitable n'a été trouvée sur la période.");
  if (!attendance.length) warnings.push("Aucun pointage exploitable n'a été trouvé sur la période.");
  if (!roadmaps.length) warnings.push("Aucune feuille de route n'a été trouvée pour l'année du rapport.");
  if (!evaluations.length) warnings.push("Aucune évaluation professionnelle n'est disponible sur la période.");
  if (!documentResult.available) warnings.push("La collection des documents RH n'est pas disponible; les indicateurs documentaires sont neutralisés.");
  if (attendanceSnapshot.coverageRate < 70 && attendanceSnapshot.expectedAfterApprovedLeave > 0) warnings.push("La couverture du pointage est faible; les taux de présence doivent être interprétés avec prudence.");
  if (leaveSnapshot.pendingDays > 0) warnings.push("Des demandes de congé restent en validation et peuvent modifier les chiffres définitifs.");

  const sources = [
    `Agents : ${agents.length} fiche(s)`,
    `Comptes utilisateurs : ${(users as PlainRecord[]).length}`,
    `Organisation : ${(units as PlainRecord[]).length} unité(s)`,
    `Tâches : ${(tasks as PlainRecord[]).length}`,
    `Pointages : ${(attendance as PlainRecord[]).length}`,
    `Congés : ${(leaves as PlainRecord[]).length} demande(s)`,
    `Feuilles de route : ${(roadmaps as PlainRecord[]).length}`,
    `Évaluations : ${(evaluations as PlainRecord[]).length}`,
    documentResult.available ? `Documents RH : ${documentResult.rows.length}` : "Documents RH : source indisponible",
  ];

  const snapshot: ManagementReportSnapshot = {
    snapshotVersion: 1,
    periodStartDate: period.startDate,
    periodEndDate: period.endDate,
    calculationEndDate: period.calculationEndDate,
    generatedAt: new Date(),
    workforce,
    tasks: taskSnapshot,
    attendance: attendanceSnapshot,
    leaves: leaveSnapshot,
    roadmaps: roadmapSnapshot,
    evaluations: evaluationSnapshot,
    monthlyTrend,
    unitBreakdown,
    sources,
    warnings,
  };

  const baseIntelligence = buildIntelligence({
    scope,
    period,
    reportType: input.generation.reportType,
    workforce,
    tasks: taskSnapshot,
    attendance: attendanceSnapshot,
    leaves: leaveSnapshot,
    roadmaps: roadmapSnapshot,
    evaluations: evaluationSnapshot,
    documentsAvailable: documentResult.available,
    warnings,
  });
  const comparison = await findPreviousReportComparison({
    tenantId,
    scope,
    reportType: input.generation.reportType,
    period,
    currentPerformanceIndex: baseIntelligence.performanceIndex,
    tasks: taskSnapshot,
    attendance: attendanceSnapshot,
    roadmaps: roadmapSnapshot,
    evaluations: evaluationSnapshot,
  });
  if (comparison) {
    snapshot.comparison = comparison;
    sources.push(
      `Comparaison historique : ${comparison.previousReference}`,
    );
  }
  const intelligence = buildIntelligence({
    scope,
    period,
    reportType: input.generation.reportType,
    workforce,
    tasks: taskSnapshot,
    attendance: attendanceSnapshot,
    leaves: leaveSnapshot,
    roadmaps: roadmapSnapshot,
    evaluations: evaluationSnapshot,
    documentsAvailable: documentResult.available,
    warnings,
    comparison,
  });
  const scopeLabel = scope.scopeType === "INSTITUTION" ? "FADES" : scope.scopeType === "DIRECTION" ? scope.snapshot.directionName : `${scope.snapshot.directionName} — ${scope.snapshot.serviceName}`;
  const title = input.generation.title?.trim() || `Rapport ${reportTypeLabel(input.generation.reportType)} de gestion et de performance — ${scopeLabel} — ${period.label}`;

  return { period, scope, snapshot, intelligence, title };
}

function cleanEditorial(editorial?: ManagementReportEditorial): ManagementReportEditorial {
  return {
    introduction: cleanText(editorial?.introduction),
    highlights: cleanText(editorial?.highlights),
    difficulties: cleanText(editorial?.difficulties),
    actionsTaken: cleanText(editorial?.actionsTaken),
    outlook: cleanText(editorial?.outlook),
    confidentialNote: cleanText(editorial?.confidentialNote),
  };
}


const EDITORIAL_KEYS = [
  "introduction",
  "highlights",
  "difficulties",
  "actionsTaken",
  "outlook",
  "confidentialNote",
] as const satisfies readonly (keyof ManagementReportEditorial)[];

function mergeEditorial(
  current: ManagementReportEditorial | undefined,
  patch: ManagementReportEditorial,
): ManagementReportEditorial {
  const result: ManagementReportEditorial = {
    ...cleanEditorial(current),
  };

  for (const key of EDITORIAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) {
      continue;
    }

    const nextValue = cleanText(patch[key]);

    if (nextValue === undefined) {
      delete result[key];
    } else {
      result[key] = nextValue;
    }
  }

  return result;
}

function serializeReport(
  report: ManagementReportDocument,
  actor?: ReportActor,
): PublicManagementReport {
  const snapshot = report.snapshot;
  const intelligence = report.intelligence;
  return {
    id: report.id,
    tenantId: report.tenantId.toString(),
    reference: report.reference,
    title: report.title,
    reportType: report.reportType,
    reportYear: report.reportYear,
    reportMonth: report.reportMonth,
    reportSemester: report.reportSemester,
    periodStartDate: report.periodStartDate.toISOString(),
    periodEndDate: report.periodEndDate.toISOString(),
    calculationEndDate: report.calculationEndDate.toISOString(),
    scopeType: report.scopeType,
    directionId: report.directionId?.toString() ?? null,
    serviceId: report.serviceId?.toString() ?? null,
    scopeSnapshot: { ...report.scopeSnapshot },
    status: report.status,
    snapshot: {
      ...snapshot,
      periodStartDate: new Date(snapshot.periodStartDate).toISOString(),
      periodEndDate: new Date(snapshot.periodEndDate).toISOString(),
      calculationEndDate: new Date(snapshot.calculationEndDate).toISOString(),
      generatedAt: new Date(snapshot.generatedAt).toISOString(),
      comparison: snapshot.comparison
        ? {
            ...snapshot.comparison,
            previousPeriodStartDate: new Date(
              snapshot.comparison.previousPeriodStartDate,
            ).toISOString(),
            previousPeriodEndDate: new Date(
              snapshot.comparison.previousPeriodEndDate,
            ).toISOString(),
          }
        : undefined,
    },
    intelligence: { ...intelligence, generatedAt: new Date(intelligence.generatedAt).toISOString() },
    /**
     * `report.editorial` est un sous-document Mongoose.
     * Ses propriétés métier sont donc sérialisées explicitement afin
     * que les valeurs enregistrées soient toujours renvoyées au frontend.
     */
    editorial: {
      introduction:
        report.editorial?.introduction,
      highlights:
        report.editorial?.highlights,
      difficulties:
        report.editorial?.difficulties,
      actionsTaken:
        report.editorial?.actionsTaken,
      outlook:
        report.editorial?.outlook,
      confidentialNote:
        actor &&
        (
          actor.userId.toString() ===
            report.createdByUserId.toString() ||
          ["TENANT_ADMIN", "RH_MANAGER"].includes(
            actor.role,
          )
        )
          ? report.editorial?.confidentialNote
          : undefined,
    },
    preparedByUserId: report.preparedByUserId.toString(),
    preparedByName: report.preparedByName,
    preparedAt: report.preparedAt.toISOString(),
    validatedByUserId: report.validatedByUserId?.toString(),
    validatedByName: report.validatedByName,
    validatedAt: report.validatedAt?.toISOString(),
    validationComment: report.validationComment,
    archivedAt: report.archivedAt?.toISOString(),
    createdByUserId: report.createdByUserId.toString(),
    lastUpdatedByUserId: report.lastUpdatedByUserId?.toString(),
    createdAt: report.createdAt?.toISOString(),
    updatedAt: report.updatedAt?.toISOString(),
    permissions: actor
      ? getReportPermissions(
          report,
          actor,
        )
      : {
          isOwner: false,
          canEdit: false,
          canRecompute: false,
          canValidate: false,
          canArchive: false,
          canDelete: false,
          canDownload: true,
          readOnly: true,
        },
  };
}

async function nextReference(tenant: TenantDocument, input: ReportGenerationInput): Promise<string> {
  const periodCode = input.reportType === "MONTHLY" ? `M${String(input.reportMonth ?? 1).padStart(2, "0")}` : input.reportType === "SEMIANNUAL" ? `S${input.reportSemester ?? 1}` : "AN";
  const count = await ManagementReportModel.countDocuments({ tenantId: tenant._id, reportYear: input.reportYear, reportType: input.reportType }).exec();
  return `RAP-${input.reportYear}-${periodCode}-${String(count + 1).padStart(4, "0")}`;
}

async function getReportOrThrow(tenant: TenantDocument, id: string): Promise<ManagementReportDocument> {
  const report = await ManagementReportModel.findOne({ _id: id, tenantId: tenant._id }).exec();
  if (!report) throw new AppError("Le rapport demandé est introuvable.", 404, "REPORT_NOT_FOUND");
  return report;
}

export async function previewManagementReport(tenant: TenantDocument, actor: ReportActor, generation: ReportGenerationInput): Promise<PublicManagementReport> {
  const computed = await computeReport({ tenant, actor, generation });
  const now = new Date();
  return {
    id: "PREVIEW",
    tenantId: tenant._id.toString(),
    reference: "APERÇU",
    title: computed.title,
    reportType: generation.reportType,
    reportYear: generation.reportYear,
    reportMonth: generation.reportMonth,
    reportSemester: generation.reportSemester as 1 | 2 | undefined,
    periodStartDate: computed.period.startDate.toISOString(),
    periodEndDate: computed.period.endDate.toISOString(),
    calculationEndDate: computed.period.calculationEndDate.toISOString(),
    scopeType: computed.scope.scopeType,
    directionId: computed.scope.directionId?.toString() ?? null,
    serviceId: computed.scope.serviceId?.toString() ?? null,
    scopeSnapshot: computed.scope.snapshot,
    status: "DRAFT",
    snapshot: {
      ...computed.snapshot,
      periodStartDate: computed.snapshot.periodStartDate.toISOString(),
      periodEndDate: computed.snapshot.periodEndDate.toISOString(),
      calculationEndDate: computed.snapshot.calculationEndDate.toISOString(),
      generatedAt: computed.snapshot.generatedAt.toISOString(),
      comparison: computed.snapshot.comparison
        ? {
            ...computed.snapshot.comparison,
            previousPeriodStartDate:
              computed.snapshot.comparison.previousPeriodStartDate.toISOString(),
            previousPeriodEndDate:
              computed.snapshot.comparison.previousPeriodEndDate.toISOString(),
          }
        : undefined,
    },
    intelligence: { ...computed.intelligence, generatedAt: computed.intelligence.generatedAt.toISOString() },
    editorial: {
      ...cleanEditorial(generation.editorial),
      confidentialNote: ["TENANT_ADMIN", "RH_MANAGER"].includes(actor.role)
        ? cleanEditorial(generation.editorial).confidentialNote
        : undefined,
    },
    preparedByUserId: actor.userId.toString(),
    preparedByName: actor.fullName,
    preparedAt: now.toISOString(),
    createdByUserId: actor.userId.toString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    permissions: {
      isOwner: true,
      canEdit: false,
      canRecompute: false,
      canValidate: false,
      canArchive: false,
      canDelete: false,
      canDownload: true,
      readOnly: false,
    },
  };
}

export async function generateManagementReport(tenant: TenantDocument, actor: ReportActor, generation: ReportGenerationInput): Promise<PublicManagementReport> {
  const computed = await computeReport({ tenant, actor, generation });
//computed
const reportSemester: 1 | 2 | undefined =
  generation.reportType === "SEMIANNUAL"
    ? generation.reportSemester === 2
      ? 2
      : 1
    : undefined;


    const duplicateFilter: MongoFilter = {
      tenantId: tenant._id,
      reportType: generation.reportType,
      reportYear: generation.reportYear,
      reportMonth:
        generation.reportType === "MONTHLY" ? generation.reportMonth : null,
      reportSemester:
        generation.reportType === "SEMIANNUAL" ? reportSemester : null,
      scopeType: computed.scope.scopeType,
      directionId: computed.scope.directionId ?? null,
      serviceId: computed.scope.serviceId ?? null,
      status: { $ne: "ARCHIVED" },
    };
    
    const duplicate = await ManagementReportModel.exists(
      duplicateFilter as any,
    ).exec();

  if (duplicate) {
    throw new AppError(
      "Un rapport existe déjà pour cette période et ce périmètre. Ouvrez-le puis utilisez Recalculer.",
      409,
      "REPORT_DUPLICATE_PERIOD_SCOPE",
    );
  }

  const reference = await nextReference(tenant, generation);
  const report = await ManagementReportModel.create({
    tenantId: tenant._id,
    reference,
    title: computed.title,
    reportType: generation.reportType,
    reportYear: generation.reportYear,
    reportMonth: generation.reportType === "MONTHLY" ? generation.reportMonth : undefined,
    reportSemester,
        periodStartDate: computed.period.startDate,
    periodEndDate: computed.period.endDate,
    calculationEndDate: computed.period.calculationEndDate,
    scopeType: computed.scope.scopeType,
    directionId: computed.scope.directionId ?? null,
    serviceId: computed.scope.serviceId ?? null,
    scopeSnapshot: computed.scope.snapshot,
    status: "READY",
    snapshot: computed.snapshot,
    intelligence: computed.intelligence,
    editorial: cleanEditorial(generation.editorial),
    preparedByUserId: actor.userId,
    preparedByName: actor.fullName,
    preparedAt: new Date(),
    createdByUserId: actor.userId,
    lastUpdatedByUserId: actor.userId,
  });
  return serializeReport(report, actor);
}

function buildListFilter(tenant: TenantDocument, actor: ReportActor, query: ListManagementReportsQuery): MongoFilter {
  const clauses: MongoFilter[] = [{ tenantId: tenant._id }];
  const scope = getStoredReportScopeFilter(actor);
  if (Object.keys(scope).length) clauses.push(scope);
  if (query.reportType) clauses.push({ reportType: query.reportType });
  if (query.status) clauses.push({ status: query.status });
  if (query.reportYear) clauses.push({ reportYear: query.reportYear });
  if (query.directionId && ["TENANT_ADMIN", "RH_MANAGER"].includes(actor.role)) clauses.push({ directionId: query.directionId });
  if (query.serviceId && ["TENANT_ADMIN", "RH_MANAGER", "DIRECTION"].includes(actor.role)) clauses.push({ serviceId: query.serviceId });
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), "i");
    clauses.push({ $or: [{ reference: pattern }, { title: pattern }, { "scopeSnapshot.directionName": pattern }, { "scopeSnapshot.serviceName": pattern }] });
  }
  return clauses.length === 1 ? clauses[0]! : { $and: clauses };}

export async function listManagementReports(tenant: TenantDocument, actor: ReportActor, query: ListManagementReportsQuery): Promise<{ items: PublicManagementReport[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  assertCanUseReports(actor);
  const filter = buildListFilter(tenant, actor, query);
  const sorts: Record<string, MongoFilter> = {
    CREATED_DESC: { createdAt: -1 },
    PERIOD_DESC: { periodEndDate: -1, createdAt: -1 },
    TYPE_ASC: { reportType: 1, periodEndDate: -1 },
    STATUS_ASC: { status: 1, periodEndDate: -1 },
  };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    ManagementReportModel.find(filter).sort(sorts[query.sort] ?? sorts.PERIOD_DESC).skip(skip).limit(query.limit).exec(),
    ManagementReportModel.countDocuments(filter).exec(),
  ]);
  return {
    items: items.map((report) => serializeReport(report, actor)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getManagementReportStats(tenant: TenantDocument, actor: ReportActor): Promise<{ total: number; monthly: number; semiannual: number; annual: number; ready: number; validated: number; archived: number; averagePerformanceIndex: number; highRisk: number }> {
  assertCanUseReports(actor);
  const filter = { tenantId: tenant._id, ...getStoredReportScopeFilter(actor) };
  const rows = await ManagementReportModel.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: 1 }, monthly: { $sum: { $cond: [{ $eq: ["$reportType", "MONTHLY"] }, 1, 0] } }, semiannual: { $sum: { $cond: [{ $eq: ["$reportType", "SEMIANNUAL"] }, 1, 0] } }, annual: { $sum: { $cond: [{ $eq: ["$reportType", "ANNUAL"] }, 1, 0] } }, ready: { $sum: { $cond: [{ $eq: ["$status", "READY"] }, 1, 0] } }, validated: { $sum: { $cond: [{ $eq: ["$status", "VALIDATED"] }, 1, 0] } }, archived: { $sum: { $cond: [{ $eq: ["$status", "ARCHIVED"] }, 1, 0] } }, averagePerformanceIndex: { $avg: "$intelligence.performanceIndex" }, highRisk: { $sum: { $cond: [{ $in: ["$intelligence.riskLevel", ["HIGH", "CRITICAL"]] }, 1, 0] } } } },
  ]).exec();
  const row = rows[0] ?? {};
  return { total: safeInteger(row.total), monthly: safeInteger(row.monthly), semiannual: safeInteger(row.semiannual), annual: safeInteger(row.annual), ready: safeInteger(row.ready), validated: safeInteger(row.validated), archived: safeInteger(row.archived), averagePerformanceIndex: safeInteger(row.averagePerformanceIndex), highRisk: safeInteger(row.highRisk) };
}

export async function getManagementReportById(tenant: TenantDocument, actor: ReportActor, id: string): Promise<PublicManagementReport> {
  const report = await getReportOrThrow(tenant, id);
  assertCanReadReport(report, actor);
  return serializeReport(report, actor);
}

export async function updateManagementReport(tenant: TenantDocument, actor: ReportActor, id: string, input: UpdateManagementReportInput): Promise<PublicManagementReport> {
  const report = await getReportOrThrow(tenant, id);
  assertCanEditReport(report, actor);

  if (report.status === "ARCHIVED") {
    throw new AppError(
      "Un rapport archivé ne peut plus être modifié.",
      409,
      "REPORT_ARCHIVED",
    );
  }
  if (report.status === "VALIDATED") {
    throw new AppError(
      "Un rapport validé est figé. Utilisez la fonction de réouverture et de recalcul avant toute modification.",
      409,
      "REPORT_VALIDATED_IMMUTABLE",
    );
  }
  if (input.title !== undefined) {
    report.title = input.title.trim();
  }

  if (input.editorial !== undefined) {
    report.editorial = mergeEditorial(
      report.editorial,
      input.editorial,
    );
  }

  report.lastUpdatedByUserId = actor.userId;
  await report.save();
  return serializeReport(report, actor);
}

export async function recomputeManagementReport(tenant: TenantDocument, actor: ReportActor, id: string): Promise<PublicManagementReport> {
  const report = await getReportOrThrow(tenant, id);
  assertCanRecomputeReport(report, actor);
  if (report.status === "ARCHIVED") {
    throw new AppError(
      "Un rapport archivé ne peut pas être recalculé.",
      409,
      "REPORT_ARCHIVED",
    );
  }
  if (report.status === "VALIDATED") {
    throw new AppError(
      "Un rapport validé est figé. Créez une nouvelle version si les données doivent être recalculées.",
      409,
      "REPORT_VALIDATED_IMMUTABLE",
    );
  }
  const generation: ReportGenerationInput = {
    reportType: report.reportType,
    reportYear: report.reportYear,
    reportMonth: report.reportMonth,
    reportSemester: report.reportSemester,
    scopeType: report.scopeType,
    directionId: report.directionId?.toString() ?? undefined,
    serviceId: report.serviceId?.toString() ?? undefined,
    title: report.title,
    editorial: report.editorial,
  };
  const computed = await computeReport({ tenant, actor, generation });
  report.periodStartDate = computed.period.startDate;
  report.periodEndDate = computed.period.endDate;
  report.calculationEndDate = computed.period.calculationEndDate;
  report.scopeSnapshot = computed.scope.snapshot;
  report.snapshot = computed.snapshot;
  report.intelligence = computed.intelligence;
  report.status = "READY";
  report.validatedByUserId = undefined;
  report.validatedByName = undefined;
  report.validatedAt = undefined;
  report.validationComment = undefined;
  report.preparedByUserId = actor.userId;
  report.preparedByName = actor.fullName;
  report.preparedAt = new Date();
  report.lastUpdatedByUserId = actor.userId;
  await report.save();
  return serializeReport(report, actor);
}

export async function validateManagementReport(tenant: TenantDocument, actor: ReportActor, id: string, input: ValidateManagementReportInput): Promise<PublicManagementReport> {
  const report = await getReportOrThrow(tenant, id);
  assertCanValidateReport(report, actor);
  if (report.status === "ARCHIVED") {
    throw new AppError(
      "Un rapport archivé ne peut pas être validé.",
      409,
      "REPORT_ARCHIVED",
    );
  }
  if (report.status !== "READY") {
    throw new AppError(
      "Seul un rapport prêt peut être validé.",
      409,
      "REPORT_NOT_READY",
    );
  }
  report.status = "VALIDATED";
  report.validatedByUserId = actor.userId;
  report.validatedByName = actor.fullName;
  report.validatedAt = new Date();
  report.validationComment = cleanText(input.validationComment);
  report.lastUpdatedByUserId = actor.userId;
  await report.save();
  return serializeReport(report, actor);
}

export async function archiveManagementReport(tenant: TenantDocument, actor: ReportActor, id: string): Promise<PublicManagementReport> {
  const report = await getReportOrThrow(tenant, id);
  assertCanArchiveReport(report, actor);
  if (report.status !== "VALIDATED") throw new AppError("Seul un rapport validé peut être archivé.", 409, "REPORT_NOT_VALIDATED");
  report.status = "ARCHIVED";
  report.archivedAt = new Date();
  report.lastUpdatedByUserId = actor.userId;
  await report.save();
  return serializeReport(report, actor);
}

export async function deleteManagementReport(tenant: TenantDocument, actor: ReportActor, id: string): Promise<{ deletedReportId: string }> {
  const report = await getReportOrThrow(tenant, id);
  assertCanDeleteReport(report, actor);

  const deletedReportId = report.id;
  await ManagementReportModel.deleteOne({ _id: report._id, tenantId: tenant._id }).exec();
  return { deletedReportId };
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
export async function exportManagementReportsCsv(tenant: TenantDocument, actor: ReportActor, query: ListManagementReportsQuery): Promise<string> {
  const result = await listManagementReports(tenant, actor, { ...query, page: 1, limit: 100 });
  const header = ["Référence", "Titre", "Type", "Année", "Périmètre", "Direction", "Service", "Statut", "Début", "Fin", "Indice global", "Risque", "Confiance", "Agents actifs", "Tâches", "Tâches terminées", "Tâches en retard", "Taux tâches %", "Présence %", "Couverture pointage %", "Congés approuvés jours", "Congés en attente jours", "Feuille de route %", "Évaluations", "Score moyen évaluations", "Préparé par", "Validé par"];
  const rows = result.items.map((report) => [
    report.reference, report.title, report.reportType, report.reportYear, report.scopeType, report.scopeSnapshot.directionName ?? "", report.scopeSnapshot.serviceName ?? "", report.status, report.periodStartDate.slice(0, 10), report.periodEndDate.slice(0, 10), report.intelligence.performanceIndex, report.intelligence.riskLevel, report.intelligence.dataConfidence, report.snapshot.workforce.agentsActive, report.snapshot.tasks.total, report.snapshot.tasks.completed, report.snapshot.tasks.overdue, report.snapshot.tasks.completionRate, report.snapshot.attendance.presenceRate, report.snapshot.attendance.coverageRate, report.snapshot.leaves.approvedDays, report.snapshot.leaves.pendingDays, report.snapshot.roadmaps.averageProgress, report.snapshot.evaluations.total, report.snapshot.evaluations.averageScore, report.preparedByName, report.validatedByName ?? "",
  ]);
  return `\ufeff${[header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n")}`;
}
