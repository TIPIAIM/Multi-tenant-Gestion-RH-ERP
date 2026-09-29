import mongoose, {
  Types,
  type ClientSession,
  type SortOrder,
} from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import {
  assertCanCancelLeaveRequest,
  assertCanCreateLeaveForAgent,
  assertCanEditLeaveRequest,
  assertCanFinalReviewLeaveRequest,
  assertCanManageLeaveBalances,
  assertCanManagerReviewLeaveRequest,
  assertCanReadLeaveRequest,
  assertCanSubmitLeaveRequest,
  getAccessibleAgentIds,
  getLeaveScopeFilter,
  requireOwnLeaveAgent,
  type LeaveActor,
} from "./leave.access.js";
import {
  LeaveActivityModel,
  LeaveBalanceModel,
  LeaveRequestModel,
} from "./leave.model.js";
import type {
  CancelLeaveRequestInput,
  CreateLeaveRequestInput,
  ListLeaveBalancesQuery,
  ListLeaveCalendarQuery,
  ListLeaveRequestsQuery,
  ReviewLeaveRequestInput,
  UpdateLeaveRequestInput,
  UpsertLeaveBalanceInput,
} from "./leave.schema.js";
import {
  assertLeaveDateRange,
  calculateWorkingDays,
  getCalendarYear,
  getConakryDateKey,
} from "./leave.time.js";
import type {
  LeaveActivityAction,
  LeaveBalanceDocument,
  LeaveRequestDocument,
  LeaveReview,
  LeaveType,
  PublicLeaveActivity,
  PublicLeaveAgent,
  PublicLeaveBalance,
  PublicLeaveRequest,
  PublicLeaveReview,
  LeaveDashboard,
} from "./leave.types.js";

const balanceDeductingLeaveTypes: readonly LeaveType[] = [
  "ANNUAL_LEAVE",
];

type AgentSnapshot = {
  id: Types.ObjectId;
  fullName: string;
  matricule: string;
  jobTitle: string;
  employmentStatus: string;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
};

function trimOptional(value?: string): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function sameId(
  first?: Types.ObjectId | string | null,
  second?: Types.ObjectId | string | null,
): boolean {
  return Boolean(
    first &&
      second &&
      first.toString() === second.toString(),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requiresBalance(leaveType: LeaveType): boolean {
  return balanceDeductingLeaveTypes.includes(leaveType);
}

function calculateAvailableDays(balance: {
  openingDays: number;
  entitledDays: number;
  carriedOverDays: number;
  adjustmentDays: number;
  consumedDays: number;
}): number {
  return (
    balance.openingDays +
    balance.entitledDays +
    balance.carriedOverDays +
    balance.adjustmentDays -
    balance.consumedDays
  );
}

function serializeReview(
  review?: LeaveReview,
): PublicLeaveReview | undefined {
  if (!review) {
    return undefined;
  }

  return {
    reviewedByUserId: review.reviewedByUserId.toString(),
    reviewedByName: review.reviewedByName,
    decision: review.decision,
    comment: review.comment,
    decidedAt: review.decidedAt.toISOString(),
  };
}

function serializeAgent(
  agent: AgentSnapshot,
): PublicLeaveAgent {
  return {
    id: agent.id.toString(),
    fullName: agent.fullName,
    matricule: agent.matricule,
    jobTitle: agent.jobTitle,
    employmentStatus: agent.employmentStatus,
    directionId: agent.directionId.toString(),
    serviceId: agent.serviceId
      ? agent.serviceId.toString()
      : null,
  };
}

function serializeRequest(input: {
  request: LeaveRequestDocument;
  agent?: AgentSnapshot;
}): PublicLeaveRequest {
  const { request, agent } = input;

  return {
    id: request.id,
    agentId: request.agentId.toString(),
    agent: agent ? serializeAgent(agent) : undefined,
    directionId: request.directionId.toString(),
    serviceId: request.serviceId
      ? request.serviceId.toString()
      : null,
    leaveType: request.leaveType,
    startDate: request.startDate,
    endDate: request.endDate,
    requestedDays: request.requestedDays,
    reason: request.reason,
    status: request.status,
    submittedAt: request.submittedAt?.toISOString(),
    managerReview: serializeReview(request.managerReview),
    finalReview: serializeReview(request.finalReview),
    cancelledAt: request.cancelledAt?.toISOString(),
    cancelledByUserId:
      request.cancelledByUserId?.toString(),
    cancellationReason: request.cancellationReason,
    createdByUserId: request.createdByUserId.toString(),
    lastUpdatedByUserId:
      request.lastUpdatedByUserId?.toString(),
    createdAt: request.createdAt?.toISOString(),
    updatedAt: request.updatedAt?.toISOString(),
  };
}

function serializeBalance(input: {
  balance: LeaveBalanceDocument;
  agent?: AgentSnapshot;
}): PublicLeaveBalance {
  const { balance, agent } = input;

  return {
    id: balance.id,
    agentId: balance.agentId.toString(),
    agent: agent ? serializeAgent(agent) : undefined,
    calendarYear: balance.calendarYear,
    leaveType: balance.leaveType,
    openingDays: balance.openingDays,
    entitledDays: balance.entitledDays,
    carriedOverDays: balance.carriedOverDays,
    adjustmentDays: balance.adjustmentDays,
    consumedDays: balance.consumedDays,
    availableDays: calculateAvailableDays(balance),
    updatedByUserId: balance.updatedByUserId.toString(),
    createdAt: balance.createdAt?.toISOString(),
    updatedAt: balance.updatedAt?.toISOString(),
  };
}

function serializeActivity(activity: {
  id: string;
  leaveRequestId?: Types.ObjectId;
  leaveBalanceId?: Types.ObjectId;
  agentId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  actorName: string;
  action: LeaveActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}): PublicLeaveActivity {
  return {
    id: activity.id,
    leaveRequestId: activity.leaveRequestId?.toString(),
    leaveBalanceId: activity.leaveBalanceId?.toString(),
    agentId: activity.agentId.toString(),
    actorUserId: activity.actorUserId.toString(),
    actorName: activity.actorName,
    action: activity.action,
    summary: activity.summary,
    metadata: activity.metadata,
    createdAt: activity.createdAt?.toISOString(),
  };
}

async function getAgentSnapshotOrThrow(
  tenant: TenantDocument,
  agentId: string | Types.ObjectId,
  session?: ClientSession,
): Promise<AgentSnapshot> {
  const query = AgentModel.findOne({
    _id: agentId,
    tenantId: tenant._id,
  })
    .select(
      "_id firstName lastName matricule jobTitle employmentStatus directionId serviceId",
    )
    .lean();

  if (session) {
    query.session(session);
  }

  const agent = await query.exec();

  if (!agent) {
    throw new AppError(
      "L'Agent sélectionné est introuvable.",
      404,
      "LEAVE_AGENT_NOT_FOUND",
    );
  }

  const raw = agent as {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    matricule: string;
    jobTitle: string;
    employmentStatus: string;
    directionId?: Types.ObjectId;
    serviceId?: Types.ObjectId | null;
  };

  if (!raw.directionId) {
    throw new AppError(
      "L'Agent sélectionné doit être rattaché à une Direction.",
      400,
      "LEAVE_AGENT_DIRECTION_REQUIRED",
    );
  }

  return {
    id: raw._id,
    fullName: `${raw.firstName} ${raw.lastName}`.trim(),
    matricule: raw.matricule,
    jobTitle: raw.jobTitle,
    employmentStatus: raw.employmentStatus,
    directionId: raw.directionId,
    serviceId: raw.serviceId ?? null,
  };
}

async function getRequestOrThrow(
  tenant: TenantDocument,
  requestId: string,
  session?: ClientSession,
): Promise<LeaveRequestDocument> {
  const query = LeaveRequestModel.findOne({
    _id: requestId,
    tenantId: tenant._id,
  });

  if (session) {
    query.session(session);
  }

  const request = await query.exec();

  if (!request) {
    throw new AppError(
      "La demande de congé est introuvable.",
      404,
      "LEAVE_REQUEST_NOT_FOUND",
    );
  }

  return request;
}

async function recordActivity(input: {
  tenant: TenantDocument;
  agentId: Types.ObjectId;
  actor: LeaveActor;
  action: LeaveActivityAction;
  summary: string;
  leaveRequestId?: Types.ObjectId;
  leaveBalanceId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  session?: ClientSession;
}): Promise<void> {
  await LeaveActivityModel.create(
    [
      {
        tenantId: input.tenant._id,
        leaveRequestId: input.leaveRequestId,
        leaveBalanceId: input.leaveBalanceId,
        agentId: input.agentId,
        actorUserId: input.actor.userId,
        actorName: input.actor.fullName,
        action: input.action,
        summary: input.summary,
        metadata: input.metadata,
      },
    ],
    { session: input.session },
  );
}

async function hydrateRequests(
  tenant: TenantDocument,
  requests: LeaveRequestDocument[],
): Promise<PublicLeaveRequest[]> {
  if (!requests.length) {
    return [];
  }

  const agents = await AgentModel.find({
    tenantId: tenant._id,
    _id: {
      $in: requests.map((request) => request.agentId),
    },
  })
    .select(
      "_id firstName lastName matricule jobTitle employmentStatus directionId serviceId",
    )
    .lean()
    .exec();

  const byId = new Map<string, AgentSnapshot>();

  agents.forEach((agent) => {
    const raw = agent as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      matricule: string;
      jobTitle: string;
      employmentStatus: string;
      directionId: Types.ObjectId;
      serviceId?: Types.ObjectId | null;
    };

    byId.set(raw._id.toString(), {
      id: raw._id,
      fullName: `${raw.firstName} ${raw.lastName}`.trim(),
      matricule: raw.matricule,
      jobTitle: raw.jobTitle,
      employmentStatus: raw.employmentStatus,
      directionId: raw.directionId,
      serviceId: raw.serviceId ?? null,
    });
  });

  return requests.map((request) =>
    serializeRequest({
      request,
      agent: byId.get(request.agentId.toString()),
    }),
  );
}

async function hydrateBalances(
  tenant: TenantDocument,
  balances: LeaveBalanceDocument[],
): Promise<PublicLeaveBalance[]> {
  if (!balances.length) {
    return [];
  }

  const agents = await AgentModel.find({
    tenantId: tenant._id,
    _id: {
      $in: balances.map((balance) => balance.agentId),
    },
  })
    .select(
      "_id firstName lastName matricule jobTitle employmentStatus directionId serviceId",
    )
    .lean()
    .exec();

  const byId = new Map<string, AgentSnapshot>();

  agents.forEach((agent) => {
    const raw = agent as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      matricule: string;
      jobTitle: string;
      employmentStatus: string;
      directionId: Types.ObjectId;
      serviceId?: Types.ObjectId | null;
    };

    byId.set(raw._id.toString(), {
      id: raw._id,
      fullName: `${raw.firstName} ${raw.lastName}`.trim(),
      matricule: raw.matricule,
      jobTitle: raw.jobTitle,
      employmentStatus: raw.employmentStatus,
      directionId: raw.directionId,
      serviceId: raw.serviceId ?? null,
    });
  });

  return balances.map((balance) =>
    serializeBalance({
      balance,
      agent: byId.get(balance.agentId.toString()),
    }),
  );
}

async function assertNoOverlap(input: {
  tenant: TenantDocument;
  agentId: Types.ObjectId;
  startDate: string;
  endDate: string;
  excludeRequestId?: Types.ObjectId;
  session?: ClientSession;
}): Promise<void> {
  const query = LeaveRequestModel.findOne({
    tenantId: input.tenant._id,
    agentId: input.agentId,
    status: {
      $in: ["SUBMITTED", "MANAGER_APPROVED", "APPROVED"],
    },
    startDate: { $lte: input.endDate },
    endDate: { $gte: input.startDate },
    ...(input.excludeRequestId
      ? {
          _id: { $ne: input.excludeRequestId },
        }
      : {}),
  })
    .select("_id")
    .lean();

  if (input.session) {
    query.session(input.session);
  }

  const duplicate = await query.exec();

  if (duplicate) {
    throw new AppError(
      "Cette période chevauche une autre demande déjà soumise, en validation ou approuvée.",
      409,
      "LEAVE_DATE_OVERLAP",
    );
  }
}

async function getBalanceForRequestOrThrow(input: {
  tenant: TenantDocument;
  request: LeaveRequestDocument;
  session?: ClientSession;
}): Promise<LeaveBalanceDocument> {
  const query = LeaveBalanceModel.findOne({
    tenantId: input.tenant._id,
    agentId: input.request.agentId,
    calendarYear: getCalendarYear(input.request.startDate),
    leaveType: input.request.leaveType,
  });

  if (input.session) {
    query.session(input.session);
  }

  const balance = await query.exec();

  if (!balance) {
    throw new AppError(
      "Le solde de congé de cet Agent doit être configuré avant la validation de cette demande.",
      400,
      "LEAVE_BALANCE_NOT_CONFIGURED",
    );
  }

  return balance;
}

async function assertBalanceAvailable(input: {
  tenant: TenantDocument;
  request: LeaveRequestDocument;
  session?: ClientSession;
}): Promise<void> {
  if (!requiresBalance(input.request.leaveType)) {
    return;
  }

  const balance = await getBalanceForRequestOrThrow(input);

  if (
    calculateAvailableDays(balance) <
    input.request.requestedDays
  ) {
    throw new AppError(
      "Le solde disponible est insuffisant pour cette demande.",
      400,
      "LEAVE_BALANCE_INSUFFICIENT",
    );
  }
}

function buildRequestFilter(input: {
  tenant: TenantDocument;
  actor: LeaveActor;
  query: {
    status?: string;
    leaveType?: string;
    agentId?: string;
    directionId?: string;
    serviceId?: string;
    dateFrom?: string;
    dateTo?: string;
  };
} ): Record<string, any> {
  const clauses: Record<string, any>[] = [
    { tenantId: input.tenant._id },
    getLeaveScopeFilter(input.actor),
  ];

  if (input.query.status) {
    clauses.push({ status: input.query.status });
  }

  if (input.query.leaveType) {
    clauses.push({ leaveType: input.query.leaveType });
  }

  if (input.query.agentId) {
    clauses.push({ agentId: input.query.agentId });
  }

  if (input.query.directionId) {
    clauses.push({ directionId: input.query.directionId });
  }

  if (input.query.serviceId) {
    clauses.push({ serviceId: input.query.serviceId });
  }

  if (input.query.dateFrom || input.query.dateTo) {
    clauses.push({
      startDate: {
        ...(input.query.dateFrom
          ? { $gte: input.query.dateFrom }
          : {}),
        ...(input.query.dateTo
          ? { $lte: input.query.dateTo }
          : {}),
      },
    });
  }

  return { $and: clauses };
}


export async function createLeaveRequest(
  tenant: TenantDocument,
  actor: LeaveActor,
  input: CreateLeaveRequestInput,
): Promise<PublicLeaveRequest> {
  const agentId = input.agentId ??
    requireOwnLeaveAgent(actor).toString();

  const agent = await getAgentSnapshotOrThrow(
    tenant,
    agentId,
  );

  if (agent.employmentStatus !== "ACTIVE") {
    throw new AppError(
      "Seul un Agent actif peut faire l'objet d'une demande de congé.",
      400,
      "LEAVE_AGENT_INACTIVE",
    );
  }

  assertCanCreateLeaveForAgent(actor, {
    agentId: agent.id,
    directionId: agent.directionId,
    serviceId: agent.serviceId,
  });

  assertLeaveDateRange({
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const requestedDays = calculateWorkingDays({
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const request = await LeaveRequestModel.create({
    tenantId: tenant._id,
    agentId: agent.id,
    directionId: agent.directionId,
    serviceId: agent.serviceId,
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    requestedDays,
    reason: input.reason.trim(),
    status: "DRAFT",
    createdByUserId: actor.userId,
    lastUpdatedByUserId: actor.userId,
  });

  await recordActivity({
    tenant,
    leaveRequestId: request._id,
    agentId: request.agentId,
    actor,
    action: "CREATED",
    summary: "Demande de congé créée en brouillon.",
    metadata: {
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
      requestedDays: request.requestedDays,
    },
  });

  return serializeRequest({ request, agent });
}

export async function updateLeaveRequest(
  tenant: TenantDocument,
  actor: LeaveActor,
  requestId: string,
  input: UpdateLeaveRequestInput,
): Promise<PublicLeaveRequest> {
  const request = await getRequestOrThrow(tenant, requestId);

  assertCanEditLeaveRequest(request, actor);

  const startDate = input.startDate ?? request.startDate;
  const endDate = input.endDate ?? request.endDate;

  assertLeaveDateRange({ startDate, endDate });

  const requestedDays = calculateWorkingDays({
    startDate,
    endDate,
  });

  const changes: string[] = [];

  if (input.leaveType && input.leaveType !== request.leaveType) {
    request.leaveType = input.leaveType;
    changes.push("Type d'absence modifié");
  }

  if (startDate !== request.startDate) {
    request.startDate = startDate;
    changes.push("Date de début modifiée");
  }

  if (endDate !== request.endDate) {
    request.endDate = endDate;
    changes.push("Date de fin modifiée");
  }

  if (requestedDays !== request.requestedDays) {
    request.requestedDays = requestedDays;
    changes.push("Nombre de jours recalculé");
  }

  if (
    input.reason !== undefined &&
    input.reason.trim() !== request.reason
  ) {
    request.reason = input.reason.trim();
    changes.push("Motif modifié");
  }

  request.lastUpdatedByUserId = actor.userId;
  await request.save();

  if (changes.length) {
    await recordActivity({
      tenant,
      leaveRequestId: request._id,
      agentId: request.agentId,
      actor,
      action: "UPDATED",
      summary: changes.join(" · "),
    });
  }

  const agent = await getAgentSnapshotOrThrow(
    tenant,
    request.agentId,
  );

  return serializeRequest({ request, agent });
}

export async function submitLeaveRequest(
  tenant: TenantDocument,
  actor: LeaveActor,
  requestId: string,
): Promise<PublicLeaveRequest> {
  const request = await getRequestOrThrow(tenant, requestId);

  assertCanSubmitLeaveRequest(request, actor);

  if (request.status !== "DRAFT") {
    throw new AppError(
      "Seule une demande en brouillon peut être soumise.",
      400,
      "LEAVE_SUBMISSION_DRAFT_REQUIRED",
    );
  }

  await assertNoOverlap({
    tenant,
    agentId: request.agentId,
    startDate: request.startDate,
    endDate: request.endDate,
    excludeRequestId: request._id,
  });

  await assertBalanceAvailable({ tenant, request });

  request.status = "SUBMITTED";
  request.submittedAt = new Date();
  request.lastUpdatedByUserId = actor.userId;
  await request.save();

  await recordActivity({
    tenant,
    leaveRequestId: request._id,
    agentId: request.agentId,
    actor,
    action: "SUBMITTED",
    summary:
      "Demande soumise pour validation hiérarchique et RH.",
  });

  const agent = await getAgentSnapshotOrThrow(
    tenant,
    request.agentId,
  );

  return serializeRequest({ request, agent });
}

export async function reviewLeaveRequestByManager(
  tenant: TenantDocument,
  actor: LeaveActor,
  requestId: string,
  input: ReviewLeaveRequestInput,
): Promise<PublicLeaveRequest> {
  const request = await getRequestOrThrow(tenant, requestId);

  assertCanManagerReviewLeaveRequest(request, actor);

  if (request.status !== "SUBMITTED") {
    throw new AppError(
      "Cette demande n'est plus en attente de validation hiérarchique.",
      400,
      "LEAVE_MANAGER_REVIEW_STATUS_INVALID",
    );
  }

  request.managerReview = {
    reviewedByUserId: actor.userId,
    reviewedByName: actor.fullName,
    decision: input.decision,
    comment: trimOptional(input.comment),
    decidedAt: new Date(),
  };

  request.status =
    input.decision === "APPROVED"
      ? "MANAGER_APPROVED"
      : "REJECTED";
  request.lastUpdatedByUserId = actor.userId;

  await request.save();

  await recordActivity({
    tenant,
    leaveRequestId: request._id,
    agentId: request.agentId,
    actor,
    action:
      input.decision === "APPROVED"
        ? "MANAGER_APPROVED"
        : "REJECTED",
    summary:
      input.decision === "APPROVED"
        ? "Demande validée par le responsable hiérarchique."
        : "Demande refusée par le responsable hiérarchique.",
    metadata: { comment: trimOptional(input.comment) },
  });

  const agent = await getAgentSnapshotOrThrow(
    tenant,
    request.agentId,
  );

  return serializeRequest({ request, agent });
}

export async function reviewLeaveRequestFinal(
  tenant: TenantDocument,
  actor: LeaveActor,
  requestId: string,
  input: ReviewLeaveRequestInput,
): Promise<PublicLeaveRequest> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const request = await getRequestOrThrow(
        tenant,
        requestId,
        session,
      );

      assertCanFinalReviewLeaveRequest(request, actor);

      if (
        request.status !== "SUBMITTED" &&
        request.status !== "MANAGER_APPROVED"
      ) {
        throw new AppError(
          "Cette demande n'est plus en attente de décision RH.",
          400,
          "LEAVE_FINAL_REVIEW_STATUS_INVALID",
        );
      }

      if (input.decision === "APPROVED") {
        await assertNoOverlap({
          tenant,
          agentId: request.agentId,
          startDate: request.startDate,
          endDate: request.endDate,
          excludeRequestId: request._id,
          session,
        });

        if (requiresBalance(request.leaveType)) {
          const balance = await getBalanceForRequestOrThrow({
            tenant,
            request,
            session,
          });

          if (
            calculateAvailableDays(balance) <
            request.requestedDays
          ) {
            throw new AppError(
              "Le solde disponible est insuffisant pour approuver cette demande.",
              400,
              "LEAVE_BALANCE_INSUFFICIENT",
            );
          }

          balance.consumedDays += request.requestedDays;
          balance.updatedByUserId = actor.userId;
          await balance.save({ session });

          await recordActivity({
            tenant,
            leaveRequestId: request._id,
            leaveBalanceId: balance._id,
            agentId: request.agentId,
            actor,
            action: "BALANCE_CONSUMED",
            summary: `${request.requestedDays} jour(s) déduit(s) du solde de congé.`,
            metadata: {
              leaveType: request.leaveType,
              requestedDays: request.requestedDays,
            },
            session,
          });
        }
      }

      request.finalReview = {
        reviewedByUserId: actor.userId,
        reviewedByName: actor.fullName,
        decision: input.decision,
        comment: trimOptional(input.comment),
        decidedAt: new Date(),
      };

      request.status =
        input.decision === "APPROVED"
          ? "APPROVED"
          : "REJECTED";
      request.lastUpdatedByUserId = actor.userId;

      await request.save({ session });

      await recordActivity({
        tenant,
        leaveRequestId: request._id,
        agentId: request.agentId,
        actor,
        action:
          input.decision === "APPROVED"
            ? "APPROVED"
            : "REJECTED",
        summary:
          input.decision === "APPROVED"
            ? "Demande approuvée par l'administration RH."
            : "Demande refusée par l'administration RH.",
        metadata: { comment: trimOptional(input.comment) },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  return getLeaveRequestById(tenant, actor, requestId);
}

export async function cancelLeaveRequest(
  tenant: TenantDocument,
  actor: LeaveActor,
  requestId: string,
  input: CancelLeaveRequestInput,
): Promise<PublicLeaveRequest> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const request = await getRequestOrThrow(
        tenant,
        requestId,
        session,
      );

      assertCanCancelLeaveRequest(request, actor);

      if (
        request.status === "REJECTED" ||
        request.status === "CANCELLED"
      ) {
        throw new AppError(
          "Cette demande ne peut plus être annulée.",
          400,
          "LEAVE_CANCELLATION_STATUS_INVALID",
        );
      }

      if (
        request.status === "APPROVED" &&
        requiresBalance(request.leaveType)
      ) {
        const balance = await getBalanceForRequestOrThrow({
          tenant,
          request,
          session,
        });

        balance.consumedDays = Math.max(
          0,
          balance.consumedDays - request.requestedDays,
        );
        balance.updatedByUserId = actor.userId;
        await balance.save({ session });

        await recordActivity({
          tenant,
          leaveRequestId: request._id,
          leaveBalanceId: balance._id,
          agentId: request.agentId,
          actor,
          action: "BALANCE_RESTORED",
          summary: `${request.requestedDays} jour(s) rétabli(s) au solde de congé après annulation.`,
          metadata: {
            leaveType: request.leaveType,
            requestedDays: request.requestedDays,
          },
          session,
        });
      }

      request.status = "CANCELLED";
      request.cancelledAt = new Date();
      request.cancelledByUserId = actor.userId;
      request.cancellationReason = input.reason.trim();
      request.lastUpdatedByUserId = actor.userId;
      await request.save({ session });

      await recordActivity({
        tenant,
        leaveRequestId: request._id,
        agentId: request.agentId,
        actor,
        action: "CANCELLED",
        summary: "Demande de congé annulée.",
        metadata: {
          reason: request.cancellationReason,
        },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  return getLeaveRequestById(tenant, actor, requestId);
}

export async function getLeaveRequestById(
  tenant: TenantDocument,
  actor: LeaveActor,
  requestId: string,
): Promise<PublicLeaveRequest> {
  const request = await getRequestOrThrow(tenant, requestId);
  assertCanReadLeaveRequest(request, actor);

  const agent = await getAgentSnapshotOrThrow(
    tenant,
    request.agentId,
  );

  return serializeRequest({ request, agent });
}


export async function listLeaveRequests(
  tenant: TenantDocument,
  actor: LeaveActor,
  query: ListLeaveRequestsQuery,
): Promise<{
  items: PublicLeaveRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const filter = buildRequestFilter({
    tenant,
    actor,
    query,
  });

  if (query.search) {
    const pattern = new RegExp(
      escapeRegex(query.search),
      "i",
    );

    const matchingAgents = await AgentModel.find({
      tenantId: tenant._id,
      $or: [
        { firstName: pattern },
        { lastName: pattern },
        { matricule: pattern },
      ],
    })
      .select("_id")
      .lean()
      .exec();

    const agentIds = matchingAgents.map(
      (agent) => (agent as { _id: Types.ObjectId })._id,
    );

    const clauses = filter.$and ?? [];

    clauses.push({
      $or: [
        { reason: pattern },
        ...(agentIds.length
          ? [{ agentId: { $in: agentIds } }]
          : []),
      ],
    });

    filter.$and = clauses;
  }

  const sortMap: Record<string, Record<string, SortOrder>> = {
    START_DATE_ASC: { startDate: 1, createdAt: -1 },
    START_DATE_DESC: { startDate: -1, createdAt: -1 },
    CREATED_DESC: { createdAt: -1 },
  };

  const selectedSort = sortMap[query.sort] ?? sortMap.CREATED_DESC;

  const skip = (query.page - 1) * query.limit;

  const [requests, total] = await Promise.all([
    LeaveRequestModel.find(filter)
      .sort(selectedSort)
      .skip(skip)
      .limit(query.limit)
      .exec(),
    LeaveRequestModel.countDocuments(filter).exec(),
  ]);

  return {
    items: await hydrateRequests(tenant, requests),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(
        1,
        Math.ceil(total / query.limit),
      ),
    },
  };
}

export async function listLeaveCalendar(
  tenant: TenantDocument,
  actor: LeaveActor,
  query: ListLeaveCalendarQuery,
): Promise<PublicLeaveRequest[]> {
  const dateFrom = query.dateFrom ?? getConakryDateKey();
  const defaultEnd = new Date(`${dateFrom}T00:00:00Z`);
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 45);
  const dateTo =
    query.dateTo ??
    defaultEnd.toISOString().slice(0, 10);

  const requests = await LeaveRequestModel.find({
    $and: [
      { tenantId: tenant._id },
      getLeaveScopeFilter(actor),
      {
        status: {
          $in: [
            "SUBMITTED",
            "MANAGER_APPROVED",
            "APPROVED",
          ],
        },
      },
      { startDate: { $lte: dateTo } },
      { endDate: { $gte: dateFrom } },
    ],
  })
    .sort({ startDate: 1, endDate: 1 })
    .limit(100)
    .exec();

  return hydrateRequests(tenant, requests);
}

export async function listLeaveBalances(
  tenant: TenantDocument,
  actor: LeaveActor,
  query: ListLeaveBalancesQuery,
): Promise<PublicLeaveBalance[]> {
  const allowedAgentIds = await getAccessibleAgentIds(
    tenant,
    actor,
  );

  const matchingAgentIds = allowedAgentIds
    ? query.agentId
      ? allowedAgentIds.filter((id) =>
          sameId(id, query.agentId),
        )
      : allowedAgentIds
    : undefined;

  const balances = await LeaveBalanceModel.find({
    tenantId: tenant._id,
    ...(query.calendarYear
      ? { calendarYear: query.calendarYear }
      : {}),
    ...(query.agentId && !allowedAgentIds
      ? { agentId: query.agentId }
      : {}),
    ...(matchingAgentIds
      ? { agentId: { $in: matchingAgentIds } }
      : {}),
  })
    .sort({ calendarYear: -1, leaveType: 1 })
    .exec();

  return hydrateBalances(tenant, balances);
}

export async function listMyLeaveBalances(
  tenant: TenantDocument,
  actor: LeaveActor,
  calendarYear?: number,
): Promise<PublicLeaveBalance[]> {
  const agentId = requireOwnLeaveAgent(actor);

  return listLeaveBalances(tenant, actor, {
    agentId: agentId.toString(),
    calendarYear,
  });
}

export async function upsertLeaveBalance(
  tenant: TenantDocument,
  actor: LeaveActor,
  input: UpsertLeaveBalanceInput,
): Promise<PublicLeaveBalance> {
  assertCanManageLeaveBalances(actor);

  const agent = await getAgentSnapshotOrThrow(
    tenant,
    input.agentId,
  );

  const session = await mongoose.startSession();
  let balanceId: Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      const existing = await LeaveBalanceModel.findOne({
        tenantId: tenant._id,
        agentId: agent.id,
        calendarYear: input.calendarYear,
        leaveType: input.leaveType,
      })
        .session(session)
        .exec();

      if (existing) {
        existing.openingDays = input.openingDays;
        existing.entitledDays = input.entitledDays;
        existing.carriedOverDays = input.carriedOverDays;
        existing.adjustmentDays = input.adjustmentDays;
        existing.updatedByUserId = actor.userId;
        await existing.save({ session });

        balanceId = existing._id;

        await recordActivity({
          tenant,
          leaveBalanceId: existing._id,
          agentId: existing.agentId,
          actor,
          action: "BALANCE_ADJUSTED",
          summary:
            "Solde de congé ajusté par l'administration RH.",
          metadata: {
            calendarYear: existing.calendarYear,
            leaveType: existing.leaveType,
          },
          session,
        });

        return;
      }

      const [created] = await LeaveBalanceModel.create(
        [
          {
            tenantId: tenant._id,
            agentId: agent.id,
            calendarYear: input.calendarYear,
            leaveType: input.leaveType,
            openingDays: input.openingDays,
            entitledDays: input.entitledDays,
            carriedOverDays: input.carriedOverDays,
            adjustmentDays: input.adjustmentDays,
            consumedDays: 0,
            updatedByUserId: actor.userId,
          },
        ],
        { session },
      );

      if (!created) {
        throw new AppError(
          "Impossible de créer le solde de congé.",
          500,
          "LEAVE_BALANCE_CREATE_FAILED",
        );
      }

      balanceId = created._id;

      await recordActivity({
        tenant,
        leaveBalanceId: created._id,
        agentId: created.agentId,
        actor,
        action: "BALANCE_CREATED",
        summary:
          "Solde de congé créé par l'administration RH.",
        metadata: {
          calendarYear: created.calendarYear,
          leaveType: created.leaveType,
        },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!balanceId) {
    throw new AppError(
      "Impossible d'enregistrer le solde de congé.",
      500,
      "LEAVE_BALANCE_SAVE_FAILED",
    );
  }

  const balance = await LeaveBalanceModel.findOne({
    _id: balanceId,
    tenantId: tenant._id,
  }).exec();

  if (!balance) {
    throw new AppError(
      "Le solde enregistré est introuvable.",
      500,
      "LEAVE_BALANCE_NOT_FOUND_AFTER_SAVE",
    );
  }

  return serializeBalance({ balance, agent });
}

export async function getLeaveDashboard(
  tenant: TenantDocument,
  actor: LeaveActor,
  calendarYear?: number,
): Promise<LeaveDashboard> {
  const year =
    calendarYear ?? Number(getConakryDateKey().slice(0, 4));

  const dateFilter: Record<string, any> = {
    $and: [
      { tenantId: tenant._id },
      getLeaveScopeFilter(actor),
      {
        startDate: {
          $gte: `${year}-01-01`,
          $lte: `${year}-12-31`,
        },
      },
    ],
  };

  const countStatus = async (status: string) =>
    LeaveRequestModel.countDocuments({
      $and: [dateFilter, { status }],
    }).exec();

  const [
    total,
    draft,
    submitted,
    managerApproved,
    approved,
    rejected,
    cancelled,
    totals,
    upcoming,
  ] = await Promise.all([
    LeaveRequestModel.countDocuments(dateFilter).exec(),
    countStatus("DRAFT"),
    countStatus("SUBMITTED"),
    countStatus("MANAGER_APPROVED"),
    countStatus("APPROVED"),
    countStatus("REJECTED"),
    countStatus("CANCELLED"),
    LeaveRequestModel.aggregate<{
      requestedDays: number;
      approvedDays: number;
    }>([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          requestedDays: { $sum: "$requestedDays" },
          approvedDays: {
            $sum: {
              $cond: [
                { $eq: ["$status", "APPROVED"] },
                "$requestedDays",
                0,
              ],
            },
          },
        },
      },
    ]).exec(),
    LeaveRequestModel.find({
      $and: [
        { tenantId: tenant._id },
        getLeaveScopeFilter(actor),
        { status: "APPROVED" },
        {
          endDate: {
            $gte: getConakryDateKey(),
          },
        },
      ],
    })
      .sort({ startDate: 1 })
      .limit(8)
      .exec(),
  ]);

  return {
    calendarYear: year,
    total,
    draft,
    submitted,
    managerApproved,
    approved,
    rejected,
    cancelled,
    requestedDays: totals[0]?.requestedDays ?? 0,
    approvedDays: totals[0]?.approvedDays ?? 0,
    upcomingApproved: await hydrateRequests(
      tenant,
      upcoming,
    ),
  };
}

export async function listLeaveActivities(
  tenant: TenantDocument,
  actor: LeaveActor,
  requestId: string,
  limit: number,
): Promise<PublicLeaveActivity[]> {
  const request = await getRequestOrThrow(tenant, requestId);
  assertCanReadLeaveRequest(request, actor);

  const activities = await LeaveActivityModel.find({
    tenantId: tenant._id,
    leaveRequestId: request._id,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return activities.map(serializeActivity);
}
