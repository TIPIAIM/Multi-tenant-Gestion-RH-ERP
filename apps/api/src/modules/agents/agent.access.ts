import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { OrganizationUnitModel } from "../organisation/organization.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import { AgentModel } from "./agent.model.js";
import type { AgentDocument } from "./agent.types.js";

export type AgentActorRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

export type AgentActor = {
  userId: Types.ObjectId;
  fullName: string;
  role: AgentActorRole;

  agentId?: Types.ObjectId;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;

  isConfigured: boolean;
  configurationMessage?: string;
};

export type PublicAgentScope = {
  role: AgentActorRole;
  userId: string;
  agentId: string | null;
  directionId: string | null;
  serviceId: string | null;
  fullName: string;
  isGlobalScope: boolean;
  isConfigured: boolean;
  configurationMessage?: string;
};

type LeanUserForAgentScope = {
  _id: Types.ObjectId;
  fullName?: string;
  email?: string;
  role?: string;
  agentId?: Types.ObjectId | string | null;
};

type LeanAgentForAgentScope = {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
  userId?: Types.ObjectId | null;
};

type LeanOrgUnitForAgentScope = {
  _id: Types.ObjectId;
  type?: "DIRECTION" | "SERVICE";
  parentId?: Types.ObjectId | null;
  managerUserId?: Types.ObjectId | null;
};

export type AgentScopeFilter = Record<string, unknown>;

const EMPTY_OBJECT_ID = new Types.ObjectId(
  "000000000000000000000000",
);

const acceptedAgentRoles: AgentActorRole[] = [
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
    first && second && first.toString() === second.toString(),
  );
}

function isGlobalAgentRole(role: AgentActorRole): boolean {
  return role === "TENANT_ADMIN" || role === "RH_MANAGER";
}

function getAgentDisplayName(
  agent?: LeanAgentForAgentScope | null,
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
}): Promise<LeanOrgUnitForAgentScope | null> {
  return (await (OrganizationUnitModel as any)
    .findOne({
      tenantId: input.tenantId,
      type: "DIRECTION",
      status: "ACTIVE",
      managerUserId: input.userId,
    })
    .select("_id type parentId managerUserId")
    .lean()
    .exec()) as LeanOrgUnitForAgentScope | null;
}

async function resolveManagedService(input: {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<LeanOrgUnitForAgentScope | null> {
  return (await (OrganizationUnitModel as any)
    .findOne({
      tenantId: input.tenantId,
      type: "SERVICE",
      status: "ACTIVE",
      managerUserId: input.userId,
    })
    .select("_id type parentId managerUserId")
    .lean()
    .exec()) as LeanOrgUnitForAgentScope | null;
}

async function resolveAgentByUser(input: {
  tenantId: Types.ObjectId;
  user: LeanUserForAgentScope;
}): Promise<LeanAgentForAgentScope | null> {
  const byUserId = (await (AgentModel as any)
    .findOne({
      tenantId: input.tenantId,
      userId: input.user._id,
      employmentStatus: "ACTIVE",
    })
    .select(
      "_id firstName lastName fullName email directionId serviceId userId",
    )
    .lean()
    .exec()) as LeanAgentForAgentScope | null;

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
        "_id firstName lastName fullName email directionId serviceId userId",
      )
      .lean()
      .exec()) as LeanAgentForAgentScope | null;

    if (byEmail) {
      return byEmail;
    }
  }

  if (!input.user.agentId) {
    return null;
  }

  return (await (AgentModel as any)
    .findOne({
      _id: input.user.agentId,
      tenantId: input.tenantId,
      employmentStatus: "ACTIVE",
    })
    .select(
      "_id firstName lastName fullName email directionId serviceId userId",
    )
    .lean()
    .exec()) as LeanAgentForAgentScope | null;
}

function buildUnconfiguredActor(input: {
  user: LeanUserForAgentScope;
  role: AgentActorRole;
  message: string;
}): AgentActor {
  return {
    userId: input.user._id,
    fullName:
      input.user.fullName?.trim() || "Utilisateur FADES",
    role: input.role,
    isConfigured: false,
    configurationMessage: input.message,
  };
}

export async function resolveAgentActor(
  tenant: TenantDocument,
  userId: string,
): Promise<AgentActor> {
  const tenantId = tenant._id as Types.ObjectId;

  const user = (await (UserModel as any)
    .findOne({
      _id: userId,
      tenantId,
      isActive: true,
    })
    .select("_id fullName email role agentId")
    .lean()
    .exec()) as LeanUserForAgentScope | null;

  if (!user) {
    throw new AppError(
      "Votre session utilisateur est invalide ou inactive.",
      401,
      "AGENT_ACTOR_NOT_FOUND",
    );
  }

  const role = user.role as AgentActorRole;

  if (!acceptedAgentRoles.includes(role)) {
    throw new AppError(
      "Votre rôle ne permet pas d'accéder au module Agents.",
      403,
      "AGENT_ROLE_NOT_ALLOWED",
    );
  }

  if (isGlobalAgentRole(role)) {
    return {
      userId: user._id,
      fullName:
        user.fullName?.trim() || "Utilisateur FADES",
      role,
      isConfigured: true,
    };
  }

  if (role === "DIRECTION") {
    const managedDirection = await resolveManagedDirection({
      tenantId,
      userId: user._id,
    });

    if (managedDirection?._id) {
      return {
        userId: user._id,
        fullName:
          user.fullName?.trim() || "Utilisateur FADES",
        role,
        directionId: managedDirection._id,
        serviceId: null,
        isConfigured: true,
      };
    }

    const agent = await resolveAgentByUser({
      tenantId,
      user,
    });

    if (agent?.directionId) {
      return {
        userId: user._id,
        fullName:
          user.fullName?.trim() ||
          getAgentDisplayName(agent) ||
          "Utilisateur FADES",
        role,
        agentId: agent._id,
        directionId: agent.directionId,
        serviceId: null,
        isConfigured: true,
      };
    }

    return buildUnconfiguredActor({
      user,
      role,
      message:
        "Ce compte Direction n'est rattaché à aucune Direction active.",
    });
  }

  if (role === "SERVICE_MANAGER") {
    const managedService = await resolveManagedService({
      tenantId,
      userId: user._id,
    });

    if (managedService?._id && managedService.parentId) {
      return {
        userId: user._id,
        fullName:
          user.fullName?.trim() || "Utilisateur FADES",
        role,
        directionId: managedService.parentId,
        serviceId: managedService._id,
        isConfigured: true,
      };
    }

    const agent = await resolveAgentByUser({
      tenantId,
      user,
    });

    if (agent?.directionId && agent.serviceId) {
      return {
        userId: user._id,
        fullName:
          user.fullName?.trim() ||
          getAgentDisplayName(agent) ||
          "Utilisateur FADES",
        role,
        agentId: agent._id,
        directionId: agent.directionId,
        serviceId: agent.serviceId,
        isConfigured: true,
      };
    }

    return buildUnconfiguredActor({
      user,
      role,
      message:
        "Ce compte Chef de service n'est rattaché à aucun Service actif.",
    });
  }

  const agent = await resolveAgentByUser({
    tenantId,
    user,
  });

  if (agent?._id && agent.directionId) {
    return {
      userId: user._id,
      fullName:
        user.fullName?.trim() ||
        getAgentDisplayName(agent) ||
        "Utilisateur FADES",
      role,
      agentId: agent._id,
      directionId: agent.directionId,
      serviceId: agent.serviceId ?? null,
      isConfigured: true,
    };
  }

  return buildUnconfiguredActor({
    user,
    role,
    message:
      "Ce compte Agent n'est rattaché à aucune fiche Agent active.",
  });
}

export function toPublicAgentScope(
  actor: AgentActor,
): PublicAgentScope {
  return {
    role: actor.role,
    userId: actor.userId.toString(),
    agentId: actor.agentId?.toString() ?? null,
    directionId: actor.directionId?.toString() ?? null,
    serviceId: actor.serviceId?.toString() ?? null,
    fullName: actor.fullName,
    isGlobalScope: isGlobalAgentRole(actor.role),
    isConfigured: actor.isConfigured,
    configurationMessage: actor.configurationMessage,
  };
}

export function getAgentScopeFilter(
  actor: AgentActor,
): AgentScopeFilter {
  if (isGlobalAgentRole(actor.role)) {
    return {};
  }

  if (!actor.isConfigured) {
    return {
      _id: EMPTY_OBJECT_ID,
    };
  }

  if (actor.role === "DIRECTION") {
    if (!actor.directionId) {
      return {
        _id: EMPTY_OBJECT_ID,
      };
    }

    return {
      directionId: actor.directionId,
    };
  }

  if (actor.role === "SERVICE_MANAGER") {
    if (!actor.directionId || !actor.serviceId) {
      return {
        _id: EMPTY_OBJECT_ID,
      };
    }

    return {
      directionId: actor.directionId,
      serviceId: actor.serviceId,
    };
  }

  if (!actor.agentId) {
    return {
      _id: EMPTY_OBJECT_ID,
    };
  }

  return {
    _id: actor.agentId,
  };
}

export function assertCanReadAgent(
  agent: AgentDocument,
  actor: AgentActor,
): void {
  if (isGlobalAgentRole(actor.role)) {
    return;
  }

  if (!actor.isConfigured) {
    throw new AppError(
      actor.configurationMessage ||
        "Votre périmètre Agents n'est pas encore configuré.",
      403,
      "AGENT_SCOPE_NOT_CONFIGURED",
    );
  }

  if (
    actor.role === "DIRECTION" &&
    sameId(agent.directionId, actor.directionId)
  ) {
    return;
  }

  if (
    actor.role === "SERVICE_MANAGER" &&
    sameId(agent.directionId, actor.directionId) &&
    sameId(agent.serviceId, actor.serviceId)
  ) {
    return;
  }

  if (sameId(agent._id, actor.agentId)) {
    return;
  }

  throw new AppError(
    "Cet agent ne relève pas de votre périmètre.",
    403,
    "AGENT_SCOPE_FORBIDDEN",
  );
}

export function assertCanManageAgents(
  actor: AgentActor,
): void {
  if (isGlobalAgentRole(actor.role)) {
    return;
  }

  throw new AppError(
    "Seuls l'administrateur et le responsable RH peuvent créer ou modifier les dossiers Agents.",
    403,
    "AGENT_MANAGE_FORBIDDEN",
  );
}

export function assertCanDeleteAgent(
  actor: AgentActor,
): void {
  if (actor.role === "TENANT_ADMIN") {
    return;
  }

  throw new AppError(
    "Seul l'administrateur peut supprimer définitivement un dossier Agent.",
    403,
    "AGENT_DELETE_FORBIDDEN",
  );
}