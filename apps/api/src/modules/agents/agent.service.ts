import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { OrganizationUnitModel } from "../organisation/organization.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import {
  assertCanDeleteAgent,
  assertCanManageAgents,
  assertCanReadAgent,
  getAgentScopeFilter,
  type AgentActor,
} from "./agent.access.js";
import { AgentModel } from "./agent.model.js";
import type {
  AddAgentHistoryInput,
  CreateAgentInput,
  ListAgentsQuery,
  UpdateAgentInput,
} from "./agent.schema.js";
import type { AgentDocument, PublicAgent } from "./agent.types.js";

type MongoFilter = Record<string, unknown>;

function cleanOptionalText(value?: string): string | undefined {
  const cleanedValue = value?.trim();

  return cleanedValue || undefined;
}

function cleanOptionalDate(value?: string): Date | undefined {
  const cleanedValue = value?.trim();

  return cleanedValue ? new Date(cleanedValue) : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sameId(
  first?: Types.ObjectId | string | null,
  second?: Types.ObjectId | string | null,
): boolean {
  return Boolean(first && second && first.toString() === second.toString());
}

function sameDateKey(
  first?: Date | null,
  second?: Date | null,
): boolean {
  if (!first || !second) {
    return !first && !second;
  }

  return first.toISOString().slice(0, 10) === second.toISOString().slice(0, 10);
}

function serializeAgent(agent: AgentDocument): PublicAgent {
  return {
    id: agent.id,
    hasPhoto: Boolean(agent.photoAssetId),
    photoRevision: agent.photoRevision ?? 0,
    tenantId: agent.tenantId.toString(),

    firstName: agent.firstName,
    lastName: agent.lastName,
    fullName: `${agent.firstName} ${agent.lastName}`.trim(),
    matricule: agent.matricule,

    phone: agent.phone,
    email: agent.email,
    address: agent.address,

    jobTitle: agent.jobTitle,
    grade: agent.grade,
    category: agent.category,

    directionId: agent.directionId.toString(),
    serviceId: agent.serviceId ? agent.serviceId.toString() : null,

    supervisorAgentId: agent.supervisorAgentId
      ? agent.supervisorAgentId.toString()
      : null,

    userId: agent.userId ? agent.userId.toString() : null,

    employmentStatus: agent.employmentStatus,
    contractType: agent.contractType,
    employmentStartDate: agent.employmentStartDate.toISOString(),
    employmentEndDate: agent.employmentEndDate?.toISOString(),

    contractEndAlert90SentAt:
      agent.contractEndAlert90SentAt?.toISOString(),
    contractEndAlert90ReferenceDate:
      agent.contractEndAlert90ReferenceDate?.toISOString(),

    documents: agent.documents.map((document) => ({
      title: document.title,
      category: document.category,
      fileUrl: document.fileUrl,
      expiresAt: document.expiresAt?.toISOString(),
      uploadedAt: document.uploadedAt.toISOString(),
    })),

    history: agent.history.map((entry) => ({
      eventType: entry.eventType,
      eventDate: entry.eventDate.toISOString(),
      description: entry.description,
      note: entry.note,
      createdByUserId: entry.createdByUserId?.toString(),
    })),

    createdAt: agent.createdAt?.toISOString(),
    updatedAt: agent.updatedAt?.toISOString(),
  };
}

async function ensureDirectionExists(
  tenant: TenantDocument,
  directionId: string,
): Promise<void> {
  const directionExists = await OrganizationUnitModel.exists({
    _id: directionId,
    tenantId: tenant._id,
    type: "DIRECTION",
    status: "ACTIVE",
  });

  if (!directionExists) {
    throw new AppError(
      "La Direction sélectionnée est introuvable ou inactive.",
      400,
      "AGENT_DIRECTION_NOT_FOUND",
    );
  }
}

async function ensureServiceMatchesDirection(input: {
  tenant: TenantDocument;
  directionId: string;
  serviceId?: string | null;
}): Promise<void> {
  if (!input.serviceId) {
    return;
  }

  const serviceExists = await OrganizationUnitModel.exists({
    _id: input.serviceId,
    tenantId: input.tenant._id,
    type: "SERVICE",
    parentId: input.directionId,
    status: "ACTIVE",
  });

  if (!serviceExists) {
    throw new AppError(
      "Le Service sélectionné ne correspond pas à cette Direction ou est inactif.",
      400,
      "AGENT_SERVICE_INVALID",
    );
  }
}

async function ensureSupervisorExists(input: {
  tenant: TenantDocument;
  supervisorAgentId?: string | null;
  currentAgentId?: string;
}): Promise<void> {
  if (!input.supervisorAgentId) {
    return;
  }

  if (input.supervisorAgentId === input.currentAgentId) {
    throw new AppError(
      "Un agent ne peut pas être son propre supérieur hiérarchique.",
      400,
      "AGENT_SELF_SUPERVISOR",
    );
  }

  const supervisorExists = await AgentModel.exists({
    _id: input.supervisorAgentId,
    tenantId: input.tenant._id,
    employmentStatus: "ACTIVE",
  });

  if (!supervisorExists) {
    throw new AppError(
      "Le supérieur hiérarchique sélectionné est introuvable ou inactif.",
      400,
      "AGENT_SUPERVISOR_NOT_FOUND",
    );
  }
}

async function ensureUserAvailable(input: {
  tenant: TenantDocument;
  userId?: string | null;
  currentAgentId?: string;
}): Promise<void> {
  if (!input.userId) {
    return;
  }

  const userExists = await UserModel.exists({
    _id: input.userId,
    tenantId: input.tenant._id,
    isActive: true,
  });

  if (!userExists) {
    throw new AppError(
      "Le compte utilisateur sélectionné est introuvable ou inactif.",
      400,
      "AGENT_USER_NOT_FOUND",
    );
  }

  const agentFilter: MongoFilter = {
    tenantId: input.tenant._id,
    userId: input.userId,
  };

  if (input.currentAgentId) {
    agentFilter._id = {
      $ne: input.currentAgentId,
    };
  }

  const anotherAgentUsesUser = await AgentModel.exists(agentFilter);

  if (anotherAgentUsesUser) {
    throw new AppError(
      "Ce compte utilisateur est déjà rattaché à un autre agent.",
      409,
      "AGENT_USER_ALREADY_LINKED",
    );
  }
}

function applyQueryFiltersInScope(input: {
  filter: MongoFilter;
  actor: AgentActor;
  query: ListAgentsQuery;
}): void {
  const { filter, actor, query } = input;

  if (query.employmentStatus) {
    filter.employmentStatus = query.employmentStatus;
  }

  if (
    query.directionId &&
    (actor.role === "TENANT_ADMIN" || actor.role === "RH_MANAGER")
  ) {
    filter.directionId = query.directionId;
  }

  if (query.serviceId) {
    if (
      actor.role === "TENANT_ADMIN" ||
      actor.role === "RH_MANAGER" ||
      actor.role === "DIRECTION"
    ) {
      filter.serviceId = query.serviceId;
    }
  }

  if (query.search) {
    const searchPattern = new RegExp(escapeRegex(query.search), "i");

    filter.$or = [
      { firstName: searchPattern },
      { lastName: searchPattern },
      { matricule: searchPattern },
      { email: searchPattern },
      { jobTitle: searchPattern },
    ];
  }
}

export async function createAgent(
  tenant: TenantDocument,
  actor: AgentActor,
  input: CreateAgentInput,
): Promise<PublicAgent> {
  assertCanManageAgents(actor);

  await ensureDirectionExists(tenant, input.directionId);

  await ensureServiceMatchesDirection({
    tenant,
    directionId: input.directionId,
    serviceId: input.serviceId,
  });

  await ensureSupervisorExists({
    tenant,
    supervisorAgentId: input.supervisorAgentId,
  });

  await ensureUserAvailable({
    tenant,
    userId: input.userId,
  });

  const agent = await AgentModel.create({
    tenantId: tenant._id,

    firstName: input.firstName,
    lastName: input.lastName,
    matricule: input.matricule,

    phone: input.phone,
    email: cleanOptionalText(input.email)?.toLowerCase(),
    address: cleanOptionalText(input.address),

    jobTitle: input.jobTitle,
    grade: cleanOptionalText(input.grade),
    category: cleanOptionalText(input.category),

    directionId: new Types.ObjectId(input.directionId),

    serviceId: input.serviceId ? new Types.ObjectId(input.serviceId) : null,

    supervisorAgentId: input.supervisorAgentId
      ? new Types.ObjectId(input.supervisorAgentId)
      : null,

    userId: input.userId ? new Types.ObjectId(input.userId) : null,

    employmentStatus: input.employmentStatus,
    contractType: input.contractType,
    employmentStartDate: new Date(input.employmentStartDate),
    employmentEndDate: cleanOptionalDate(input.employmentEndDate),

    documents: [],

    history: [
      {
        eventType: "CREATED",
        eventDate: new Date(),
        description: "Création du dossier agent.",
        createdByUserId: actor.userId,
      },
    ],
  });

  return serializeAgent(agent);
}

export async function getAgentById(
  tenant: TenantDocument,
  actor: AgentActor,
  agentId: string,
): Promise<PublicAgent> {
  const agent = await AgentModel.findOne({
    _id: agentId,
    tenantId: tenant._id,
  }).exec();

  if (!agent) {
    throw new AppError(
      "L'agent demandé est introuvable.",
      404,
      "AGENT_NOT_FOUND",
    );
  }

  assertCanReadAgent(agent, actor);

  return serializeAgent(agent);
}

export async function listAgents(
  tenant: TenantDocument,
  actor: AgentActor,
  query: ListAgentsQuery,
): Promise<{
  items: PublicAgent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const filter: MongoFilter = {
    tenantId: tenant._id,
    ...getAgentScopeFilter(actor),
  };

  applyQueryFiltersInScope({
    filter,
    actor,
    query,
  });

  const skip = (query.page - 1) * query.limit;

  const [agents, total] = await Promise.all([
    AgentModel.find(filter)
      .sort({
        lastName: 1,
        firstName: 1,
      })
      .skip(skip)
      .limit(query.limit)
      .exec(),

    AgentModel.countDocuments(filter).exec(),
  ]);

  return {
    items: agents.map(serializeAgent),

    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getAgentStats(
  tenant: TenantDocument,
  actor: AgentActor,
): Promise<{
  total: number;
  active: number;
  inactive: number;
  onLeave: number;
  suspended: number;
  left: number;
}> {
  const baseFilter: MongoFilter = {
    tenantId: tenant._id,
    ...getAgentScopeFilter(actor),
  };

  const rows = await AgentModel.aggregate<{
    _id: string;
    count: number;
  }>([
    {
      $match: baseFilter,
    },
    {
      $group: {
        _id: "$employmentStatus",
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  const stats = {
    total: 0,
    active: 0,
    inactive: 0,
    onLeave: 0,
    suspended: 0,
    left: 0,
  };

  rows.forEach((row) => {
    stats.total += row.count;

    if (row._id === "ACTIVE") {
      stats.active = row.count;
    }

    if (row._id === "INACTIVE") {
      stats.inactive = row.count;
    }

    if (row._id === "ON_LEAVE") {
      stats.onLeave = row.count;
    }

    if (row._id === "SUSPENDED") {
      stats.suspended = row.count;
    }

    if (row._id === "LEFT") {
      stats.left = row.count;
    }
  });

  return stats;
}

export async function updateAgent(
  tenant: TenantDocument,
  actor: AgentActor,
  agentId: string,
  input: UpdateAgentInput,
): Promise<PublicAgent> {
  assertCanManageAgents(actor);

  const agent = await AgentModel.findOne({
    _id: agentId,
    tenantId: tenant._id,
  }).exec();

  if (!agent) {
    throw new AppError(
      "L'agent demandé est introuvable.",
      404,
      "AGENT_NOT_FOUND",
    );
  }

  const nextDirectionId = input.directionId ?? agent.directionId.toString();

  const nextServiceId =
    input.serviceId !== undefined
      ? input.serviceId
      : agent.serviceId?.toString() ?? null;

  if (input.directionId) {
    await ensureDirectionExists(tenant, input.directionId);
  }

  await ensureServiceMatchesDirection({
    tenant,
    directionId: nextDirectionId,
    serviceId: nextServiceId,
  });

  if (input.supervisorAgentId !== undefined) {
    await ensureSupervisorExists({
      tenant,
      supervisorAgentId: input.supervisorAgentId,
      currentAgentId: agent.id,
    });
  }

  if (input.userId !== undefined) {
    await ensureUserAvailable({
      tenant,
      userId: input.userId,
      currentAgentId: agent.id,
    });
  }

  if (input.firstName !== undefined) {
    agent.firstName = input.firstName;
  }

  if (input.lastName !== undefined) {
    agent.lastName = input.lastName;
  }

  if (input.matricule !== undefined) {
    agent.matricule = input.matricule;
  }

  if (input.phone !== undefined) {
    agent.phone = input.phone;
  }

  if (input.email !== undefined) {
    agent.email = cleanOptionalText(input.email)?.toLowerCase();
  }

  if (input.address !== undefined) {
    agent.address = cleanOptionalText(input.address);
  }

  if (input.jobTitle !== undefined) {
    agent.jobTitle = input.jobTitle;
  }

  if (input.grade !== undefined) {
    agent.grade = cleanOptionalText(input.grade);
  }

  if (input.category !== undefined) {
    agent.category = cleanOptionalText(input.category);
  }

  if (input.directionId !== undefined) {
    agent.directionId = new Types.ObjectId(input.directionId);
  }

  if (input.serviceId !== undefined) {
    agent.serviceId = input.serviceId
      ? new Types.ObjectId(input.serviceId)
      : null;
  }

  if (input.supervisorAgentId !== undefined) {
    agent.supervisorAgentId = input.supervisorAgentId
      ? new Types.ObjectId(input.supervisorAgentId)
      : null;
  }

  if (input.userId !== undefined) {
    agent.userId = input.userId ? new Types.ObjectId(input.userId) : null;
  }

  if (input.employmentStatus !== undefined) {
    agent.employmentStatus = input.employmentStatus;
  }

  if (input.contractType !== undefined) {
    agent.contractType = input.contractType;
  }

  if (input.employmentStartDate !== undefined) {
    agent.employmentStartDate = new Date(input.employmentStartDate);
  }

  if (input.employmentEndDate !== undefined) {
    const previousEmploymentEndDate = agent.employmentEndDate ?? null;
    const nextEmploymentEndDate = cleanOptionalDate(input.employmentEndDate) ?? null;

    agent.employmentEndDate = nextEmploymentEndDate ?? undefined;

    if (!sameDateKey(previousEmploymentEndDate, nextEmploymentEndDate)) {
      agent.contractEndAlert90SentAt = undefined;
      agent.contractEndAlert90ReferenceDate = undefined;
    }
  }

  await agent.save();

  return serializeAgent(agent);
}

export async function deleteAgent(
  tenant: TenantDocument,
  actor: AgentActor,
  agentId: string,
): Promise<{
  deletedAgentId: string;
  unlinkedUsers: number;
}> {
  assertCanDeleteAgent(actor);

  const agent = await AgentModel.findOne({
    _id: agentId,
    tenantId: tenant._id,
  }).exec();

  if (!agent) {
    throw new AppError(
      "L'agent demandé est introuvable.",
      404,
      "AGENT_NOT_FOUND",
    );
  }

  if (sameId(agent._id, actor.agentId)) {
    throw new AppError(
      "Vous ne pouvez pas supprimer l'Agent lié à votre propre compte administrateur.",
      409,
      "AGENT_DELETE_SELF_FORBIDDEN",
    );
  }

  const subordinateExists = await AgentModel.exists({
    tenantId: tenant._id,
    supervisorAgentId: agent._id,
  });

  if (subordinateExists) {
    throw new AppError(
      "Cet agent est renseigné comme supérieur hiérarchique d'un ou plusieurs agents. Réaffectez d'abord ces agents avant suppression.",
      409,
      "AGENT_DELETE_HAS_SUBORDINATES",
    );
  }

  const usersLinkedByAgentId = await UserModel.updateMany(
    {
      tenantId: tenant._id,
      agentId: agent._id,
    },
    {
      $set: {
        agentId: null,
      },
    },
  ).exec();

  let usersLinkedByLegacyUserId = 0;

  if (agent.userId) {
    const legacyUserUpdate = await UserModel.updateOne(
      {
        _id: agent.userId,
        tenantId: tenant._id,
      },
      {
        $set: {
          agentId: null,
        },
      },
    ).exec();

    usersLinkedByLegacyUserId = legacyUserUpdate.modifiedCount ?? 0;
  }

  await AgentModel.deleteOne({
    _id: agent._id,
    tenantId: tenant._id,
  }).exec();

  return {
    deletedAgentId: agent.id,
    unlinkedUsers:
      (usersLinkedByAgentId.modifiedCount ?? 0) + usersLinkedByLegacyUserId,
  };
}

export async function addAgentHistoryEntry(
  tenant: TenantDocument,
  actor: AgentActor,
  agentId: string,
  input: AddAgentHistoryInput,
): Promise<PublicAgent> {
  assertCanManageAgents(actor);

  const agent = await AgentModel.findOne({
    _id: agentId,
    tenantId: tenant._id,
  }).exec();

  if (!agent) {
    throw new AppError(
      "L'agent demandé est introuvable.",
      404,
      "AGENT_NOT_FOUND",
    );
  }

  agent.history.push({
    eventType: input.eventType,
    eventDate: new Date(input.eventDate),
    description: input.description,
    note: cleanOptionalText(input.note),
    createdByUserId: actor.userId,
  });

  await agent.save();

  return serializeAgent(agent);
}
