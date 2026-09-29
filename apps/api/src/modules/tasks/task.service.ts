import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import {
  OrganizationUnitModel,
} from "../organisation/organization.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import {
  assertCanAssignTaskToAgent,
  assertCanCommentTask,
  assertCanCreateTaskInScope,
  assertCanDownloadTaskKpiFile,
  assertCanManageTask,
  assertCanReadTask,
  assertCanSubmitTaskKpi,
  assertCanUpdateTaskProgress,
  canCommentTask,
  canDownloadTaskKpiFile,
  canManageTask,
  canSubmitTaskKpi,
  canUpdateTaskProgress,
  getTaskScopeFilter,
  type TaskActor,
} from "./task.access.js";
import {
  TaskActivityModel,
  TaskCommentModel,
  TaskModel,
  TaskSequenceModel,
} from "./task.models.js";
import type {
  AddTaskCommentInput,
  CreateTaskInput,
  ListTasksQuery,
  SubmitTaskKpiValueInput,
  TaskBoardQuery,
  TaskKpiDefinitionInput,
  UpdateTaskInput,
  UpdateTaskProgressInput,
} from "./task.schema.js";
import type {
  PublicTask,
  PublicTaskActivity,
  PublicTaskComment,
  PublicTaskKpi,
  Task,
  TaskActivityAction,
  TaskDocument,
  TaskKpi,
  TaskStatus,
} from "./task.types.js";

type MongoFilter = Record<string, any>;

type AssignedAgentOrg = {
  _id: Types.ObjectId;
  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
};

const taskKpiStorageRoot = resolve(
  process.cwd(),
  "storage",
  "private",
  "task-kpis",
);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanOptionalText(
  value?: string,
): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function cleanOptionalDate(
  value?: string,
): Date | undefined {
  const cleaned = value?.trim();
  return cleaned ? new Date(cleaned) : undefined;
}

function cleanTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function isKpiSubmitted(kpi: TaskKpi): boolean {
  if (kpi.kind === "FILE") {
    return Boolean(kpi.file);
  }

  if (kpi.kind === "NUMBER") {
    return Number.isFinite(kpi.resultNumber);
  }

  return Boolean(kpi.resultText?.trim());
}

function getTaskPermissions(
  task: TaskDocument,
  actor: TaskActor,
) {
  const canManage = canManageTask(task, actor);
  const canUpdateProgress =
    canUpdateTaskProgress(task, actor);
  const canSubmitKpi =
    canSubmitTaskKpi(task, actor);
  const canDownloadKpiFiles =
    canDownloadTaskKpiFile(task, actor);
  const canComment = canCommentTask(task, actor);

  return {
    canManage,
    canUpdateProgress,
    canSubmitKpi,
    canDownloadKpiFiles,
    canComment,
    readOnly:
      !canManage &&
      !canUpdateProgress &&
      !canSubmitKpi &&
      !canComment,
  };
}

function serializeKpi(
  kpi: TaskKpi,
  actor: TaskActor,
  task: TaskDocument,
): PublicTaskKpi {
  return {
    id: kpi._id.toString(),
    label: kpi.label,
    kind: kpi.kind,
    required: kpi.required,
    instructions: kpi.instructions,
    targetNumber: kpi.targetNumber,
    unit: kpi.unit,
    resultNumber: kpi.resultNumber,
    resultText: kpi.resultText,
    isSubmitted: isKpiSubmitted(kpi),
    submittedAt: kpi.submittedAt?.toISOString(),
    file: kpi.file
      ? {
          originalName: kpi.file.originalName,
          mimeType: kpi.file.mimeType,
          size: kpi.file.size,
          uploadedAt: kpi.file.uploadedAt.toISOString(),
        }
      : undefined,
    canDownload:
      Boolean(kpi.file) &&
      canDownloadTaskKpiFile(task, actor),
  };
}

function serializeTask(
  task: TaskDocument,
  actor: TaskActor,
): PublicTask {
  return {
    id: task.id,
    tenantId: task.tenantId.toString(),
    reference: task.reference,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    progressPercentage: task.progressPercentage,
    startDate: task.startDate?.toISOString(),
    dueDate: task.dueDate?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    directionId: task.directionId.toString(),
    serviceId: task.serviceId
      ? task.serviceId.toString()
      : null,
    assignedToAgentId:
      task.assignedToAgentId.toString(),
    createdByUserId: task.createdByUserId.toString(),
    lastUpdatedByUserId:
      task.lastUpdatedByUserId?.toString(),
    tags: task.tags,
    kpis: (task.kpis ?? []).map((kpi) =>
      serializeKpi(kpi, actor, task),
    ),
    permissions: getTaskPermissions(task, actor),
    commentCount: task.commentCount,
    lastCommentAt: task.lastCommentAt?.toISOString(),
    createdAt: task.createdAt?.toISOString(),
    updatedAt: task.updatedAt?.toISOString(),
  };
}

function serializeComment(comment: {
  id: string;
  taskId: Types.ObjectId;
  authorUserId: Types.ObjectId;
  authorName: string;
  message: string;
  createdAt?: Date;
  updatedAt?: Date;
}): PublicTaskComment {
  return {
    id: comment.id,
    taskId: comment.taskId.toString(),
    authorUserId: comment.authorUserId.toString(),
    authorName: comment.authorName,
    message: comment.message,
    createdAt: comment.createdAt?.toISOString(),
    updatedAt: comment.updatedAt?.toISOString(),
  };
}

function serializeActivity(activity: {
  id: string;
  taskId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  actorName: string;
  action: TaskActivityAction;
  summary: string;
  createdAt?: Date;
}): PublicTaskActivity {
  return {
    id: activity.id,
    taskId: activity.taskId.toString(),
    actorUserId: activity.actorUserId.toString(),
    actorName: activity.actorName,
    action: activity.action,
    summary: activity.summary,
    createdAt: activity.createdAt?.toISOString(),
  };
}

function getStatusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    TODO: "À faire",
    IN_PROGRESS: "En cours",
    BLOCKED: "Bloquée",
    COMPLETED: "Terminée",
    CANCELLED: "Annulée",
  };

  return labels[status];
}

function assertDates(
  startDate?: Date,
  dueDate?: Date,
): void {
  if (
    startDate &&
    dueDate &&
    dueDate.getTime() < startDate.getTime()
  ) {
    throw new AppError(
      "L'échéance ne peut pas être antérieure à la date de début.",
      400,
      "TASK_DATE_RANGE_INVALID",
    );
  }
}

function resolveTaskState(input: {
  currentStatus: TaskStatus;
  currentProgress: number;
  currentCompletedAt?: Date;
  requestedStatus?: TaskStatus;
  requestedProgress?: number;
}): {
  status: TaskStatus;
  progressPercentage: number;
  completedAt?: Date;
} {
  let status =
    input.requestedStatus ?? input.currentStatus;

  let progressPercentage =
    input.requestedProgress ?? input.currentProgress;

  if (
    status === "COMPLETED" ||
    progressPercentage === 100
  ) {
    return {
      status: "COMPLETED",
      progressPercentage: 100,
      completedAt: new Date(),
    };
  }

  if (
    status === "CANCELLED" &&
    progressPercentage === 100
  ) {
    throw new AppError(
      "Une tâche annulée ne peut pas être finalisée à 100%.",
      400,
      "TASK_CANCELLED_COMPLETED_CONFLICT",
    );
  }

  if (
    status === "TODO" &&
    progressPercentage > 0
  ) {
    status = "IN_PROGRESS";
  }

  if (
    status === "IN_PROGRESS" &&
    progressPercentage === 0
  ) {
    status = "TODO";
  }

  return {
    status,
    progressPercentage,
    completedAt:
      status === input.currentStatus
        ? input.currentCompletedAt
        : undefined,
  };
}

function assertRequiredKpisSubmitted(
  kpis: TaskKpi[],
): void {
  const missing = kpis.filter(
    (kpi) => kpi.required && !isKpiSubmitted(kpi),
  );

  if (missing.length === 0) return;

  throw new AppError(
    `La tâche ne peut pas être clôturée : ${missing.length} KPI obligatoire(s) reste(nt) à renseigner.`,
    400,
    "TASK_REQUIRED_KPI_PENDING",
  );
}

function normalizeKpiDefinition(
  input: TaskKpiDefinitionInput,
) {
  return {
    label: input.label.trim(),
    kind: input.kind,
    required: input.required,
    instructions:
      cleanOptionalText(input.instructions),
    targetNumber:
      input.kind === "NUMBER"
        ? input.targetNumber
        : undefined,
    unit:
      input.kind === "NUMBER"
        ? cleanOptionalText(input.unit)
        : undefined,
  };
}

function kpiDefinitionChanged(
  existing: TaskKpi,
  input: TaskKpiDefinitionInput,
): boolean {
  const normalized = normalizeKpiDefinition(input);

  return (
    existing.label !== normalized.label ||
    existing.kind !== normalized.kind ||
    existing.required !== normalized.required ||
    (existing.instructions ?? undefined) !==
      normalized.instructions ||
    existing.targetNumber !== normalized.targetNumber ||
    (existing.unit ?? undefined) !== normalized.unit
  );
}

function mergeKpiDefinitions(
  task: TaskDocument,
  definitions: TaskKpiDefinitionInput[],
): void {
  if (task.status === "COMPLETED") {
    throw new AppError(
      "Les KPI d'une tâche terminée ne peuvent plus être redéfinis.",
      400,
      "TASK_KPI_DEFINITION_LOCKED",
    );
  }

  const existingById = new Map(
    (task.kpis ?? []).map((item) => [
      item._id.toString(),
      item,
    ]),
  );

  const incomingIds = new Set(
    definitions
      .map((item) => item.id)
      .filter((value): value is string => Boolean(value)),
  );

  for (const existing of task.kpis ?? []) {
    if (
      isKpiSubmitted(existing) &&
      !incomingIds.has(existing._id.toString())
    ) {
      throw new AppError(
        "Un KPI déjà renseigné ne peut pas être supprimé.",
        400,
        "TASK_KPI_SUBMITTED_DELETE_FORBIDDEN",
      );
    }
  }

  task.kpis = definitions.map((definition) => {
    const existing = definition.id
      ? existingById.get(definition.id)
      : undefined;

    if (!existing) {
      return {
        _id: new Types.ObjectId(),
        ...normalizeKpiDefinition(definition),
      } as TaskKpi;
    }

    if (
      isKpiSubmitted(existing) &&
      kpiDefinitionChanged(existing, definition)
    ) {
      throw new AppError(
        `Le KPI « ${existing.label} » possède déjà un résultat et sa définition ne peut plus être modifiée.`,
        400,
        "TASK_KPI_SUBMITTED_DEFINITION_LOCKED",
      );
    }

    const normalized =
      normalizeKpiDefinition(definition);

    existing.label = normalized.label;
    existing.kind = normalized.kind;
    existing.required = normalized.required;
    existing.instructions = normalized.instructions;
    existing.targetNumber = normalized.targetNumber;
    existing.unit = normalized.unit;

    return existing;
  });
}

async function generateTaskReference(
  tenant: TenantDocument,
): Promise<string> {
  const year = new Date().getFullYear();

  const sequence =
    await (TaskSequenceModel as any).findOneAndUpdate(
      {
        tenantId: tenant._id,
        key: "TASK",
        year,
      },
      {
        $inc: { value: 1 },
        $setOnInsert: {
          tenantId: tenant._id,
          key: "TASK",
          year,
        },
      },
      {
        new: true,
        upsert: true,
      },
    ).exec();

  if (!sequence) {
    throw new AppError(
      "Impossible de générer la référence de la tâche.",
      500,
      "TASK_REFERENCE_GENERATION_FAILED",
    );
  }

  return `TSK-${year}-${String(sequence.value).padStart(4, "0")}`;
}

async function ensureDirectionAndService(input: {
  tenant: TenantDocument;
  directionId: string | Types.ObjectId;
  serviceId?: string | Types.ObjectId | null;
}): Promise<void> {
  const direction = await (OrganizationUnitModel as any).exists({
    _id: input.directionId,
    tenantId: input.tenant._id,
    type: "DIRECTION",
    status: "ACTIVE",
  });

  if (!direction) {
    throw new AppError(
      "La Direction de l'Agent responsable est introuvable ou inactive.",
      400,
      "TASK_DIRECTION_NOT_FOUND",
    );
  }

  if (!input.serviceId) return;

  const service = await (OrganizationUnitModel as any).exists({
    _id: input.serviceId,
    tenantId: input.tenant._id,
    parentId: input.directionId,
    type: "SERVICE",
    status: "ACTIVE",
  });

  if (!service) {
    throw new AppError(
      "Le Service de l'Agent responsable ne correspond pas à sa Direction.",
      400,
      "TASK_SERVICE_INVALID",
    );
  }
}

async function resolveAssignedAgentOrganization(input: {
  tenant: TenantDocument;
  assignedToAgentId: string;
}): Promise<AssignedAgentOrg> {
  const agent = (await (AgentModel as any)
    .findOne({
      _id: input.assignedToAgentId,
      tenantId: input.tenant._id,
      employmentStatus: "ACTIVE",
    })
    .select("_id directionId serviceId")
    .lean()
    .exec()) as AssignedAgentOrg | null;

  if (!agent) {
    throw new AppError(
      "L'Agent responsable est introuvable ou inactif.",
      400,
      "TASK_ASSIGNEE_NOT_FOUND",
    );
  }

  if (!agent.directionId) {
    throw new AppError(
      "L'Agent responsable doit être rattaché à une Direction.",
      400,
      "TASK_ASSIGNEE_DIRECTION_REQUIRED",
    );
  }

  await ensureDirectionAndService({
    tenant: input.tenant,
    directionId: agent.directionId,
    serviceId: agent.serviceId ?? null,
  });

  return {
    _id: agent._id,
    directionId: agent.directionId,
    serviceId: agent.serviceId ?? null,
  };
}

async function recordTaskActivity(input: {
  tenant: TenantDocument;
  taskId: Types.ObjectId;
  actor: TaskActor;
  action: TaskActivityAction;
  summary: string;
}): Promise<void> {
  await (TaskActivityModel as any).create({
    tenantId: input.tenant._id,
    taskId: input.taskId,
    actorUserId: input.actor.userId,
    actorName: input.actor.fullName,
    action: input.action,
    summary: input.summary,
  });
}

async function getTaskDocumentOrThrow(
  tenant: TenantDocument,
  taskId: string,
): Promise<TaskDocument> {
  const task = await (TaskModel as any)
    .findOne({
      _id: taskId,
      tenantId: tenant._id,
    })
    .select("+kpis.file.storagePath")
    .exec();

  if (!task) {
    throw new AppError(
      "La tâche demandée est introuvable.",
      404,
      "TASK_NOT_FOUND",
    );
  }

  return task;
}

function getKpiOrThrow(
  task: TaskDocument,
  kpiId: string,
): TaskKpi {
  const kpi = (task.kpis ?? []).find(
    (item) => item._id.toString() === kpiId,
  );

  if (!kpi) {
    throw new AppError(
      "Le KPI demandé est introuvable.",
      404,
      "TASK_KPI_NOT_FOUND",
    );
  }

  return kpi;
}

function applyDueFilter(
  filter: MongoFilter,
  due: string,
): void {
  if (due === "ALL") return;

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const endOfNextSevenDays = new Date(now);
  endOfNextSevenDays.setDate(
    endOfNextSevenDays.getDate() + 7,
  );
  endOfNextSevenDays.setHours(23, 59, 59, 999);

  if (due === "NO_DUE_DATE") {
    filter.dueDate = { $exists: false };
    return;
  }

  const incompleteStatuses = {
    $nin: ["COMPLETED", "CANCELLED"],
  };

  const currentAnd = Array.isArray(filter.$and)
    ? filter.$and
    : [];

  if (due === "OVERDUE") {
    filter.$and = [
      ...currentAnd,
      { dueDate: { $lt: now } },
      { status: incompleteStatuses },
    ];
    return;
  }

  if (due === "TODAY") {
    filter.$and = [
      ...currentAnd,
      {
        dueDate: {
          $gte: now,
          $lte: endOfToday,
        },
      },
      { status: incompleteStatuses },
    ];
    return;
  }

  filter.$and = [
    ...currentAnd,
    {
      dueDate: {
        $gte: now,
        $lte: endOfNextSevenDays,
      },
    },
    { status: incompleteStatuses },
  ];
}

function buildTaskFilter(input: {
  tenant: TenantDocument;
  actor: TaskActor;
  query: {
    search?: string;
    status?: TaskStatus;
    priority?: Task["priority"];
    directionId?: string;
    serviceId?: string;
    assignedToAgentId?: string;
    due: string;
  };
}): MongoFilter {
  const filter: MongoFilter = {
    tenantId: input.tenant._id,
    ...getTaskScopeFilter(input.actor),
  };

  if (input.query.status) {
    filter.status = input.query.status;
  }

  if (input.query.priority) {
    filter.priority = input.query.priority;
  }

  const isGlobalRead =
    input.actor.role === "TENANT_ADMIN" ||
    input.actor.role === "RH_MANAGER";

  if (isGlobalRead && input.query.directionId) {
    filter.directionId = input.query.directionId;
  }

  if (
    (isGlobalRead || input.actor.role === "DIRECTION") &&
    input.query.serviceId
  ) {
    filter.serviceId = input.query.serviceId;
  }

  if (input.query.assignedToAgentId) {
    filter.assignedToAgentId =
      input.query.assignedToAgentId;
  }

  if (input.query.search) {
    const searchPattern = new RegExp(
      escapeRegex(input.query.search),
      "i",
    );

    filter.$or = [
      { title: searchPattern },
      { description: searchPattern },
      { reference: searchPattern },
      { tags: searchPattern },
      { "kpis.label": searchPattern },
    ];
  }

  applyDueFilter(filter, input.query.due);

  return filter;
}

export async function createTask(
  tenant: TenantDocument,
  actor: TaskActor,
  input: CreateTaskInput,
): Promise<PublicTask> {
  assertCanCreateTaskInScope(actor, input);

  const assignedAgent =
    await resolveAssignedAgentOrganization({
      tenant,
      assignedToAgentId: input.assignedToAgentId,
    });

  assertCanAssignTaskToAgent(actor, assignedAgent);

  const startDate = cleanOptionalDate(input.startDate);
  const dueDate = cleanOptionalDate(input.dueDate);

  assertDates(startDate, dueDate);

  const taskState = resolveTaskState({
    currentStatus: "TODO",
    currentProgress: 0,
    requestedStatus: input.status,
    requestedProgress: input.progressPercentage,
  });

  const reference = await generateTaskReference(tenant);

  const kpis = input.kpis.map((definition) => ({
    _id: new Types.ObjectId(),
    ...normalizeKpiDefinition(definition),
  })) as TaskKpi[];

  if (taskState.status === "COMPLETED") {
    assertRequiredKpisSubmitted(kpis);
  }

  const task = await (TaskModel as any).create({
    tenantId: tenant._id,
    reference,
    title: input.title,
    description: cleanOptionalText(input.description),
    priority: input.priority,
    status: taskState.status,
    progressPercentage: taskState.progressPercentage,
    startDate,
    dueDate,
    completedAt: taskState.completedAt,
    directionId: assignedAgent.directionId,
    serviceId: assignedAgent.serviceId,
    assignedToAgentId: assignedAgent._id,
    createdByUserId: actor.userId,
    lastUpdatedByUserId: actor.userId,
    tags: cleanTags(input.tags),
    kpis,
    commentCount: 0,
  });

  await recordTaskActivity({
    tenant,
    taskId: task._id,
    actor,
    action: "CREATED",
    summary:
      `Tâche ${reference} créée et attribuée` +
      (kpis.length
        ? ` avec ${kpis.length} KPI demandé(s).`
        : "."),
  });

  return serializeTask(task, actor);
}

export async function getTaskById(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
): Promise<PublicTask> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanReadTask(task, actor);

  return serializeTask(task, actor);
}

export async function listTasks(
  tenant: TenantDocument,
  actor: TaskActor,
  query: ListTasksQuery,
): Promise<{
  items: PublicTask[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const filter = buildTaskFilter({
    tenant,
    actor,
    query,
  });

  const sortMap: Record<
    string,
    Record<string, 1 | -1>
  > = {
    DUE_DATE_ASC: {
      dueDate: 1,
      priority: -1,
      createdAt: -1,
    },
    UPDATED_DESC: {
      updatedAt: -1,
    },
    CREATED_DESC: {
      createdAt: -1,
    },
  };

  const selectedSort =
    sortMap[query.sort] ?? sortMap.UPDATED_DESC!;

  const skip = (query.page - 1) * query.limit;

  const [tasks, total] = await Promise.all([
    (TaskModel as any)
      .find(filter)
      .select("+kpis.file.storagePath")
      .sort(selectedSort)
      .skip(skip)
      .limit(query.limit)
      .exec(),

    (TaskModel as any).countDocuments(filter).exec(),
  ]);

  return {
    items: tasks.map((task: TaskDocument) =>
      serializeTask(task, actor),
    ),

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

export async function getTaskBoard(
  tenant: TenantDocument,
  actor: TaskActor,
  query: TaskBoardQuery,
): Promise<{
  columns: Record<TaskStatus, PublicTask[]>;
}> {
  const filter = buildTaskFilter({
    tenant,
    actor,
    query,
  });

  const tasks = await (TaskModel as any)
    .find(filter)
    .select("+kpis.file.storagePath")
    .sort({
      dueDate: 1,
      priority: -1,
      updatedAt: -1,
    })
    .limit(query.limit)
    .exec();

  const columns: Record<TaskStatus, PublicTask[]> = {
    TODO: [],
    IN_PROGRESS: [],
    BLOCKED: [],
    COMPLETED: [],
    CANCELLED: [],
  };

  tasks.forEach((task: TaskDocument) => {
    columns[task.status].push(
      serializeTask(task, actor),
    );
  });

  return { columns };
}

export async function getTaskStats(
  tenant: TenantDocument,
  actor: TaskActor,
): Promise<{
  total: number;
  todo: number;
  inProgress: number;
  blocked: number;
  completed: number;
  overdue: number;
  dueSoon: number;
}> {
  const baseFilter: MongoFilter = {
    tenantId: tenant._id,
    ...getTaskScopeFilter(actor),
  };

  const now = new Date();

  const nextSevenDays = new Date(now);
  nextSevenDays.setDate(
    nextSevenDays.getDate() + 7,
  );

  const [
    total,
    todo,
    inProgress,
    blocked,
    completed,
    overdue,
    dueSoon,
  ] = await Promise.all([
    (TaskModel as any).countDocuments(baseFilter).exec(),
    (TaskModel as any).countDocuments({
      ...baseFilter,
      status: "TODO",
    }).exec(),
    (TaskModel as any).countDocuments({
      ...baseFilter,
      status: "IN_PROGRESS",
    }).exec(),
    (TaskModel as any).countDocuments({
      ...baseFilter,
      status: "BLOCKED",
    }).exec(),
    (TaskModel as any).countDocuments({
      ...baseFilter,
      status: "COMPLETED",
    }).exec(),
    (TaskModel as any).countDocuments({
      ...baseFilter,
      status: {
        $nin: ["COMPLETED", "CANCELLED"],
      },
      dueDate: {
        $lt: now,
      },
    }).exec(),
    (TaskModel as any).countDocuments({
      ...baseFilter,
      status: {
        $nin: ["COMPLETED", "CANCELLED"],
      },
      dueDate: {
        $gte: now,
        $lte: nextSevenDays,
      },
    }).exec(),
  ]);

  return {
    total,
    todo,
    inProgress,
    blocked,
    completed,
    overdue,
    dueSoon,
  };
}

export async function updateTask(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
  input: UpdateTaskInput,
): Promise<PublicTask> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanManageTask(task, actor);

  const nextAssignedToAgentId =
    input.assignedToAgentId ??
    task.assignedToAgentId.toString();

  const assignedAgent =
    await resolveAssignedAgentOrganization({
      tenant,
      assignedToAgentId: nextAssignedToAgentId,
    });

  assertCanAssignTaskToAgent(actor, assignedAgent);

  const nextStartDate =
    input.startDate !== undefined
      ? cleanOptionalDate(input.startDate)
      : task.startDate;

  const nextDueDate =
    input.dueDate !== undefined
      ? cleanOptionalDate(input.dueDate)
      : task.dueDate;

  assertDates(nextStartDate, nextDueDate);

  if (input.kpis !== undefined) {
    mergeKpiDefinitions(task, input.kpis);
  }

  const taskState = resolveTaskState({
    currentStatus: task.status,
    currentProgress: task.progressPercentage,
    currentCompletedAt: task.completedAt,
    requestedStatus: input.status,
    requestedProgress: input.progressPercentage,
  });

  if (taskState.status === "COMPLETED") {
    assertRequiredKpisSubmitted(task.kpis ?? []);
  }

  const previousStatus = task.status;
  const previousProgress = task.progressPercentage;

  if (input.title !== undefined) {
    task.title = input.title;
  }

  if (input.description !== undefined) {
    task.description =
      cleanOptionalText(input.description);
  }

  if (input.priority !== undefined) {
    task.priority = input.priority;
  }

  task.status = taskState.status;
  task.progressPercentage =
    taskState.progressPercentage;
  task.completedAt = taskState.completedAt;
  task.startDate = nextStartDate;
  task.dueDate = nextDueDate;
  task.directionId = assignedAgent.directionId;
  task.serviceId = assignedAgent.serviceId;
  task.assignedToAgentId = assignedAgent._id;

  if (input.tags !== undefined) {
    task.tags = cleanTags(input.tags);
  }

  task.lastUpdatedByUserId = actor.userId;

  await task.save();

  const changes = [
    previousStatus !== task.status
      ? `Statut : ${getStatusLabel(previousStatus)} → ${getStatusLabel(task.status)}`
      : "",
    previousProgress !== task.progressPercentage
      ? `Progression : ${previousProgress}% → ${task.progressPercentage}%`
      : "",
    input.kpis !== undefined ? "KPI mis à jour" : "",
  ].filter(Boolean);

  await recordTaskActivity({
    tenant,
    taskId: task._id,
    actor,
    action: "UPDATED",
    summary:
      changes.join(" · ") ||
      "Informations de la tâche mises à jour.",
  });

  return serializeTask(task, actor);
}

export async function updateTaskProgress(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
  input: UpdateTaskProgressInput,
): Promise<PublicTask> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanUpdateTaskProgress(task, actor);

  const taskState = resolveTaskState({
    currentStatus: task.status,
    currentProgress: task.progressPercentage,
    currentCompletedAt: task.completedAt,
    requestedStatus: input.status,
    requestedProgress: input.progressPercentage,
  });

  if (taskState.status === "COMPLETED") {
    assertRequiredKpisSubmitted(task.kpis ?? []);
  }

  const previousProgress = task.progressPercentage;
  const previousStatus = task.status;

  task.status = taskState.status;
  task.progressPercentage =
    taskState.progressPercentage;
  task.completedAt = taskState.completedAt;
  task.lastUpdatedByUserId = actor.userId;

  await task.save();

  const note = cleanOptionalText(input.note);

  await recordTaskActivity({
    tenant,
    taskId: task._id,
    actor,
    action: "PROGRESS_UPDATED",
    summary: [
      `Progression : ${previousProgress}% → ${task.progressPercentage}%`,
      previousStatus !== task.status
        ? `Statut : ${getStatusLabel(previousStatus)} → ${getStatusLabel(task.status)}`
        : "",
      note,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  return serializeTask(task, actor);
}

export async function submitTaskKpiValue(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
  kpiId: string,
  input: SubmitTaskKpiValueInput,
): Promise<PublicTask> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanReadTask(task, actor);
  assertCanSubmitTaskKpi(task, actor);

  const kpi = getKpiOrThrow(task, kpiId);

  if (kpi.kind === "FILE") {
    throw new AppError(
      "Ce KPI attend un fichier et doit être renseigné via l'upload sécurisé.",
      400,
      "TASK_KPI_FILE_EXPECTED",
    );
  }

  if (kpi.kind === "NUMBER") {
    const numericValue = Number(input.value);

    if (!Number.isFinite(numericValue)) {
      throw new AppError(
        "La valeur du KPI doit être un nombre valide.",
        400,
        "TASK_KPI_NUMBER_INVALID",
      );
    }

    kpi.resultNumber = numericValue;
    kpi.resultText = undefined;
  } else {
    const textValue = String(input.value).trim();

    if (!textValue) {
      throw new AppError(
        "Le texte du KPI ne peut pas être vide.",
        400,
        "TASK_KPI_TEXT_EMPTY",
      );
    }

    kpi.resultText = textValue;
    kpi.resultNumber = undefined;
  }

  kpi.submittedAt = new Date();
  kpi.submittedByUserId = actor.userId;
  task.lastUpdatedByUserId = actor.userId;

  await task.save();

  await recordTaskActivity({
    tenant,
    taskId: task._id,
    actor,
    action: "KPI_SUBMITTED",
    summary:
      `KPI « ${kpi.label} » renseigné (${kpi.kind === "NUMBER" ? "valeur chiffrée" : "texte"}).`,
  });

  return serializeTask(task, actor);
}

async function removePrivateFileSafely(
  storagePath?: string,
): Promise<void> {
  if (!storagePath) return;

  const absolutePath = resolve(storagePath);

  if (!absolutePath.startsWith(taskKpiStorageRoot)) {
    return;
  }

  await unlink(absolutePath).catch(() => undefined);
}

export async function uploadTaskKpiFile(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
  kpiId: string,
  file: Express.Multer.File,
): Promise<PublicTask> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanReadTask(task, actor);
  assertCanSubmitTaskKpi(task, actor);

  const kpi = getKpiOrThrow(task, kpiId);

  if (kpi.kind !== "FILE") {
    throw new AppError(
      "Ce KPI n'attend pas de fichier.",
      400,
      "TASK_KPI_FILE_NOT_EXPECTED",
    );
  }

  const tenantFolder = resolve(
    taskKpiStorageRoot,
    tenant._id.toString(),
    task._id.toString(),
  );

  await mkdir(tenantFolder, {
    recursive: true,
  });

  const extension =
    extname(file.originalname).toLowerCase();

  const fileName =
    `${kpi._id.toString()}-${randomUUID()}${extension}`;

  const storagePath = resolve(
    tenantFolder,
    fileName,
  );

  await writeFile(storagePath, file.buffer);

  const previousStoragePath =
    kpi.file?.storagePath;

  kpi.file = {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    storagePath,
    uploadedAt: new Date(),
    uploadedByUserId: actor.userId,
  };

  kpi.resultNumber = undefined;
  kpi.resultText = undefined;
  kpi.submittedAt = new Date();
  kpi.submittedByUserId = actor.userId;

  task.lastUpdatedByUserId = actor.userId;

  await task.save();

  await removePrivateFileSafely(
    previousStoragePath,
  );

  await recordTaskActivity({
    tenant,
    taskId: task._id,
    actor,
    action: "KPI_SUBMITTED",
    summary:
      `Pièce KPI « ${kpi.label} » déposée : ${file.originalname}.`,
  });

  return serializeTask(task, actor);
}

export async function getTaskKpiFileForDownload(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
  kpiId: string,
): Promise<{
  absolutePath: string;
  originalName: string;
  mimeType: string;
}> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanReadTask(task, actor);
  assertCanDownloadTaskKpiFile(task, actor);

  const kpi = getKpiOrThrow(task, kpiId);

  if (!kpi.file?.storagePath) {
    throw new AppError(
      "Aucune pièce KPI n'est disponible pour ce résultat.",
      404,
      "TASK_KPI_FILE_NOT_FOUND",
    );
  }

  return {
    absolutePath: kpi.file.storagePath,
    originalName: kpi.file.originalName,
    mimeType: kpi.file.mimeType,
  };
}

export async function listTaskComments(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
): Promise<PublicTaskComment[]> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanReadTask(task, actor);

  const comments = await (TaskCommentModel as any)
    .find({
      tenantId: tenant._id,
      taskId,
    })
    .sort({
      createdAt: -1,
    })
    .exec();

  return comments.map(serializeComment);
}

export async function addTaskComment(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
  input: AddTaskCommentInput,
): Promise<PublicTaskComment> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanReadTask(task, actor);
  assertCanCommentTask(task, actor);

  const comment = await (TaskCommentModel as any).create({
    tenantId: tenant._id,
    taskId: task._id,
    authorUserId: actor.userId,
    authorName: actor.fullName,
    message: input.message,
  });

  await (TaskModel as any).updateOne(
    {
      _id: task._id,
      tenantId: tenant._id,
    },
    {
      $inc: {
        commentCount: 1,
      },
      $set: {
        lastCommentAt: new Date(),
        lastUpdatedByUserId: actor.userId,
      },
    },
  ).exec();

  await recordTaskActivity({
    tenant,
    taskId: task._id,
    actor,
    action: "COMMENT_ADDED",
    summary:
      "Un commentaire a été ajouté à la tâche.",
  });

  return serializeComment(comment);
}

export async function listTaskActivities(
  tenant: TenantDocument,
  actor: TaskActor,
  taskId: string,
  limit: number,
): Promise<PublicTaskActivity[]> {
  const task = await getTaskDocumentOrThrow(
    tenant,
    taskId,
  );

  assertCanReadTask(task, actor);

  const activities = await (TaskActivityModel as any)
    .find({
      tenantId: tenant._id,
      taskId,
    })
    .sort({
      createdAt: -1,
    })
    .limit(limit)
    .exec();

  return activities.map(serializeActivity);
}
