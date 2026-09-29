import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { OrganizationUnitModel } from "../organisation/organization.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import type { EvaluationDocument } from "./evaluation.types.js";

export type EvaluationActorRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

export type EvaluationActor = {
  userId: Types.ObjectId;
  fullName: string;
  role: EvaluationActorRole;
  agentId?: Types.ObjectId;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
  isConfigured: boolean;
  configurationMessage?: string;
};

type LeanUser = {
  _id: Types.ObjectId;
  fullName?: string;
  email?: string;
  role?: string;
  agentId?: Types.ObjectId | string | null;
};

type LeanAgent = {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
  userId?: Types.ObjectId | string | null;
};

type LeanOrgUnit = {
  _id: Types.ObjectId;
  type?: "DIRECTION" | "SERVICE";
  parentId?: Types.ObjectId | null;
};

export type EvaluationScopeFilter = Record<string, unknown>;

const EMPTY_OBJECT_ID = new Types.ObjectId("000000000000000000000000");

const acceptedRoles: EvaluationActorRole[] = [
  "TENANT_ADMIN",
  "DIRECTION",
  "RH_MANAGER",
  "SERVICE_MANAGER",
  "AGENT",
];

function sameId(
  first?: Types.ObjectId | string | null,
  second?: Types.ObjectId | string | null,
): boolean {
  return Boolean(first && second && first.toString() === second.toString());
}

function isGlobalRole(role: EvaluationActorRole): boolean {
  return role === "TENANT_ADMIN" || role === "RH_MANAGER";
}

function getAgentDisplayName(agent?: LeanAgent | null): string {
  return (
    agent?.fullName?.trim() ||
    [agent?.firstName, agent?.lastName].filter(Boolean).join(" ").trim()
  );
}

async function resolveManagedDirection(input: {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<LeanOrgUnit | null> {
  return (await (OrganizationUnitModel as any)
    .findOne({
      tenantId: input.tenantId,
      type: "DIRECTION",
      status: "ACTIVE",
      managerUserId: input.userId,
    })
    .select("_id type parentId")
    .lean()
    .exec()) as LeanOrgUnit | null;
}

async function resolveManagedService(input: {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<LeanOrgUnit | null> {
  return (await (OrganizationUnitModel as any)
    .findOne({
      tenantId: input.tenantId,
      type: "SERVICE",
      status: "ACTIVE",
      managerUserId: input.userId,
    })
    .select("_id type parentId")
    .lean()
    .exec()) as LeanOrgUnit | null;
}

async function resolveAgentByUser(input: {
  tenantId: Types.ObjectId;
  user: LeanUser;
}): Promise<LeanAgent | null> {
  const byUserId = (await (AgentModel as any)
    .findOne({
      tenantId: input.tenantId,
      userId: input.user._id,
      employmentStatus: "ACTIVE",
    })
    .select("_id firstName lastName fullName email directionId serviceId userId")
    .lean()
    .exec()) as LeanAgent | null;

  if (byUserId) return byUserId;

  if (input.user.email) {
    const byEmail = (await (AgentModel as any)
      .findOne({
        tenantId: input.tenantId,
        email: input.user.email.toLowerCase(),
        employmentStatus: "ACTIVE",
      })
      .select("_id firstName lastName fullName email directionId serviceId userId")
      .lean()
      .exec()) as LeanAgent | null;

    if (byEmail) return byEmail;
  }

  if (!input.user.agentId) return null;

  return (await (AgentModel as any)
    .findOne({
      _id: input.user.agentId,
      tenantId: input.tenantId,
      employmentStatus: "ACTIVE",
    })
    .select("_id firstName lastName fullName email directionId serviceId userId")
    .lean()
    .exec()) as LeanAgent | null;
}

function buildActor(input: {
  user: LeanUser;
  role: EvaluationActorRole;
  agent?: LeanAgent | null;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
  isConfigured: boolean;
  configurationMessage?: string;
}): EvaluationActor {
  return {
    userId: input.user._id,
    fullName:
      input.user.fullName?.trim() ||
      getAgentDisplayName(input.agent) ||
      "Utilisateur FADES",
    role: input.role,
    agentId: input.agent?._id,
    directionId: input.directionId ?? input.agent?.directionId,
    serviceId: input.serviceId ?? input.agent?.serviceId ?? null,
    isConfigured: input.isConfigured,
    configurationMessage: input.configurationMessage,
  };
}

export async function resolveEvaluationActor(
  tenant: TenantDocument,
  userId: string,
): Promise<EvaluationActor> {
  const tenantId = tenant._id as Types.ObjectId;

  const user = (await (UserModel as any)
    .findOne({ _id: userId, tenantId, isActive: true })
    .select("_id fullName email role agentId")
    .lean()
    .exec()) as LeanUser | null;

  if (!user) {
    throw new AppError(
      "Votre session utilisateur est invalide ou inactive.",
      401,
      "EVALUATION_ACTOR_NOT_FOUND",
    );
  }

  const role = user.role as EvaluationActorRole;

  if (!acceptedRoles.includes(role)) {
    throw new AppError(
      "Votre rôle ne permet pas d'accéder au module Évaluations.",
      403,
      "EVALUATION_ROLE_NOT_ALLOWED",
    );
  }

  if (isGlobalRole(role)) {
    return buildActor({ user, role, isConfigured: true });
  }

  const agent = await resolveAgentByUser({ tenantId, user });

  if (role === "DIRECTION") {
    const managedDirection = await resolveManagedDirection({ tenantId, userId: user._id });
    const directionId = managedDirection?._id ?? agent?.directionId;
    return buildActor({
      user,
      role,
      agent,
      directionId,
      serviceId: null,
      isConfigured: Boolean(directionId),
      configurationMessage: directionId
        ? undefined
        : "Ce compte Direction n'est rattaché à aucune Direction active.",
    });
  }

  if (role === "SERVICE_MANAGER") {
    const managedService = await resolveManagedService({ tenantId, userId: user._id });
    const directionId = managedService?.parentId ?? agent?.directionId;
    const serviceId = managedService?._id ?? agent?.serviceId;
    return buildActor({
      user,
      role,
      agent,
      directionId: directionId ?? undefined,
      serviceId: serviceId ?? null,
      isConfigured: Boolean(directionId && serviceId),
      configurationMessage:
        directionId && serviceId
          ? undefined
          : "Ce compte Chef de service n'est rattaché à aucun Service actif.",
    });
  }

  return buildActor({
    user,
    role,
    agent,
    isConfigured: Boolean(agent?._id && agent.directionId),
    configurationMessage:
      agent?._id && agent.directionId
        ? undefined
        : "Ce compte Agent n'est rattaché à aucune fiche Agent active.",
  });
}

export function getEvaluationScopeFilter(actor: EvaluationActor): EvaluationScopeFilter {
  if (isGlobalRole(actor.role)) return {};
  if (!actor.isConfigured) return { _id: EMPTY_OBJECT_ID };

  if (actor.role === "DIRECTION") {
    return actor.directionId ? { directionId: actor.directionId } : { _id: EMPTY_OBJECT_ID };
  }

  if (actor.role === "SERVICE_MANAGER") {
    return actor.directionId && actor.serviceId
      ? { directionId: actor.directionId, serviceId: actor.serviceId }
      : { _id: EMPTY_OBJECT_ID };
  }

  return actor.agentId ? { agentId: actor.agentId } : { _id: EMPTY_OBJECT_ID };
}

function recordMatchesScope(evaluation: EvaluationDocument, actor: EvaluationActor): boolean {
  if (isGlobalRole(actor.role)) return true;
  if (!actor.isConfigured) return false;

  if (actor.role === "DIRECTION") return sameId(evaluation.directionId, actor.directionId);

  if (actor.role === "SERVICE_MANAGER") {
    return (
      sameId(evaluation.directionId, actor.directionId) &&
      sameId(evaluation.serviceId, actor.serviceId)
    );
  }

  return sameId(evaluation.agentId, actor.agentId);
}

export function assertCanReadEvaluation(
  evaluation: EvaluationDocument,
  actor: EvaluationActor,
): void {
  if (recordMatchesScope(evaluation, actor)) return;

  throw new AppError(
    "Cette évaluation ne relève pas de votre périmètre.",
    403,
    "EVALUATION_SCOPE_FORBIDDEN",
  );
}

export function assertCanCreateEvaluation(actor: EvaluationActor): void {
  if (isGlobalRole(actor.role)) return;

  throw new AppError(
    "La création d'une évaluation est réservée à la RH et à l'administrateur.",
    403,
    "EVALUATION_CREATE_FORBIDDEN",
  );
}

export function assertCanSelfReviewEvaluation(
  evaluation: EvaluationDocument,
  actor: EvaluationActor,
): void {
  if (isGlobalRole(actor.role) || sameId(evaluation.agentId, actor.agentId)) return;

  throw new AppError(
    "Vous ne pouvez renseigner que votre propre auto-évaluation.",
    403,
    "EVALUATION_SELF_REVIEW_FORBIDDEN",
  );
}

export function assertCanManagerReviewEvaluation(
  evaluation: EvaluationDocument,
  actor: EvaluationActor,
): void {
  if (isGlobalRole(actor.role)) return;

  if (actor.role === "DIRECTION" && sameId(evaluation.directionId, actor.directionId)) return;

  if (
    actor.role === "SERVICE_MANAGER" &&
    sameId(evaluation.directionId, actor.directionId) &&
    sameId(evaluation.serviceId, actor.serviceId)
  ) {
    return;
  }

  throw new AppError(
    "Cette évaluation ne relève pas de votre périmètre hiérarchique.",
    403,
    "EVALUATION_MANAGER_REVIEW_FORBIDDEN",
  );
}

export function assertCanValidateEvaluation(actor: EvaluationActor): void {
  if (isGlobalRole(actor.role)) return;

  throw new AppError(
    "La validation RH est réservée à la RH et à l'administrateur.",
    403,
    "EVALUATION_HR_VALIDATION_FORBIDDEN",
  );
}

export function assertCanDeleteEvaluation(actor: EvaluationActor): void {
  if (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER") return;

  throw new AppError(
    "La suppression d'une évaluation est réservée à la RH et à l'administrateur.",
    403,
    "EVALUATION_DELETE_FORBIDDEN",
  );
}
