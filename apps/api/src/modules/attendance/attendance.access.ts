import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import {
  OrganizationUnitModel,
} from "../organisation/organization.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import type { AttendanceDocument } from "./attendance.types.js";

type AttendanceScopeFilter = Record<string, unknown>;

export type AttendanceActorRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

export type AttendanceActor = {
  userId: Types.ObjectId;
  fullName: string;
  role: AttendanceActorRole;

  /**
   * Identité personnelle de pointage.
   * Ces champs servent uniquement au pointage du compte connecté.
   */
  agentId?: Types.ObjectId;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;

  /**
   * Périmètre de consultation hiérarchique.
   * Ces champs ne doivent jamais remplacer l'identité personnelle de pointage.
   */
  scopeDirectionId?: Types.ObjectId;
  scopeServiceId?: Types.ObjectId | null;

  isConfigured: boolean;
  configurationMessage?: string;
};

type LeanUserForAttendance = {
  _id: Types.ObjectId;
  fullName?: string;
  email?: string;
  role?: string;
  agentId?: Types.ObjectId | string | null;
};

type LeanAgentForAttendance = {
  _id: Types.ObjectId;
  userId?: Types.ObjectId | string | null;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
};

type LeanOrganizationUnitForAttendance = {
  _id: Types.ObjectId;
  type?: "DIRECTION" | "SERVICE";
  parentId?: Types.ObjectId | null;
  managerUserId?: Types.ObjectId | null;
};

const EMPTY_OBJECT_ID = new Types.ObjectId(
  "000000000000000000000000",
);

const acceptedRoles: AttendanceActorRole[] = [
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
  return Boolean(
    first &&
      second &&
      first.toString() === second.toString(),
  );
}

function isGlobalAttendanceRole(role: AttendanceActorRole): boolean {
  return role === "TENANT_ADMIN" || role === "RH_MANAGER";
}

function getAgentDisplayName(
  agent?: LeanAgentForAttendance | null,
): string {
  return (
    agent?.fullName?.trim() ||
    [agent?.firstName, agent?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim()
  );
}

async function resolveManagedDirection(input: {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<LeanOrganizationUnitForAttendance | null> {
  return (await (OrganizationUnitModel as any)
    .findOne({
      tenantId: input.tenantId,
      type: "DIRECTION",
      status: "ACTIVE",
      managerUserId: input.userId,
    })
    .select("_id type parentId managerUserId")
    .lean()
    .exec()) as LeanOrganizationUnitForAttendance | null;
}

async function resolveManagedService(input: {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<LeanOrganizationUnitForAttendance | null> {
  return (await (OrganizationUnitModel as any)
    .findOne({
      tenantId: input.tenantId,
      type: "SERVICE",
      status: "ACTIVE",
      managerUserId: input.userId,
    })
    .select("_id type parentId managerUserId")
    .lean()
    .exec()) as LeanOrganizationUnitForAttendance | null;
}

async function resolvePersonalAgentByUser(input: {
  tenantId: Types.ObjectId;
  user: LeanUserForAttendance;
}): Promise<LeanAgentForAttendance | null> {
  /**
   * Pour le pointage personnel, on privilégie l'identité réellement rattachée
   * au compte connecté : Agent.userId puis email.
   * User.agentId reste un dernier fallback, car dans Plateforme-RH il peut être
   * réutilisé comme liaison fonctionnelle et n'est pas unique.
   */
  const byUserId = (await (AgentModel as any)
    .findOne({
      tenantId: input.tenantId,
      userId: input.user._id,
      employmentStatus: "ACTIVE",
    })
    .select(
      "_id userId firstName lastName fullName email directionId serviceId",
    )
    .lean()
    .exec()) as LeanAgentForAttendance | null;

  if (byUserId) {
    return byUserId;
  }

  if (input.user.email) {
    const byEmail = (await (AgentModel as any)
      .findOne({
        tenantId: input.tenantId,
        email: input.user.email.toLowerCase(),
        employmentStatus: "ACTIVE",
      })
      .select(
        "_id userId firstName lastName fullName email directionId serviceId",
      )
      .lean()
      .exec()) as LeanAgentForAttendance | null;

    if (byEmail) {
      return byEmail;
    }
  }

  if (!input.user.agentId) {
    return null;
  }

  const fallbackAgent = (await (AgentModel as any)
    .findOne({
      _id: input.user.agentId,
      tenantId: input.tenantId,
      employmentStatus: "ACTIVE",
    })
    .select(
      "_id userId firstName lastName fullName email directionId serviceId",
    )
    .lean()
    .exec()) as LeanAgentForAttendance | null;

  if (!fallbackAgent) {
    return null;
  }

  const belongsToCurrentUser = sameId(
    fallbackAgent.userId,
    input.user._id,
  );

  const matchesCurrentUserEmail = Boolean(
    fallbackAgent.email &&
      input.user.email &&
      fallbackAgent.email.toLowerCase() ===
        input.user.email.toLowerCase(),
  );

  if (belongsToCurrentUser || matchesCurrentUserEmail) {
    return fallbackAgent;
  }

  const activeUsersSharingAgent = await (UserModel as any)
    .countDocuments({
      tenantId: input.tenantId,
      agentId: fallbackAgent._id,
      isActive: true,
    })
    .exec();

  if (activeUsersSharingAgent <= 1) {
    return fallbackAgent;
  }

  return null;
}

function buildUnconfiguredActor(input: {
  user: LeanUserForAttendance;
  role: AttendanceActorRole;
  agent?: LeanAgentForAttendance | null;
  message: string;
}): AttendanceActor {
  return {
    userId: input.user._id,
    fullName:
      input.user.fullName?.trim() ||
      getAgentDisplayName(input.agent) ||
      "Utilisateur FADES",
    role: input.role,
    agentId: input.agent?._id,
    directionId: input.agent?.directionId,
    serviceId: input.agent?.serviceId ?? null,
    isConfigured: false,
    configurationMessage: input.message,
  };
}

function buildActor(input: {
  user: LeanUserForAttendance;
  role: AttendanceActorRole;
  agent?: LeanAgentForAttendance | null;
  scopeDirectionId?: Types.ObjectId;
  scopeServiceId?: Types.ObjectId | null;
  isConfigured: boolean;
  configurationMessage?: string;
}): AttendanceActor {
  return {
    userId: input.user._id,
    fullName:
      input.user.fullName?.trim() ||
      getAgentDisplayName(input.agent) ||
      "Utilisateur FADES",
    role: input.role,
    agentId: input.agent?._id,
    directionId: input.agent?.directionId,
    serviceId: input.agent?.serviceId ?? null,
    scopeDirectionId: input.scopeDirectionId,
    scopeServiceId: input.scopeServiceId ?? null,
    isConfigured: input.isConfigured,
    configurationMessage: input.configurationMessage,
  };
}

export async function resolveAttendanceActor(
  tenant: TenantDocument,
  userId: string,
): Promise<AttendanceActor> {
  const tenantId = tenant._id as Types.ObjectId;

  const user = (await (UserModel as any)
    .findOne({
      _id: userId,
      tenantId,
      isActive: true,
    })
    .select("_id fullName email role agentId")
    .lean()
    .exec()) as LeanUserForAttendance | null;

  if (!user) {
    throw new AppError(
      "Votre session utilisateur est invalide ou inactive.",
      401,
      "ATTENDANCE_ACTOR_NOT_FOUND",
    );
  }

  const role = user.role as AttendanceActorRole;

  if (!acceptedRoles.includes(role)) {
    throw new AppError(
      "Votre rôle ne permet pas d'accéder au module Pointage.",
      403,
      "ATTENDANCE_ROLE_NOT_ALLOWED",
    );
  }

  const personalAgent = await resolvePersonalAgentByUser({
    tenantId,
    user,
  });

  if (isGlobalAttendanceRole(role)) {
    return buildActor({
      user,
      role,
      agent: personalAgent,
      isConfigured: true,
    });
  }

  if (role === "DIRECTION") {
    const managedDirection = await resolveManagedDirection({
      tenantId,
      userId: user._id,
    });

    const scopeDirectionId = managedDirection?._id ?? personalAgent?.directionId;

    if (scopeDirectionId) {
      return buildActor({
        user,
        role,
        agent: personalAgent,
        scopeDirectionId,
        scopeServiceId: null,
        isConfigured: true,
      });
    }

    return buildUnconfiguredActor({
      user,
      role,
      agent: personalAgent,
      message:
        "Ce compte Direction n'est rattaché à aucune Direction active.",
    });
  }

  if (role === "SERVICE_MANAGER") {
    const managedService = await resolveManagedService({
      tenantId,
      userId: user._id,
    });

    const scopeDirectionId = managedService?.parentId ?? personalAgent?.directionId;
    const scopeServiceId = managedService?._id ?? personalAgent?.serviceId;

    if (scopeDirectionId && scopeServiceId) {
      return buildActor({
        user,
        role,
        agent: personalAgent,
        scopeDirectionId,
        scopeServiceId,
        isConfigured: true,
      });
    }

    return buildUnconfiguredActor({
      user,
      role,
      agent: personalAgent,
      message:
        "Ce compte Chef de service n'est rattaché à aucun Service actif.",
    });
  }

  if (personalAgent?._id && personalAgent.directionId) {
    return buildActor({
      user,
      role,
      agent: personalAgent,
      scopeDirectionId: personalAgent.directionId,
      scopeServiceId: personalAgent.serviceId ?? null,
      isConfigured: true,
    });
  }

  return buildUnconfiguredActor({
    user,
    role,
    agent: personalAgent,
    message:
      "Ce compte Agent n'est rattaché à aucune fiche Agent active.",
  });
}

function ensureActorConfigured(actor: AttendanceActor): void {
  if (!actor.isConfigured) {
    throw new AppError(
      actor.configurationMessage ||
        "Votre périmètre Pointage n'est pas encore configuré.",
      403,
      "ATTENDANCE_SCOPE_NOT_CONFIGURED",
    );
  }
}

export function getAttendanceScopeFilter(
  actor: AttendanceActor,
): AttendanceScopeFilter {
  if (isGlobalAttendanceRole(actor.role)) {
    return {};
  }

  if (!actor.isConfigured) {
    return { _id: EMPTY_OBJECT_ID };
  }

  if (actor.role === "DIRECTION") {
    if (!actor.scopeDirectionId) {
      return { _id: EMPTY_OBJECT_ID };
    }

    const clauses: Record<string, unknown>[] = [
      { directionId: actor.scopeDirectionId },
    ];

    if (actor.agentId) {
      clauses.push({ agentId: actor.agentId });
    }

    return clauses.length === 1 ? clauses[0]! : { $or: clauses };
  }

  if (actor.role === "SERVICE_MANAGER") {
    if (!actor.scopeDirectionId || !actor.scopeServiceId) {
      return { _id: EMPTY_OBJECT_ID };
    }

    const clauses: Record<string, unknown>[] = [
      {
        directionId: actor.scopeDirectionId,
        serviceId: actor.scopeServiceId,
      },
    ];

    if (actor.agentId) {
      clauses.push({ agentId: actor.agentId });
    }

    return clauses.length === 1 ? clauses[0]! : { $or: clauses };
  }

  if (!actor.agentId) {
    return { _id: EMPTY_OBJECT_ID };
  }

  return { agentId: actor.agentId };
}

function recordMatchesScope(
  attendance: AttendanceDocument,
  actor: AttendanceActor,
): boolean {
  if (isGlobalAttendanceRole(actor.role)) {
    return true;
  }

  if (!actor.isConfigured) {
    return false;
  }

  if (actor.role === "DIRECTION") {
    return (
      sameId(attendance.directionId, actor.scopeDirectionId) ||
      sameId(attendance.agentId, actor.agentId)
    );
  }

  if (actor.role === "SERVICE_MANAGER") {
    return (
      sameId(attendance.agentId, actor.agentId) ||
      (sameId(attendance.directionId, actor.scopeDirectionId) &&
        sameId(attendance.serviceId, actor.scopeServiceId))
    );
  }

  return sameId(attendance.agentId, actor.agentId);
}

export function assertCanReadAttendance(
  attendance: AttendanceDocument,
  actor: AttendanceActor,
): void {
  if (!recordMatchesScope(attendance, actor)) {
    throw new AppError(
      "Vous n'êtes pas autorisé à consulter ce pointage.",
      403,
      "ATTENDANCE_READ_FORBIDDEN",
    );
  }
}

export function assertCanManageAttendance(
  attendance: AttendanceDocument,
  actor: AttendanceActor,
): void {
  if (actor.role !== "TENANT_ADMIN") {
    throw new AppError(
      "Seul l'administrateur peut corriger un pointage.",
      403,
      "ATTENDANCE_CORRECTION_ADMIN_ONLY",
    );
  }

  if (!recordMatchesScope(attendance, actor)) {
    throw new AppError(
      "Ce pointage ne relève pas de votre périmètre de gestion.",
      403,
      "ATTENDANCE_SCOPE_FORBIDDEN",
    );
  }
}

export function assertCanDeleteAttendance(
  _attendance: AttendanceDocument,
  actor: AttendanceActor,
): void {
  if (actor.role !== "TENANT_ADMIN") {
    throw new AppError(
      "Seul l'administrateur peut supprimer définitivement un pointage.",
      403,
      "ATTENDANCE_DELETE_ADMIN_ONLY",
    );
  }
}

export function assertCanCreateAttendanceForAgent(
  actor: AttendanceActor,
  _target: {
    agentId: Types.ObjectId;
    directionId: Types.ObjectId;
    serviceId: Types.ObjectId | null;
  },
): void {
  if (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER") {
    return;
  }

  ensureActorConfigured(actor);

  throw new AppError(
    "La création manuelle de pointage est réservée à la RH et à l'administrateur.",
    403,
    "ATTENDANCE_MANUAL_CREATE_RH_ADMIN_ONLY",
  );
}

export function requireOwnAttendanceAgent(
  actor: AttendanceActor,
): Types.ObjectId {
  if (!actor.agentId) {
    throw new AppError(
      "Votre compte doit être lié à une fiche Agent active pour utiliser le pointage personnel.",
      403,
      "ATTENDANCE_SELF_SERVICE_PROFILE_REQUIRED",
    );
  }

  return actor.agentId;
}

export function requireOwnAttendanceScope(actor: AttendanceActor): {
  agentId: Types.ObjectId;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
} {
  const agentId = requireOwnAttendanceAgent(actor);

  if (!actor.directionId) {
    throw new AppError(
      "Votre fiche Agent personnelle doit être rattachée à une Direction pour pointer.",
      403,
      "ATTENDANCE_SELF_DIRECTION_REQUIRED",
    );
  }

  return {
    agentId,
    directionId: actor.directionId,
    serviceId: actor.serviceId ?? null,
  };
}
