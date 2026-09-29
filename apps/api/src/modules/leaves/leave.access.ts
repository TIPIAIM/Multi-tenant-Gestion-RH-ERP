import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import type { UserRole } from "../users/user.types.js";
import type { LeaveRequestDocument } from "./leave.types.js";

type LeaveScopeFilter = Record<string, unknown>;

export type LeaveActor = {
  userId: Types.ObjectId;
  fullName: string;
  role: UserRole;
  agentId?: Types.ObjectId;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
};

type AgentScope = {
  agentId: Types.ObjectId;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
};

function sameId(
  first?: Types.ObjectId | string | null,
  second?: Types.ObjectId | string | null
): boolean {
  return Boolean(first && second && first.toString() === second.toString());
}

function requireAgentScope(actor: LeaveActor): AgentScope {
  if (!actor.agentId || !actor.directionId) {
    throw new AppError(
      "Votre compte doit être lié à un Agent actif pour ce niveau d'accès.",
      403,
      "LEAVE_AGENT_PROFILE_REQUIRED"
    );
  }

  return {
    agentId: actor.agentId,
    directionId: actor.directionId,
    serviceId: actor.serviceId ?? null,
  };
}

export async function resolveLeaveActor(
  tenant: TenantDocument,
  userId: string
): Promise<LeaveActor> {
  const user = await (UserModel as any).findOne({
    _id: userId,
    tenantId: tenant._id,
    isActive: true,
  })
    .select("fullName role agentId")
    .lean()
    .exec();

  if (!user) {
    throw new AppError(
      "Votre session utilisateur est invalide ou inactive.",
      401,
      "LEAVE_ACTOR_NOT_FOUND"
    );
  }

  const rawUser = user as {
    _id: Types.ObjectId;
    fullName: string;
    role: UserRole;
    agentId?: Types.ObjectId | null;
  };

  const linkedAgent = rawUser.agentId
    ? await (AgentModel as any).findOne({
        _id: rawUser.agentId,
        tenantId: tenant._id,
        employmentStatus: "ACTIVE",
      })
        .select("_id directionId serviceId")
        .lean()
        .exec()
    : null;

  const legacyAgent = linkedAgent
    ? null
    : await (AgentModel as any).findOne({
        tenantId: tenant._id,
        userId,
        employmentStatus: "ACTIVE",
      })
        .select("_id directionId serviceId")
        .lean()
        .exec();

  const rawAgent = (linkedAgent ?? legacyAgent) as {
    _id: Types.ObjectId;
    directionId?: Types.ObjectId;
    serviceId?: Types.ObjectId | null;
  } | null;

  return {
    userId: rawUser._id,
    fullName: rawUser.fullName,
    role: rawUser.role,
    agentId: rawAgent?._id,
    directionId: rawAgent?.directionId,
    serviceId: rawAgent?.serviceId ?? null,
  };
}

export function getLeaveScopeFilter(
  actor: LeaveActor
): LeaveScopeFilter {
  if (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER") {
    return {};
  }

  const scope = requireAgentScope(actor);

  if (actor.role === "DIRECTION") {
    return { directionId: scope.directionId };
  }

  if (actor.role === "SERVICE_MANAGER") {
    if (!scope.serviceId) {
      throw new AppError(
        "Le responsable doit être rattaché à un Service actif.",
        403,
        "LEAVE_SERVICE_SCOPE_REQUIRED"
      );
    }

    return {
      directionId: scope.directionId,
      serviceId: scope.serviceId,
    };
  }

  return { agentId: scope.agentId };
}

function requestMatchesScope(
  request: LeaveRequestDocument,
  actor: LeaveActor
): boolean {
  if (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER") {
    return true;
  }

  const scope = requireAgentScope(actor);

  if (actor.role === "DIRECTION") {
    return sameId(request.directionId, scope.directionId);
  }

  if (actor.role === "SERVICE_MANAGER") {
    return (
      sameId(request.directionId, scope.directionId) &&
      sameId(request.serviceId, scope.serviceId)
    );
  }

  return sameId(request.agentId, scope.agentId);
}

export function assertCanReadLeaveRequest(
  request: LeaveRequestDocument,
  actor: LeaveActor
): void {
  if (!requestMatchesScope(request, actor)) {
    throw new AppError(
      "Vous n'êtes pas autorisé à consulter cette demande.",
      403,
      "LEAVE_READ_FORBIDDEN"
    );
  }
}

export function assertCanCreateLeaveForAgent(
  actor: LeaveActor,
  target: AgentScope
): void {
  if (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER") {
    return;
  }

  const scope = requireAgentScope(actor);

  if (actor.role === "AGENT") {
    if (!sameId(scope.agentId, target.agentId)) {
      throw new AppError(
        "Un Agent ne peut créer une demande que pour lui-même.",
        403,
        "LEAVE_CREATE_SELF_ONLY"
      );
    }

    return;
  }

  if (
    actor.role === "DIRECTION" &&
    !sameId(scope.directionId, target.directionId)
  ) {
    throw new AppError(
      "Cette demande ne relève pas de votre Direction.",
      403,
      "LEAVE_DIRECTION_SCOPE_FORBIDDEN"
    );
  }

  if (
    actor.role === "SERVICE_MANAGER" &&
    (!sameId(scope.directionId, target.directionId) ||
      !sameId(scope.serviceId, target.serviceId))
  ) {
    throw new AppError(
      "Cette demande ne relève pas de votre Service.",
      403,
      "LEAVE_SERVICE_SCOPE_FORBIDDEN"
    );
  }
}

export function assertCanEditLeaveRequest(
  request: LeaveRequestDocument,
  actor: LeaveActor
): void {
  if (request.status !== "DRAFT") {
    throw new AppError(
      "Seules les demandes en brouillon peuvent être modifiées.",
      400,
      "LEAVE_DRAFT_REQUIRED"
    );
  }

  if (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER") {
    return;
  }

  if (!requestMatchesScope(request, actor)) {
    throw new AppError(
      "Vous n'êtes pas autorisé à modifier cette demande.",
      403,
      "LEAVE_UPDATE_FORBIDDEN"
    );
  }
}

export function assertCanSubmitLeaveRequest(
  request: LeaveRequestDocument,
  actor: LeaveActor
): void {
  assertCanEditLeaveRequest(request, actor);
}

export function assertCanManagerReviewLeaveRequest(
  request: LeaveRequestDocument,
  actor: LeaveActor
): void {
  if (actor.role !== "DIRECTION" && actor.role !== "SERVICE_MANAGER") {
    throw new AppError(
      "Seuls les responsables hiérarchiques peuvent effectuer cette validation.",
      403,
      "LEAVE_MANAGER_REVIEW_FORBIDDEN"
    );
  }

  if (sameId(actor.agentId, request.agentId)) {
    throw new AppError(
      "Vous ne pouvez pas valider votre propre demande.",
      403,
      "LEAVE_SELF_REVIEW_FORBIDDEN"
    );
  }

  if (!requestMatchesScope(request, actor)) {
    throw new AppError(
      "Cette demande ne relève pas de votre périmètre.",
      403,
      "LEAVE_REVIEW_SCOPE_FORBIDDEN"
    );
  }
}

export function assertCanFinalReviewLeaveRequest(
  request: LeaveRequestDocument,
  actor: LeaveActor
): void {
  if (actor.role !== "TENANT_ADMIN" && actor.role !== "RH_MANAGER") {
    throw new AppError(
      "La décision finale est réservée à l'administration RH.",
      403,
      "LEAVE_FINAL_REVIEW_FORBIDDEN"
    );
  }

  if (sameId(actor.agentId, request.agentId)) {
    throw new AppError(
      "Vous ne pouvez pas rendre une décision finale sur votre propre demande.",
      403,
      "LEAVE_SELF_FINAL_REVIEW_FORBIDDEN"
    );
  }
}

export function assertCanCancelLeaveRequest(
  request: LeaveRequestDocument,
  actor: LeaveActor
): void {
  if (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER") {
    return;
  }

  if (!requestMatchesScope(request, actor)) {
    throw new AppError(
      "Vous n'êtes pas autorisé à annuler cette demande.",
      403,
      "LEAVE_CANCEL_FORBIDDEN"
    );
  }
}

export function assertCanManageLeaveBalances(actor: LeaveActor): void {
  if (actor.role !== "TENANT_ADMIN" && actor.role !== "RH_MANAGER") {
    throw new AppError(
      "La gestion des soldes de congés est réservée à l'administration RH.",
      403,
      "LEAVE_BALANCE_MANAGE_FORBIDDEN"
    );
  }
}

export function requireOwnLeaveAgent(actor: LeaveActor): Types.ObjectId {
  if (!actor.agentId) {
    throw new AppError(
      "Votre compte n'est pas lié à un Agent actif.",
      403,
      "LEAVE_SELF_AGENT_REQUIRED"
    );
  }

  return actor.agentId;
}

export async function getAccessibleAgentIds(
  tenant: TenantDocument,
  actor: LeaveActor
): Promise<Types.ObjectId[] | null> {
  if (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER") {
    return null;
  }

  const scope = requireAgentScope(actor);

  if (actor.role === "AGENT") {
    return [scope.agentId];
  }

  if (actor.role === "SERVICE_MANAGER" && !scope.serviceId) {
    throw new AppError(
      "Le responsable doit être rattaché à un Service actif.",
      403,
      "LEAVE_SERVICE_SCOPE_REQUIRED"
    );
  }

  const agents = (await (AgentModel as any).find({
    tenantId: tenant._id,
    ...(actor.role === "DIRECTION"
      ? { directionId: scope.directionId }
      : {
          directionId: scope.directionId,
          serviceId: scope.serviceId,
        }),
  })
    .select("_id")
    .lean()
    .exec()) as Array<{ _id: Types.ObjectId }>;

  return agents.map((agent: { _id: Types.ObjectId }) => agent._id);
}
