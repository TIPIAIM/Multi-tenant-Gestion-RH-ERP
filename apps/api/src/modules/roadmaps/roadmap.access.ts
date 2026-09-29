import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { UserModel } from "../users/user.model.js";
import type { UserRole } from "../users/user.types.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import type {
  RoadmapApprovalType,
  RoadmapDocument,
} from "./roadmap.types.js";

type RoadmapScopeFilter = Record<string, unknown>;

export type RoadmapActor = {
  userId: Types.ObjectId;
  fullName: string;
  role: UserRole;
  agentId?: Types.ObjectId;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
};

export type PublicRoadmapScope = {
  role: UserRole;
  userId: string;
  fullName: string;
  agentId: string | null;
  directionId: string | null;
  serviceId: string | null;
  isGlobalScope: boolean;
  isConfigured: boolean;
  canCreate: boolean;
  configurationMessage?: string;
};

type LeanUserForRoadmap = {
  _id: Types.ObjectId;
  fullName?: string;
  role: UserRole;
  agentId?: Types.ObjectId | null;
};

type LeanAgentForRoadmap = {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
};

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

async function resolveAgentForUser(
  tenantId: Types.ObjectId,
  user: LeanUserForRoadmap,
  userId: string,
): Promise<LeanAgentForRoadmap | null> {
  if (user.agentId) {
    const linkedAgent = (await (AgentModel as any)
      .findOne({
        _id: user.agentId,
        tenantId,
        employmentStatus: "ACTIVE",
      })
      .select(
        "_id firstName lastName fullName directionId serviceId",
      )
      .lean()
      .exec()) as LeanAgentForRoadmap | null;

    if (linkedAgent) {
      return linkedAgent;
    }
  }

  return (await (AgentModel as any)
    .findOne({
      tenantId,
      userId,
      employmentStatus: "ACTIVE",
    })
    .select(
      "_id firstName lastName fullName directionId serviceId",
    )
    .lean()
    .exec()) as LeanAgentForRoadmap | null;
}

export async function resolveRoadmapActor(
  tenant: TenantDocument,
  userId: string,
): Promise<RoadmapActor> {
  const user = (await (UserModel as any)
    .findOne({
      _id: userId,
      tenantId: tenant._id,
      isActive: true,
    })
    .select("fullName role agentId")
    .lean()
    .exec()) as LeanUserForRoadmap | null;

  if (!user) {
    throw new AppError(
      "Utilisateur introuvable ou inactif.",
      401,
      "ROADMAP_ACTOR_NOT_FOUND",
    );
  }

  const agent = await resolveAgentForUser(
    tenant._id,
    user,
    userId,
  );

  return {
    userId: user._id,
    fullName:
      user.fullName?.trim() ||
      agent?.fullName?.trim() ||
      [agent?.firstName, agent?.lastName]
        .filter(Boolean)
        .join(" ") ||
      "Utilisateur FADES",
    role: user.role,
    agentId: agent?._id,
    directionId: agent?.directionId,
    serviceId: agent?.serviceId ?? null,
  };
}

export function toPublicRoadmapScope(
  actor: RoadmapActor,
): PublicRoadmapScope {
  const isGlobalScope =
    actor.role === "TENANT_ADMIN" ||
    actor.role === "RH_MANAGER";

  const isConfigured = Boolean(
    actor.agentId && actor.directionId,
  );

  const canCreate = isConfigured;

  const configurationMessage = canCreate
    ? undefined
    : "Pour créer une feuille de route personnelle, le compte connecté doit être rattaché à une fiche Agent active avec une Direction renseignée.";

  return {
    role: actor.role,
    userId: actor.userId.toString(),
    fullName: actor.fullName,
    agentId: actor.agentId?.toString() ?? null,
    directionId: actor.directionId?.toString() ?? null,
    serviceId: actor.serviceId?.toString() ?? null,
    isGlobalScope,
    isConfigured,
    canCreate,
    configurationMessage,
  };
}

export function requireOwnRoadmapOwner(
  actor: RoadmapActor,
): {
  agentId: Types.ObjectId;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
  ownerRole: UserRole;
} {
  if (!actor.agentId || !actor.directionId) {
    throw new AppError(
      "Votre compte doit être lié à un Agent actif avec une Direction avant de créer une feuille de route.",
      400,
      "ROADMAP_OWNER_PROFILE_REQUIRED",
    );
  }

  return {
    agentId: actor.agentId,
    directionId: actor.directionId,
    serviceId: actor.serviceId ?? null,
    ownerRole: actor.role,
  };
}

export function getRoadmapScopeFilter(
  actor: RoadmapActor,
): RoadmapScopeFilter {
  if (
    actor.role === "TENANT_ADMIN" ||
    actor.role === "RH_MANAGER"
  ) {
    return {};
  }

  if (!actor.agentId || !actor.directionId) {
    throw new AppError(
      "Votre compte doit être lié à un Agent actif pour accéder aux feuilles de route.",
      403,
      "ROADMAP_AGENT_PROFILE_REQUIRED",
    );
  }

  if (actor.role === "DIRECTION") {
    return {
      directionId: actor.directionId,
    };
  }

  if (actor.role === "SERVICE_MANAGER") {
    if (!actor.serviceId) {
      return {
        agentId: actor.agentId,
      };
    }

    return {
      $or: [
        {
          agentId: actor.agentId,
        },
        {
          directionId: actor.directionId,
          serviceId: actor.serviceId,
        },
      ],
    } as RoadmapScopeFilter;
  }

  return {
    agentId: actor.agentId,
  };
}

export function assertCanReadRoadmap(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): void {
  if (
    actor.role === "TENANT_ADMIN" ||
    actor.role === "RH_MANAGER"
  ) {
    return;
  }

  if (!actor.agentId || !actor.directionId) {
    throw new AppError(
      "Profil Agent requis.",
      403,
      "ROADMAP_AGENT_PROFILE_REQUIRED",
    );
  }

  if (sameId(actor.agentId, roadmap.agentId)) {
    return;
  }

  if (
    actor.role === "DIRECTION" &&
    sameId(actor.directionId, roadmap.directionId)
  ) {
    return;
  }

  if (
    actor.role === "SERVICE_MANAGER" &&
    actor.serviceId &&
    sameId(actor.directionId, roadmap.directionId) &&
    sameId(actor.serviceId, roadmap.serviceId)
  ) {
    return;
  }

  throw new AppError(
    "Cette feuille de route ne relève pas de votre périmètre.",
    403,
    "ROADMAP_SCOPE_FORBIDDEN",
  );
}

/**
 * IMPORTANT :
 * Le propriétaire métier est le COMPTE qui a créé la feuille,
 * pas seulement la fiche Agent.
 *
 * Un même Agent peut être lié à plusieurs comptes ; comparer agentId
 * permettrait à un autre compte de modifier une feuille qu'il n'a pas créée.
 */
export function isRoadmapCreator(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): boolean {
  return sameId(
    actor.userId,
    roadmap.createdByUserId,
  );
}

export function canEditRoadmap(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): boolean {
  return (
    isRoadmapCreator(actor, roadmap) &&
    ["DRAFT", "RETURNED"].includes(roadmap.status)
  );
}

export function canSubmitRoadmap(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): boolean {
  return canEditRoadmap(actor, roadmap);
}

export function assertCanManageRoadmap(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): void {
  assertCanReadRoadmap(actor, roadmap);

  if (!isRoadmapCreator(actor, roadmap)) {
    throw new AppError(
      "Seul le compte propriétaire peut rédiger, modifier ou soumettre sa propre feuille de route.",
      403,
      "ROADMAP_CREATOR_WRITE_ONLY",
    );
  }
}

/**
 * Nouveau circuit simple et lisible :
 *
 * AGENT :
 * - avec Service -> Chef de service ;
 * - sans Service -> Chef de département.
 *
 * SERVICE_MANAGER :
 * - Chef de département uniquement.
 * - AUCUNE seconde validation RH.
 *
 * DIRECTION :
 * - RH (ou Admin de secours).
 *
 * RH_MANAGER :
 * - Admin uniquement.
 *
 * TENANT_ADMIN :
 * - RH ou autre Admin, avec auto-validation interdite.
 */
export function getRequiredApprovalTypes(
  roadmap: RoadmapDocument,
): RoadmapApprovalType[] {
  if (roadmap.ownerRole === "DIRECTION") {
    return ["RH"];
  }

  if (roadmap.ownerRole === "RH_MANAGER") {
    return ["RH"];
  }

  if (roadmap.ownerRole === "TENANT_ADMIN") {
    return ["RH"];
  }

  return ["DEPARTMENT"];
}

function isImmediateReviewer(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): boolean {
  if (isRoadmapCreator(actor, roadmap)) {
    return false;
  }

  if (roadmap.ownerRole === "SERVICE_MANAGER") {
    return (
      actor.role === "DIRECTION" &&
      Boolean(actor.directionId) &&
      sameId(actor.directionId, roadmap.directionId)
    );
  }

  if (roadmap.ownerRole === "AGENT") {
    if (roadmap.serviceId) {
      return (
        actor.role === "SERVICE_MANAGER" &&
        Boolean(actor.directionId) &&
        Boolean(actor.serviceId) &&
        sameId(actor.directionId, roadmap.directionId) &&
        sameId(actor.serviceId, roadmap.serviceId)
      );
    }

    return (
      actor.role === "DIRECTION" &&
      Boolean(actor.directionId) &&
      sameId(actor.directionId, roadmap.directionId)
    );
  }

  if (roadmap.ownerRole === "DIRECTION") {
    return (
      actor.role === "RH_MANAGER" ||
      actor.role === "TENANT_ADMIN"
    );
  }

  if (roadmap.ownerRole === "RH_MANAGER") {
    return actor.role === "TENANT_ADMIN";
  }

  if (roadmap.ownerRole === "TENANT_ADMIN") {
    return (
      actor.role === "RH_MANAGER" ||
      actor.role === "TENANT_ADMIN"
    );
  }

  return false;
}

export function getActorApprovalType(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): RoadmapApprovalType {
  if (isRoadmapCreator(actor, roadmap)) {
    throw new AppError(
      "Vous ne pouvez pas valider votre propre feuille de route.",
      403,
      "ROADMAP_SELF_REVIEW_FORBIDDEN",
    );
  }

  if (!isImmediateReviewer(actor, roadmap)) {
    throw new AppError(
      "Vous pouvez consulter cette feuille, mais vous n'êtes pas son validateur hiérarchique direct.",
      403,
      "ROADMAP_REVIEW_FORBIDDEN",
    );
  }

  if (
    roadmap.ownerRole === "DIRECTION" ||
    roadmap.ownerRole === "RH_MANAGER" ||
    roadmap.ownerRole === "TENANT_ADMIN"
  ) {
    return "RH";
  }

  return "DEPARTMENT";
}

export function canReviewRoadmap(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): boolean {
  if (
    !["SUBMITTED", "PARTIALLY_APPROVED"].includes(
      roadmap.status,
    )
  ) {
    return false;
  }

  if (!isImmediateReviewer(actor, roadmap)) {
    return false;
  }

  const approvalType =
    roadmap.ownerRole === "DIRECTION" ||
    roadmap.ownerRole === "RH_MANAGER" ||
    roadmap.ownerRole === "TENANT_ADMIN"
      ? "RH"
      : "DEPARTMENT";

  if (
    approvalType === "DEPARTMENT" &&
    roadmap.departmentReview
  ) {
    return false;
  }

  if (
    approvalType === "RH" &&
    roadmap.hrReview
  ) {
    return false;
  }

  return true;
}

export function assertCanReviewRoadmap(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): RoadmapApprovalType {
  assertCanReadRoadmap(actor, roadmap);

  const approvalType =
    getActorApprovalType(actor, roadmap);

  const requiredTypes =
    getRequiredApprovalTypes(roadmap);

  if (!requiredTypes.includes(approvalType)) {
    throw new AppError(
      "Votre niveau hiérarchique peut consulter cette feuille de route, mais ne fait pas partie de son circuit de validation.",
      403,
      "ROADMAP_REVIEW_LEVEL_NOT_REQUIRED",
    );
  }

  return approvalType;
}

/**
 * Dépôt / modification KPI :
 * le propriétaire créateur uniquement.
 *
 * Aucun RH, Admin ou responsable hiérarchique ne peut modifier
 * la réalisation d'une autre personne.
 */
export function canSubmitRoadmapKpi(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): boolean {
  return (
    isRoadmapCreator(actor, roadmap) &&
    roadmap.status === "APPROVED"
  );
}

/**
 * Contrôle KPI :
 * uniquement le validateur hiérarchique direct de cette feuille.
 *
 * - Agent -> Chef de service (ou Direction sans service)
 * - Chef de service -> Direction
 * - Direction -> RH
 */
export function canReviewRoadmapKpi(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): boolean {
  return (
    roadmap.status === "APPROVED" &&
    isImmediateReviewer(actor, roadmap)
  );
}

export function assertCanReviewKpi(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): RoadmapApprovalType {
  assertCanReadRoadmap(actor, roadmap);

  if (!canReviewRoadmapKpi(actor, roadmap)) {
    throw new AppError(
      "Vous pouvez consulter les KPI de cette feuille, mais vous n'êtes pas habilité à les valider.",
      403,
      "ROADMAP_KPI_REVIEW_FORBIDDEN",
    );
  }

  return getActorApprovalType(
    actor,
    roadmap,
  );
}

/**
 * Tous les utilisateurs qui peuvent lire la feuille peuvent télécharger
 * une pièce KPI existante.
 */
export function canDownloadRoadmapKpiFile(
  actor: RoadmapActor,
  roadmap: RoadmapDocument,
): boolean {
  try {
    assertCanReadRoadmap(actor, roadmap);
    return true;
  } catch {
    return false;
  }
}

/**
 * RH n'est plus autorisé à modifier les KPI d'autrui.
 * Cette fonction reste exportée uniquement pour compatibilité éventuelle.
 */
export function canAdminAmendKpi(
  actor: RoadmapActor,
): boolean {
  return actor.role === "TENANT_ADMIN";
}

export function canCloseRoadmap(
  actor: RoadmapActor,
): boolean {
  return actor.role === "TENANT_ADMIN";
}

export function canDeleteRoadmap(
  actor: RoadmapActor,
): boolean {
  return actor.role === "TENANT_ADMIN";
}
