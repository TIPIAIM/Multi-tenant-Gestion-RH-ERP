import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import {
  OrganizationUnitModel,
} from "../organisation/organization.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import type { TaskDocument } from "./task.types.js";

export type TaskActorRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

export type TaskActor = {
  userId: Types.ObjectId;
  fullName: string;
  role: TaskActorRole;
  agentId?: Types.ObjectId;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
  isConfigured: boolean;
  configurationMessage?: string;
};

type TaskScopeFilter = Record<string, unknown>;

type LeanUserForTask = {
  _id: Types.ObjectId;
  fullName?: string;
  email?: string;
  role?: string;
  agentId?: Types.ObjectId | string | null;
};

type LeanAgentForTask = {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
};

type LeanOrgUnitForTask = {
  _id: Types.ObjectId;
  type?: "DIRECTION" | "SERVICE";
  parentId?: Types.ObjectId | null;
  managerUserId?: Types.ObjectId | null;
};

const EMPTY_OBJECT_ID = new Types.ObjectId(
  "000000000000000000000000",
);

const acceptedRoles: TaskActorRole[] = [
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

/**
 * RH_MANAGER garde une vue globale, mais uniquement en lecture.
 * Il ne faut plus confondre "global" avec "écriture globale".
 */
function isGlobalTaskReadRole(role: TaskActorRole): boolean {
  return role === "TENANT_ADMIN" || role === "RH_MANAGER";
}

function getAgentDisplayName(
  agent?: LeanAgentForTask | null,
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
}): Promise<LeanOrgUnitForTask | null> {
  return (await (OrganizationUnitModel as any)
    .findOne({
      tenantId: input.tenantId,
      type: "DIRECTION",
      status: "ACTIVE",
      managerUserId: input.userId,
    })
    .select("_id type parentId managerUserId")
    .lean()
    .exec()) as LeanOrgUnitForTask | null;
}

async function resolveManagedService(input: {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<LeanOrgUnitForTask | null> {
  return (await (OrganizationUnitModel as any)
    .findOne({
      tenantId: input.tenantId,
      type: "SERVICE",
      status: "ACTIVE",
      managerUserId: input.userId,
    })
    .select("_id type parentId managerUserId")
    .lean()
    .exec()) as LeanOrgUnitForTask | null;
}

async function resolveAgentByUser(input: {
  tenantId: Types.ObjectId;
  user: LeanUserForTask;
}): Promise<LeanAgentForTask | null> {
  const byUserId = (await (AgentModel as any)
    .findOne({
      tenantId: input.tenantId,
      userId: input.user._id,
      employmentStatus: "ACTIVE",
    })
    .select(
      "_id firstName lastName fullName email directionId serviceId",
    )
    .lean()
    .exec()) as LeanAgentForTask | null;

  if (byUserId) return byUserId;

  if (input.user.email) {
    const byEmail = (await (AgentModel as any)
      .findOne({
        tenantId: input.tenantId,
        email: input.user.email.toLowerCase(),
        employmentStatus: "ACTIVE",
      })
      .select(
        "_id firstName lastName fullName email directionId serviceId",
      )
      .lean()
      .exec()) as LeanAgentForTask | null;

    if (byEmail) return byEmail;
  }

  if (!input.user.agentId) return null;

  return (await (AgentModel as any)
    .findOne({
      _id: input.user.agentId,
      tenantId: input.tenantId,
      employmentStatus: "ACTIVE",
    })
    .select(
      "_id firstName lastName fullName email directionId serviceId",
    )
    .lean()
    .exec()) as LeanAgentForTask | null;
}

function buildUnconfiguredActor(input: {
  user: LeanUserForTask;
  role: TaskActorRole;
  message: string;
}): TaskActor {
  return {
    userId: input.user._id,
    fullName:
      input.user.fullName?.trim() || "Utilisateur FADES",
    role: input.role,
    isConfigured: false,
    configurationMessage: input.message,
  };
}

export async function resolveTaskActor(
  tenant: TenantDocument,
  userId: string,
): Promise<TaskActor> {
  const tenantId = tenant._id as Types.ObjectId;

  const user = (await (UserModel as any)
    .findOne({
      _id: userId,
      tenantId,
      isActive: true,
    })
    .select("_id fullName email role agentId")
    .lean()
    .exec()) as LeanUserForTask | null;

  if (!user) {
    throw new AppError(
      "Votre session utilisateur est invalide ou inactive.",
      401,
      "TASK_ACTOR_NOT_FOUND",
    );
  }

  const role = user.role as TaskActorRole;

  if (!acceptedRoles.includes(role)) {
    throw new AppError(
      "Votre rôle ne permet pas d'accéder au module Tâches.",
      403,
      "TASK_ROLE_NOT_ALLOWED",
    );
  }

  if (isGlobalTaskReadRole(role)) {
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

    const agent = await resolveAgentByUser({ tenantId, user });

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

    const agent = await resolveAgentByUser({ tenantId, user });

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

  const agent = await resolveAgentByUser({ tenantId, user });

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

function ensureActorConfigured(actor: TaskActor): void {
  if (!actor.isConfigured) {
    throw new AppError(
      actor.configurationMessage ||
        "Votre périmètre Tâches n'est pas encore configuré.",
      403,
      "TASK_SCOPE_NOT_CONFIGURED",
    );
  }
}

export function getTaskScopeFilter(
  actor: TaskActor,
): TaskScopeFilter {
  if (isGlobalTaskReadRole(actor.role)) {
    return {};
  }

  if (!actor.isConfigured) {
    return { _id: EMPTY_OBJECT_ID };
  }

  if (actor.role === "DIRECTION") {
    return actor.directionId
      ? { directionId: actor.directionId }
      : { _id: EMPTY_OBJECT_ID };
  }

  if (actor.role === "SERVICE_MANAGER") {
    return actor.directionId && actor.serviceId
      ? {
          directionId: actor.directionId,
          serviceId: actor.serviceId,
        }
      : { _id: EMPTY_OBJECT_ID };
  }

  return actor.agentId
    ? { assignedToAgentId: actor.agentId }
    : { _id: EMPTY_OBJECT_ID };
}

function taskMatchesActorScope(
  task: TaskDocument,
  actor: TaskActor,
): boolean {
  if (isGlobalTaskReadRole(actor.role)) return true;
  if (!actor.isConfigured) return false;

  if (actor.role === "DIRECTION") {
    return sameId(task.directionId, actor.directionId);
  }

  if (actor.role === "SERVICE_MANAGER") {
    return (
      sameId(task.directionId, actor.directionId) &&
      sameId(task.serviceId, actor.serviceId)
    );
  }

  return sameId(task.assignedToAgentId, actor.agentId);
}

export function canManageTask(
  task: TaskDocument,
  actor: TaskActor,
): boolean {
  if (actor.role === "RH_MANAGER") return false;
  if (actor.role === "AGENT") return false;
  if (actor.role === "TENANT_ADMIN") return true;
  return taskMatchesActorScope(task, actor);
}

export function canUpdateTaskProgress(
  task: TaskDocument,
  actor: TaskActor,
): boolean {
  if (actor.role === "RH_MANAGER") return false;

  if (actor.role === "AGENT") {
    return Boolean(
      actor.isConfigured &&
        actor.agentId &&
        sameId(task.assignedToAgentId, actor.agentId),
    );
  }

  return canManageTask(task, actor);
}

export function canSubmitTaskKpi(
  task: TaskDocument,
  actor: TaskActor,
): boolean {
  if (
    actor.role === "RH_MANAGER" ||
    task.status === "CANCELLED"
  ) {
    return false;
  }

  return Boolean(
    actor.isConfigured &&
      actor.agentId &&
      sameId(task.assignedToAgentId, actor.agentId),
  );
}

export function canDownloadTaskKpiFile(
  task: TaskDocument,
  actor: TaskActor,
): boolean {
  /**
   * Le téléchargement d'une preuve KPI est une opération de lecture.
   *
   * TENANT_ADMIN :
   * - accès global.
   *
   * RH_MANAGER :
   * - consultation globale des tâches et des preuves KPI ;
   * - aucune modification de la tâche ou du KPI.
   *
   * DIRECTION / SERVICE_MANAGER :
   * - téléchargement uniquement dans leur périmètre organisationnel.
   *
   * AGENT :
   * - téléchargement uniquement pour ses propres tâches.
   *
   * Le statut de la tâche ou du KPI ne retire jamais le droit de
   * re-télécharger une preuve déjà déposée.
   */
  if (
    actor.role === "TENANT_ADMIN" ||
    actor.role === "RH_MANAGER"
  ) {
    return true;
  }

  if (
    actor.agentId &&
    sameId(task.assignedToAgentId, actor.agentId)
  ) {
    return true;
  }

  if (
    actor.role === "DIRECTION" ||
    actor.role === "SERVICE_MANAGER"
  ) {
    return taskMatchesActorScope(task, actor);
  }

  return false;
}

export function canCommentTask(
  task: TaskDocument,
  actor: TaskActor,
): boolean {
  if (actor.role === "RH_MANAGER") return false;
  return taskMatchesActorScope(task, actor);
}

export function assertCanReadTask(
  task: TaskDocument,
  actor: TaskActor,
): void {
  if (!taskMatchesActorScope(task, actor)) {
    throw new AppError(
      "Vous n'êtes pas autorisé à consulter cette tâche.",
      403,
      "TASK_READ_FORBIDDEN",
    );
  }
}

export function assertCanManageTask(
  task: TaskDocument,
  actor: TaskActor,
): void {
  if (actor.role === "RH_MANAGER") {
    throw new AppError(
      "Le rôle RH dispose d'un accès en lecture seule aux tâches des services.",
      403,
      "TASK_RH_READ_ONLY",
    );
  }

  if (!canManageTask(task, actor)) {
    throw new AppError(
      "Cette tâche ne relève pas de votre périmètre de gestion.",
      403,
      "TASK_SCOPE_FORBIDDEN",
    );
  }
}

export function assertCanUpdateTaskProgress(
  task: TaskDocument,
  actor: TaskActor,
): void {
  if (!canUpdateTaskProgress(task, actor)) {
    throw new AppError(
      actor.role === "RH_MANAGER"
        ? "Le rôle RH ne peut pas modifier l'avancement des tâches."
        : "Vous n'êtes pas autorisé à modifier l'avancement de cette tâche.",
      403,
      "TASK_PROGRESS_FORBIDDEN",
    );
  }
}

export function assertCanSubmitTaskKpi(
  task: TaskDocument,
  actor: TaskActor,
): void {
  if (!canSubmitTaskKpi(task, actor)) {
    throw new AppError(
      actor.role === "RH_MANAGER"
        ? "Le rôle RH peut consulter les KPI mais ne peut pas les renseigner."
        : "Seul l'Agent responsable de la tâche peut renseigner le KPI demandé.",
      403,
      "TASK_KPI_SUBMIT_FORBIDDEN",
    );
  }
}

export function assertCanDownloadTaskKpiFile(
  task: TaskDocument,
  actor: TaskActor,
): void {
  if (!canDownloadTaskKpiFile(task, actor)) {
    throw new AppError(
      "Vous n'êtes pas autorisé à télécharger cette pièce KPI.",
      403,
      "TASK_KPI_DOWNLOAD_FORBIDDEN",
    );
  }
}

export function assertCanCommentTask(
  task: TaskDocument,
  actor: TaskActor,
): void {
  if (!canCommentTask(task, actor)) {
    throw new AppError(
      actor.role === "RH_MANAGER"
        ? "Le rôle RH dispose d'un accès en lecture seule et ne peut pas publier de commentaire."
        : "Vous n'êtes pas autorisé à commenter cette tâche.",
      403,
      "TASK_COMMENT_FORBIDDEN",
    );
  }
}

export function assertCanCreateTaskInScope(
  actor: TaskActor,
  input: {
    directionId: string;
    serviceId?: string | null;
  },
): void {
  if (actor.role === "RH_MANAGER") {
    throw new AppError(
      "Le rôle RH dispose d'un accès en lecture seule aux tâches des services.",
      403,
      "TASK_RH_READ_ONLY",
    );
  }

  if (actor.role === "TENANT_ADMIN") return;

  ensureActorConfigured(actor);

  if (actor.role === "AGENT") {
    throw new AppError(
      "Un agent ne peut pas créer une tâche organisationnelle.",
      403,
      "TASK_CREATE_FORBIDDEN",
    );
  }

  if (actor.role === "DIRECTION") {
    if (!sameId(actor.directionId, input.directionId)) {
      throw new AppError(
        "Vous pouvez uniquement créer des tâches dans votre Direction.",
        403,
        "TASK_DIRECTION_SCOPE_FORBIDDEN",
      );
    }

    return;
  }

  if (
    !sameId(actor.directionId, input.directionId) ||
    !sameId(actor.serviceId, input.serviceId)
  ) {
    throw new AppError(
      "Vous pouvez uniquement créer des tâches dans votre Service.",
      403,
      "TASK_SERVICE_SCOPE_FORBIDDEN",
    );
  }
}

export function assertCanAssignTaskToAgent(
  actor: TaskActor,
  assignee: {
    _id?: Types.ObjectId | string | null;
    id?: Types.ObjectId | string | null;
    directionId?: Types.ObjectId | string | null;
    serviceId?: Types.ObjectId | string | null;
  },
): void {
  if (actor.role === "RH_MANAGER") {
    throw new AppError(
      "Le rôle RH ne peut pas attribuer ou modifier une tâche.",
      403,
      "TASK_RH_READ_ONLY",
    );
  }

  if (actor.role === "TENANT_ADMIN") return;

  ensureActorConfigured(actor);

  if (actor.role === "AGENT") {
    throw new AppError(
      "Un agent ne peut pas attribuer une tâche organisationnelle.",
      403,
      "TASK_ASSIGN_FORBIDDEN",
    );
  }

  if (actor.role === "DIRECTION") {
    if (!actor.directionId) {
      throw new AppError(
        "Votre compte Direction n'est rattaché à aucune Direction active.",
        403,
        "TASK_DIRECTION_SCOPE_REQUIRED",
      );
    }

    if (!sameId(actor.directionId, assignee.directionId)) {
      throw new AppError(
        "Vous ne pouvez attribuer une tâche qu'à un Agent de votre Direction.",
        403,
        "TASK_ASSIGN_DIRECTION_SCOPE_FORBIDDEN",
      );
    }

    return;
  }

  if (!actor.directionId || !actor.serviceId) {
    throw new AppError(
      "Votre compte Chef de service n'est rattaché à aucun Service actif.",
      403,
      "TASK_SERVICE_SCOPE_REQUIRED",
    );
  }

  if (
    !sameId(actor.directionId, assignee.directionId) ||
    !sameId(actor.serviceId, assignee.serviceId)
  ) {
    throw new AppError(
      "Vous ne pouvez attribuer une tâche qu'à un Agent de votre Service.",
      403,
      "TASK_ASSIGN_SERVICE_SCOPE_FORBIDDEN",
    );
  }
}
