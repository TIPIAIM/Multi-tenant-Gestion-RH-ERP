import bcrypt from "bcryptjs";
import { Types, type UpdateQuery } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { AuthSessionModel } from "../auth/auth-session.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserAdminActivityModel } from "./user-admin-activity.model.js";
import type {
  PublicUserAdminActivity,
  UserAdminActivityAction,
} from "./user-admin-activity.types.js";
import { UserModel } from "./user.model.js";
import type {
  PublicLinkedAgent,
  PublicManagedUser,
  PublicUserSession,
  UserRole,
} from "./user.types.js";
import type {
  CreateUserInput,
  ListUsersQuery,
  ResetPasswordInput,
  UpdateUserInput,
} from "./user-management.schema.js";

type MongoFilter = Record<string, any>;

type AdminActor = {
  userId: string;
  fullName?: string;
  role?: UserRole;
};

type LeanUser = {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  agentId?: Types.ObjectId | null;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  emailVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type LeanAgent = {
  _id: Types.ObjectId;
  userId?: Types.ObjectId | string | null;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  matricule?: string;
  directionId?: Types.ObjectId | null;
  serviceId?: Types.ObjectId | null;
  directionName?: string | null;
  serviceName?: string | null;
  employmentStatus?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toId(value?: Types.ObjectId | string | null): string | null {
  return value ? value.toString() : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@$";
  let output = "";

  for (let index = 0; index < 12; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return output;
}

function linkedAgentName(agent: LeanAgent): string {
  return (
    agent.fullName?.trim() ||
    [agent.firstName, agent.lastName].filter(Boolean).join(" ").trim() ||
    "Agent FADES"
  );
}

function serializeLinkedAgent(agent?: LeanAgent | null): PublicLinkedAgent | null {
  if (!agent) return null;

  return {
    id: agent._id.toString(),
    fullName: linkedAgentName(agent),
    matricule: agent.matricule,
    directionId: toId(agent.directionId),
    serviceId: toId(agent.serviceId),
    directionName: agent.directionName ?? null,
    serviceName: agent.serviceName ?? null,
    employmentStatus: agent.employmentStatus,
  };
}

function serializeUser(
  user: LeanUser,
  linkedAgent?: PublicLinkedAgent | null,
): PublicManagedUser {
  return {
    id: user._id.toString(),
    tenantId: user.tenantId.toString(),
    agentId: toId(user.agentId),
    linkedAgent: linkedAgent ?? null,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}

function normalizeAgentDocument(raw: Record<string, unknown>): LeanAgent {
  const direction = raw.directionId as
    | { _id?: Types.ObjectId; name?: string }
    | Types.ObjectId
    | null
    | undefined;

  const service = raw.serviceId as
    | { _id?: Types.ObjectId; name?: string }
    | Types.ObjectId
    | null
    | undefined;

  const directionObject =
    direction && typeof direction === "object" && "name" in direction
      ? (direction as { _id?: Types.ObjectId; name?: string })
      : null;

  const serviceObject =
    service && typeof service === "object" && "name" in service
      ? (service as { _id?: Types.ObjectId; name?: string })
      : null;

  return {
    _id: raw._id as Types.ObjectId,
    userId: raw.userId as Types.ObjectId | string | null | undefined,
    firstName: raw.firstName as string | undefined,
    lastName: raw.lastName as string | undefined,
    fullName: raw.fullName as string | undefined,
    matricule: raw.matricule as string | undefined,
    directionId:
      directionObject?._id ??
      ((direction && !("name" in Object(direction)))
        ? (direction as Types.ObjectId)
        : null),
    serviceId:
      serviceObject?._id ??
      ((service && !("name" in Object(service)))
        ? (service as Types.ObjectId)
        : null),
    directionName: directionObject?.name ?? null,
    serviceName: serviceObject?.name ?? null,
    employmentStatus: raw.employmentStatus as string | undefined,
  };
}

async function getLinkedAgentsMap(
  tenantId: Types.ObjectId,
  users: LeanUser[],
): Promise<{
  byAgentId: Map<string, PublicLinkedAgent>;
  byLegacyUserId: Map<string, PublicLinkedAgent>;
}> {
  const agentIds = [
    ...new Set(
      users
        .map((user) => user.agentId?.toString())
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const userIds = users.map((user) => user._id.toString());

  if (agentIds.length === 0 && userIds.length === 0) {
    return {
      byAgentId: new Map(),
      byLegacyUserId: new Map(),
    };
  }

  /**
   * Double lecture :
   * 1. Nouvelle liaison propre : User.agentId.
   * 2. Ancienne liaison héritée : Agent.userId.
   * Cela évite de perdre les liaisons existantes avant migration.
   */
  const agents = (await (AgentModel as any).find({
    tenantId,
    $or: [
      ...(agentIds.length > 0 ? [{ _id: { $in: agentIds } }] : []),
      ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : []),
    ],
  })
    .select(
      "_id userId firstName lastName fullName matricule directionId serviceId employmentStatus",
    )
    .populate("directionId", "name")
    .populate("serviceId", "name")
    .lean()
    .exec()) as unknown as Array<Record<string, unknown>>;

  const byAgentId = new Map<string, PublicLinkedAgent>();
  const byLegacyUserId = new Map<string, PublicLinkedAgent>();

  for (const rawAgent of agents) {
    const agent = normalizeAgentDocument(rawAgent);
    const publicAgent = serializeLinkedAgent(agent);

    if (!publicAgent) continue;

    byAgentId.set(publicAgent.id, publicAgent);

    if (agent.userId) {
      byLegacyUserId.set(agent.userId.toString(), publicAgent);
    }
  }

  return { byAgentId, byLegacyUserId };
}

async function resolveLinkedAgent(
  tenantId: Types.ObjectId,
  agentId?: string | null,
): Promise<LeanAgent | null> {
  if (!agentId) return null;

  const agent = (await (AgentModel as any).findOne({
    _id: agentId,
    tenantId,
    employmentStatus: "ACTIVE",
  })
    .select(
      "_id firstName lastName fullName matricule directionId serviceId employmentStatus",
    )
    .lean()
    .exec()) as LeanAgent | null;

  if (!agent) {
    throw new AppError(
      "L’Agent sélectionné est introuvable ou inactif.",
      400,
      "USER_LINKED_AGENT_NOT_FOUND",
    );
  }

  return agent;
}

async function recordActivity(input: {
  tenantId: Types.ObjectId;
  actor: AdminActor;
  target: LeanUser;
  action: UserAdminActivityAction;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await (UserAdminActivityModel as any).create({
    tenantId: input.tenantId,
    actorUserId: new Types.ObjectId(input.actor.userId),
    actorName: input.actor.fullName || "Administrateur FADES",
    targetUserId: input.target._id,
    targetName: input.target.fullName,
    action: input.action,
    message: input.message,
    metadata: input.metadata ?? {},
  });
}

async function assertNotLastActiveTenantAdmin(input: {
  tenantId: Types.ObjectId;
  user: LeanUser;
  nextRole?: UserRole;
  nextIsActive?: boolean;
}): Promise<void> {
  const currentlyAdmin = input.user.role === "TENANT_ADMIN";
  const wouldRemainAdmin =
    (input.nextRole ?? input.user.role) === "TENANT_ADMIN" &&
    (input.nextIsActive ?? input.user.isActive) === true;

  if (!currentlyAdmin || wouldRemainAdmin) return;

  const otherActiveAdmins = await (UserModel as any).countDocuments({
    tenantId: input.tenantId,
    role: "TENANT_ADMIN",
    isActive: true,
    _id: { $ne: input.user._id },
  });

  if (otherActiveAdmins === 0) {
    throw new AppError(
      "Impossible de retirer ou désactiver le dernier administrateur actif.",
      400,
      "LAST_TENANT_ADMIN_FORBIDDEN",
    );
  }
}

async function serializeUsersWithAgents(
  tenantId: Types.ObjectId,
  users: LeanUser[],
): Promise<PublicManagedUser[]> {
  const { byAgentId, byLegacyUserId } = await getLinkedAgentsMap(tenantId, users);

  return users.map((user) => {
    const linkedAgent = user.agentId
      ? byAgentId.get(user.agentId.toString())
      : byLegacyUserId.get(user._id.toString());

    return serializeUser(user, linkedAgent ?? null);
  });
}

export async function getUserStats(tenant: TenantDocument) {
  const tenantId = tenant._id;

  const [total, active, inactive, linked, byRole] = await Promise.all([
    (UserModel as any).countDocuments({ tenantId }),
    (UserModel as any).countDocuments({ tenantId, isActive: true }),
    (UserModel as any).countDocuments({ tenantId, isActive: false }),
    (UserModel as any).countDocuments({ tenantId, agentId: { $ne: null } }),
    UserModel.aggregate<{ _id: UserRole; count: number }>([
      { $match: { tenantId } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    total,
    active,
    inactive,
    linkedToAgent: linked,
    unlinkedToAgent: Math.max(total - linked, 0),
    byRole: byRole.map((item) => ({
      role: item._id,
      count: item.count,
    })),
  };
}


export async function listAgentOptionsForUserLink(
  tenant: TenantDocument,
): Promise<PublicLinkedAgent[]> {
  /**
   * Liste complète des Agents actifs pour le formulaire Utilisateur.
   * Aucun filtre sur userId : le même Agent RH peut être affecté à plusieurs
   * comptes utilisateurs sans disparaître de la liste.
   */
  const agents = (await (AgentModel as any).find({
    tenantId: tenant._id,
    employmentStatus: "ACTIVE",
  })
    .select(
      "_id firstName lastName fullName matricule directionId serviceId employmentStatus",
    )
    .populate("directionId", "name")
    .populate("serviceId", "name")
    .sort({ firstName: 1, lastName: 1, fullName: 1 })
    .lean()
    .exec()) as unknown as Array<Record<string, unknown>>;

  return agents
    .map((rawAgent) => serializeLinkedAgent(normalizeAgentDocument(rawAgent)))
    .filter((agent): agent is PublicLinkedAgent => Boolean(agent));
}

export async function listUsers(
  tenant: TenantDocument,
  query: ListUsersQuery,
) {
  const tenantId = tenant._id;
  const filter: MongoFilter = { tenantId };

  const search = query.search ?? query.q;

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ fullName: regex }, { email: regex }];
  }

  if (query.role) {
    filter.role = query.role;
  }

  if (typeof query.isActive === "boolean") {
    filter.isActive = query.isActive;
  } else if (query.active === "true") {
    filter.isActive = true;
  } else if (query.active === "false") {
    filter.isActive = false;
  } else if (query.status === "ACTIVE") {
    filter.isActive = true;
  } else if (query.status === "INACTIVE") {
    filter.isActive = false;
  }

  if (query.agentId) {
    filter.agentId = new Types.ObjectId(query.agentId);
  } else if (query.linkedOnly === true || query.linked === "LINKED") {
    filter.agentId = { $ne: null };
  } else if (query.linked === "UNLINKED") {
    filter.$and = [
      ...(Array.isArray(filter.$and) ? filter.$and : []),
      {
        $or: [
          { agentId: null },
          { agentId: { $exists: false } },
        ],
      },
    ];
  }

  const sort: Record<string, 1 | -1> =
    query.sort === "CREATED_ASC"
      ? { createdAt: 1 }
      : query.sort === "NAME_ASC"
        ? { fullName: 1 }
        : query.sort === "NAME_DESC"
          ? { fullName: -1 }
          : query.sort === "ROLE_ASC"
            ? { role: 1, fullName: 1 }
            : { createdAt: -1 };

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    (UserModel as any).find(filter)
      .sort(sort)
      .skip(skip)
      .limit(query.limit)
      .lean()
      .exec() as Promise<LeanUser[]>,
    (UserModel as any).countDocuments(filter),
  ]);

  return {
    items: await serializeUsersWithAgents(tenantId, items),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getUserById(
  tenant: TenantDocument,
  id: string,
): Promise<PublicManagedUser> {
  const user = (await (UserModel as any).findOne({
    _id: id,
    tenantId: tenant._id,
  })
    .lean()
    .exec()) as LeanUser | null;

  if (!user) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  const [serialized] = await serializeUsersWithAgents(tenant._id, [user]);

  if (!serialized) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  return serialized;
}

export async function createManagedUser(
  tenant: TenantDocument,
  actor: AdminActor,
  input: CreateUserInput,
) {
  const tenantId = tenant._id;
  const email = normalizeEmail(input.email);
  const linkedAgent = await resolveLinkedAgent(tenantId, input.agentId);

  const existing = await (UserModel as any).exists({ tenantId, email });

  if (existing) {
    throw new AppError(
      "Un compte existe déjà avec cette adresse email.",
      409,
      "USER_EMAIL_ALREADY_EXISTS",
    );
  }

  const temporaryPassword = input.password || randomPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const createdDocument = await (UserModel as any).create({
    tenantId,
    agentId: linkedAgent?._id ?? null,
    fullName: input.fullName,
    email,
    passwordHash,
    role: input.role,
    isActive: input.isActive ?? true,
    mustChangePassword: input.mustChangePassword ?? true,
  });

  if (!createdDocument) {
    throw new AppError("Impossible de créer le compte utilisateur.", 500, "USER_CREATE_FAILED");
  }

  const created = createdDocument.toObject() as LeanUser;

  await recordActivity({
    tenantId,
    actor,
    target: created,
    action: linkedAgent ? "USER_AGENT_LINKED" : "USER_CREATED",
    message: linkedAgent
      ? `Compte créé et lié à l’Agent ${linkedAgentName(linkedAgent)}.`
      : "Compte utilisateur créé.",
    metadata: {
      role: input.role,
      agentId: linkedAgent?._id?.toString() ?? null,
    },
  });

  return {
    user: serializeUser(created, serializeLinkedAgent(linkedAgent)),
    temporaryPassword: input.password ? undefined : temporaryPassword,
  };
}

export async function updateManagedUser(
  tenant: TenantDocument,
  actor: AdminActor,
  id: string,
  input: UpdateUserInput,
): Promise<PublicManagedUser> {
  const tenantId = tenant._id;

  const current = (await (UserModel as any).findOne({ _id: id, tenantId })
    .lean()
    .exec()) as LeanUser | null;

  if (!current) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  const update: UpdateQuery<LeanUser> = {};
  let linkedAgent: LeanAgent | null | undefined;

  if (typeof input.fullName === "string") update.fullName = input.fullName;

  if (typeof input.email === "string") {
    const email = normalizeEmail(input.email);
    const exists = await (UserModel as any).exists({
      tenantId,
      email,
      _id: { $ne: current._id },
    });

    if (exists) {
      throw new AppError(
        "Un autre compte utilise déjà cette adresse email.",
        409,
        "USER_EMAIL_ALREADY_EXISTS",
      );
    }

    update.email = email;
  }

  if (input.role) update.role = input.role;
  if (typeof input.isActive === "boolean") update.isActive = input.isActive;
  if (typeof input.mustChangePassword === "boolean") {
    update.mustChangePassword = input.mustChangePassword;
  }

  if (Object.prototype.hasOwnProperty.call(input, "agentId")) {
    linkedAgent = await resolveLinkedAgent(tenantId, input.agentId ?? null);
    update.agentId = linkedAgent?._id ?? null;
  }

  await assertNotLastActiveTenantAdmin({
    tenantId,
    user: current,
    nextRole: input.role,
    nextIsActive: input.isActive,
  });

  const updated = (await (UserModel as any).findOneAndUpdate(
    { _id: id, tenantId },
    { $set: update },
    { new: true },
  )
    .lean()
    .exec()) as LeanUser | null;

  if (!updated) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  const agentFieldChanged = Object.prototype.hasOwnProperty.call(input, "agentId");
  const action: UserAdminActivityAction = agentFieldChanged
    ? updated.agentId
      ? "USER_AGENT_LINKED"
      : "USER_AGENT_UNLINKED"
    : "USER_UPDATED";

  await recordActivity({
    tenantId,
    actor,
    target: updated,
    action,
    message: agentFieldChanged
      ? updated.agentId
        ? "Liaison Agent mise à jour."
        : "Liaison Agent retirée."
      : "Compte utilisateur mis à jour.",
    metadata: {
      changedFields: Object.keys(input),
      agentId: toId(updated.agentId),
    },
  });

  const [serialized] = await serializeUsersWithAgents(tenantId, [updated]);

  if (!serialized) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  return serialized;
}

export async function setUserActiveStatus(
  tenant: TenantDocument,
  actor: AdminActor,
  id: string,
  isActive: boolean,
): Promise<PublicManagedUser> {
  const current = (await (UserModel as any).findOne({
    _id: id,
    tenantId: tenant._id,
  })
    .lean()
    .exec()) as LeanUser | null;

  if (!current) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  if (actor.userId === id && !isActive) {
    throw new AppError(
      "Vous ne pouvez pas désactiver votre propre compte.",
      400,
      "USER_SELF_DISABLE_FORBIDDEN",
    );
  }

  await assertNotLastActiveTenantAdmin({
    tenantId: tenant._id,
    user: current,
    nextIsActive: isActive,
  });

  const updated = (await (UserModel as any).findOneAndUpdate(
    { _id: id, tenantId: tenant._id },
    { $set: { isActive } },
    { new: true },
  )
    .lean()
    .exec()) as LeanUser | null;

  if (!updated) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  if (!isActive) {
    await (AuthSessionModel as any).updateMany(
      {
        userId: updated._id,
        tenantId: tenant._id,
        revokedAt: null,
      },
      { $set: { revokedAt: new Date() } },
    );
  }

  await recordActivity({
    tenantId: tenant._id,
    actor,
    target: updated,
    action: "USER_STATUS_CHANGED",
    message: isActive ? "Compte activé." : "Compte désactivé.",
  });

  const [serialized] = await serializeUsersWithAgents(tenant._id, [updated]);

  if (!serialized) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  return serialized;
}

export async function toggleUserActiveStatus(
  tenant: TenantDocument,
  actor: AdminActor,
  id: string,
): Promise<PublicManagedUser> {
  const current = (await (UserModel as any).findOne({
    _id: id,
    tenantId: tenant._id,
  })
    .lean()
    .exec()) as LeanUser | null;

  if (!current) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  return setUserActiveStatus(tenant, actor, id, !current.isActive);
}

export async function setUserEmailVerified(
  tenant: TenantDocument,
  actor: AdminActor,
  id: string,
  emailVerified = true,
): Promise<PublicManagedUser> {
  const updated = (await (UserModel as any).findOneAndUpdate(
    { _id: id, tenantId: tenant._id },
    { $set: { emailVerifiedAt: emailVerified ? new Date() : null } },
    { new: true },
  )
    .lean()
    .exec()) as LeanUser | null;

  if (!updated) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  await recordActivity({
    tenantId: tenant._id,
    actor,
    target: updated,
    action: "USER_EMAIL_VERIFIED",
    message: emailVerified
      ? "Email marqué comme vérifié par l’administration."
      : "Vérification email retirée par l’administration.",
  });

  const [serialized] = await serializeUsersWithAgents(tenant._id, [updated]);

  if (!serialized) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  return serialized;
}

export async function forceVerifyUserEmail(
  tenant: TenantDocument,
  actor: AdminActor,
  id: string,
): Promise<PublicManagedUser> {
  return setUserEmailVerified(tenant, actor, id, true);
}

export async function resetUserPassword(
  tenant: TenantDocument,
  actor: AdminActor,
  id: string,
  input: ResetPasswordInput,
) {
  const user = (await (UserModel as any).findOne({ _id: id, tenantId: tenant._id })
    .lean()
    .exec()) as LeanUser | null;

  if (!user) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  const temporaryPassword = input.password || randomPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const updated = (await (UserModel as any).findOneAndUpdate(
    { _id: id, tenantId: tenant._id },
    {
      $set: {
        passwordHash,
        mustChangePassword: input.mustChangePassword ?? true,
      },
    },
    { new: true },
  )
    .lean()
    .exec()) as LeanUser | null;

  if (!updated) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  await (AuthSessionModel as any).updateMany(
    {
      userId: updated._id,
      tenantId: tenant._id,
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } },
  );

  await recordActivity({
    tenantId: tenant._id,
    actor,
    target: updated,
    action: "USER_PASSWORD_RESET",
    message: "Mot de passe réinitialisé.",
  });

  const [serialized] = await serializeUsersWithAgents(tenant._id, [updated]);

  return {
    user: serialized,
    temporaryPassword,
  };
}

export async function listUserSessions(
  tenant: TenantDocument,
  id: string,
): Promise<PublicUserSession[]> {
  const sessions = await (AuthSessionModel as any).find({
    tenantId: tenant._id,
    userId: id,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
    .exec();

  return (sessions as unknown as Record<string, unknown>[]).map((session) => ({
    id: (session._id as Types.ObjectId).toString(),
    createdAt: (session.createdAt as Date | undefined)?.toISOString?.(),
    lastUsedAt: (session.lastUsedAt as Date | undefined)?.toISOString?.(),
    expiresAt: (session.expiresAt as Date | undefined)?.toISOString?.(),
    ip: session.ip as string | undefined,
    userAgent: session.userAgent as string | undefined,
    isRevoked: Boolean(session.revokedAt || session.isRevoked),
  }));
}

export async function revokeUserSessions(
  tenant: TenantDocument,
  actor: AdminActor,
  id: string,
): Promise<{ revokedCount: number }> {
  const user = (await (UserModel as any).findOne({ _id: id, tenantId: tenant._id })
    .lean()
    .exec()) as LeanUser | null;

  if (!user) {
    throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
  }

  const result = await (AuthSessionModel as any).updateMany(
    {
      tenantId: tenant._id,
      userId: id,
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } },
  );

  await recordActivity({
    tenantId: tenant._id,
    actor,
    target: user,
    action: "USER_SESSIONS_REVOKED",
    message: "Sessions utilisateur révoquées.",
    metadata: {
      revokedCount: result.modifiedCount ?? 0,
    },
  });

  return { revokedCount: result.modifiedCount ?? 0 };
}

export async function listUserActivities(
  tenant: TenantDocument,
  id: string,
  limit = 50,
): Promise<PublicUserAdminActivity[]> {
  const activities = await (UserAdminActivityModel as any).find({
    tenantId: tenant._id,
    targetUserId: id,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  return (activities as unknown as Record<string, unknown>[]).map((activity) => ({
    id: (activity._id as Types.ObjectId).toString(),
    actorName: activity.actorName as string,
    targetName: activity.targetName as string,
    action: activity.action as UserAdminActivityAction,
    message: activity.message as string,
    metadata: activity.metadata as Record<string, unknown> | undefined,
    createdAt: (activity.createdAt as Date | undefined)?.toISOString?.(),
  }));
}
