import { getTaskScopeFilter, resolveTaskActor } from "./task.access.js";
import { getTaskById } from "./task.base.service.js";
import { openTaskNotificationStream, publishTaskNotificationChange } from "./task-notification-events.js";
import mongoose, {
  Schema,
  Types,
  type Model,
  type AnyBulkWriteOperation,
  type QueryFilter,
} from "mongoose";
import {
  Router,
  type Request,
  type RequestHandler,
} from "express";
import { AppError } from "../../core/errors/app-error.js";
import { UserModel } from "../users/user.model.js";
import { AgentModel } from "../agents/agent.model.js";
import { TaskModel } from "./task.models.js";
import type { TaskDocument } from "./task.types.js";
import type { TaskActor } from "./task.access.js";

/*
 * Mongoose 9 : les opérations réalisées dans le callback
 * transactionnel utilisent automatiquement sa session.
 */
mongoose.set("transactionAsyncLocalStorage", true);

interface TaskNotice {
  tenantId: Types.ObjectId;
  taskId: Types.ObjectId;
  recipientUserId?: Types.ObjectId;
  recipientAgentId?: Types.ObjectId;
  kind: "ASSIGNED" | "COMPLETED";
  title: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
  occurredAt?: Date;
  assignmentKey?: string;
}

const taskNoticeSchema = new Schema<TaskNotice>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    assignmentKey: String,
    occurredAt: { type: Date, default: Date.now },
    recipientUserId: Schema.Types.ObjectId,
    recipientAgentId: Schema.Types.ObjectId,
    kind: {
      type: String,
      enum: ["ASSIGNED", "COMPLETED"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 220,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
    versionKey: false,
  },
);

taskNoticeSchema.index({
  tenantId: 1,
  recipientUserId: 1,
  readAt: 1,
  createdAt: -1,
});

taskNoticeSchema.index({
  tenantId: 1,
  recipientAgentId: 1,
  readAt: 1,
  createdAt: -1,
});

taskNoticeSchema.index({ assignmentKey: 1 }, {
  unique: true,
  partialFilterExpression: { assignmentKey: { $type: "string" } },
});

export const TaskNoticeModel: Model<TaskNotice> =
  (mongoose.models.TaskNotice as
    | Model<TaskNotice>
    | undefined) ??
  mongoose.model<TaskNotice>(
    "TaskNotice",
    taskNoticeSchema,
  );

export async function taskMutation<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await mongoose.connection.transaction(run);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";

    if (
      /Transaction numbers are only allowed|replica set|does not support transactions/i.test(
        message,
      )
    ) {
      throw new AppError(
        "Les notifications de tâches nécessitent MongoDB Atlas ou un replica set.",
        503,
        "TASK_TRANSACTIONS_REQUIRED",
      );
    }

    throw error;
  }
}

export async function notifyTaskChange(input: {
  task: TaskDocument;
  actor: TaskActor;
  previousStatus: string | null;
  previousAssignee: string | null;
}): Promise<void> {
  const {
    task,
    actor,
    previousStatus,
    previousAssignee,
  } = input;

  const isOpen =
    task.status !== "COMPLETED" &&
    task.status !== "CANCELLED";

  const wasAssigned =
    isOpen &&
    previousAssignee !== String(task.assignedToAgentId);

  const wasCompleted =
    previousStatus !== null &&
    previousStatus !== "COMPLETED" &&
    task.status === "COMPLETED";

  if (!wasAssigned && !wasCompleted) return;

  const agent = await (AgentModel as any)
    .findOne({
      _id: task.assignedToAgentId,
      tenantId: task.tenantId,
    })
    .select("_id firstName lastName userId email")
    .lean()
    .exec();

  if (!agent) return;

  const recipient = await (UserModel as any)
    .findOne({
      tenantId: task.tenantId,
      isActive: true,
      $or: [
        { agentId: agent._id },
        ...(agent.email ? [{ email: String(agent.email).trim().toLowerCase() }] : []),
        ...(agent.userId
          ? [{ _id: agent.userId }]
          : []),
      ],
    })
    .select("_id")
    .lean()
    .exec();

  const agentName =
    [agent.firstName, agent.lastName]
      .filter(Boolean)
      .join(" ") || "L’agent";

  if (wasAssigned) {
    // Une seule notification d'attribution active par tâche et agent.
    await syncAssignedTaskNotices(task.tenantId, agent._id);
    await TaskNoticeModel.updateOne({
      assignmentKey: assignmentKey(task.tenantId, task._id, agent._id),
    }, { $set: {
      title: task.title,
      message: `${actor.fullName} vous a attribué la tâche « ${task.title} ».`,
      readAt: null,
      occurredAt: new Date(),
      recipientAgentId: agent._id,
    }, $unset: { recipientUserId: "" } }).exec();
  }

  /*
   * Une simple modification d'une tâche déjà terminée
   * ne génère pas une seconde notification de clôture.
   */
  if (
    wasCompleted &&
    String(task.createdByUserId) !==
      String(actor.userId)
  ) {
    const message =
      String(recipient?._id ?? "") ===
      String(actor.userId)
        ? agentName +
          " a terminé la tâche « " +
          task.title +
          " »."
        : actor.fullName +
          " a clôturé la tâche « " +
          task.title +
          " », attribuée à " +
          agentName +
          ".";

    await TaskNoticeModel.create({
      tenantId: task.tenantId,
      taskId: task._id,
      recipientUserId: task.createdByUserId,
      kind: "COMPLETED",
      title: task.title,
      message,
    });
  }
}

function assignmentKey(tenantId: Types.ObjectId, taskId: Types.ObjectId, agentId: Types.ObjectId): string {
  return `${tenantId}:${taskId}:${agentId}`;
}

export async function syncAssignedTaskNotices(tenantId: Types.ObjectId, agentId: Types.ObjectId): Promise<string[]> {
  const tasks = await TaskModel.find({ tenantId, assignedToAgentId: agentId,
    status: { $in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
  }).select("_id title createdAt").lean().exec();
  if (!tasks.length) return [];
  const existing = await TaskNoticeModel.find({ tenantId, recipientAgentId: agentId,
    taskId: { $in: tasks.map(task => task._id) }, kind: "ASSIGNED",
  }).sort({ createdAt: -1, _id: -1 }).lean().exec();
  const canonical = new Set(existing.map(notice => notice.assignmentKey).filter(Boolean));
  const keys = tasks.map(task => assignmentKey(tenantId, task._id, agentId));
  const operations = tasks.flatMap<AnyBulkWriteOperation<TaskNotice>>(task => {
    const key = assignmentKey(tenantId, task._id, agentId);
    if (canonical.has(key)) return [];
    const legacy = existing.find(notice => !notice.assignmentKey && String(notice.taskId) === String(task._id));
    if (legacy) return [{ updateOne: { filter: { _id: legacy._id, assignmentKey: { $exists: false } },
      update: { $set: { assignmentKey: key, occurredAt: legacy.createdAt } },
    } }];
    return [{ updateOne: { filter: { assignmentKey: key }, update: { $setOnInsert: {
      assignmentKey: key, tenantId, taskId: task._id, recipientAgentId: agentId,
      kind: "ASSIGNED", title: task.title, message: `La tâche « ${task.title} » vous a été attribuée.`,
      readAt: null, occurredAt: task.createdAt ?? new Date(),
    } }, upsert: true } }];
  });
  if (operations.length) {
    try { await TaskNoticeModel.bulkWrite(operations, { ordered: false }); }
    catch (error) {
      // Une autre requête peut avoir créé la même réception : l'index unique fait autorité.
      const failure = error as { code?: number; writeErrors?: { code: number }[]; writeConcernErrors?: unknown[] };
      if (failure.code !== 11000 || failure.writeConcernErrors?.length
        || failure.writeErrors?.some(item => item.code !== 11000)) throw error;
    }
  }
  return keys;
}

function occurredBefore(before: Date): QueryFilter<TaskNotice> {
  return { $or: [ { occurredAt: { $lte: before } },
    { occurredAt: { $exists: false }, createdAt: { $lte: before } },
  ] };
}

async function resolveNotificationScope(
  request: Request,
) {
  if (!request.auth || !request.tenant) {
    throw new AppError(
      "Authentification requise.",
      401,
      "AUTH_REQUIRED",
    );
  }

  const user = await (UserModel as any)
    .findOne({
      _id: request.auth.userId,
      tenantId: request.tenant._id,
      isActive: true,
    })
    .select("_id agentId email")
    .lean()
    .exec();

  if (!user) {
    throw new AppError(
      "Compte inactif.",
      401,
      "AUTH_REQUIRED",
    );
  }

  const actor = await resolveTaskActor(request.tenant, request.auth.userId);
  // Le rôle organisationnel peut omettre agentId dans l'acteur (chef, RH,
  // administrateur). Le lien personnel explicite sert aussi à recevoir ses avis.
  const agent = actor.agentId ? { _id: actor.agentId }
    : await (AgentModel as any).findOne({
        tenantId: request.tenant._id,
        employmentStatus: "ACTIVE",
        ...(user.agentId ? { _id: user.agentId } : { userId: user._id }),
      }).select("_id").lean().exec();
  // Les anciens avis ne doivent pas révéler une tâche réattribuée à autrui.
  const visibleTaskIds = await TaskModel.distinct("_id", {
    tenantId: request.tenant._id,
    ...getTaskScopeFilter(actor),
  }).exec();

  const filter = {
    tenantId: request.tenant._id,
    ...(visibleTaskIds ? { taskId: { $in: visibleTaskIds } } : {}),
    $or: [
      { recipientUserId: user._id },
      ...(agent
        ? [{ recipientAgentId: agent._id }]
        : []),
    ],
  };

  return {
    filter,
    agent,
    tenantId: request.tenant._id,
  };
}

const handle = (
  controller: RequestHandler,
): RequestHandler =>
  async (request, response, next) => {
    try {
      await controller(request, response, next);
    } catch (error) {
      next(error);
    }
  };

/*
 * Le routeur Tâches applique déjà :
 * requireAuth, contexte tenant et contrôle du module.
 */
export const taskNotificationRouter = Router();

// Flux des pop-up, distinct de la pagination du panneau de notifications.
taskNotificationRouter.get("/popups", handle(async (request, response) => {
  const { filter, agent, tenantId } = await resolveNotificationScope(request);
  if (agent) await syncAssignedTaskNotices(tenantId, agent._id);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(request.query.page)) || 1));
  const asOf = request.query.asOf ? new Date(String(request.query.asOf)) : new Date();
  if (!Number.isFinite(asOf.getTime()) || asOf.getTime() > Date.now() + 1000) {
    throw new AppError("Date de consultation invalide.", 400, "TASK_NOTICE_DATE_INVALID");
  }
  const where: QueryFilter<TaskNotice> = { $and: [filter, { readAt: null }, occurredBefore(asOf)] };
  const [items, total] = await Promise.all([
    TaskNoticeModel.find(where).sort({ occurredAt: 1, createdAt: 1, _id: 1 })
      .skip((page - 1) * 100).limit(100).lean().exec(),
    TaskNoticeModel.countDocuments(where).exec(),
  ]);
  response.json({ success: true, data: { page, limit: 100, total, asOf: asOf.toISOString(),
    items: items.map(item => ({ id: String(item._id), taskId: String(item.taskId),
      kind: item.kind, title: item.title, message: item.message,
      createdAt: (item.occurredAt ?? item.createdAt).toISOString(),
    })),
  } });
}));

taskNotificationRouter.get("/events", handle(async (request, response) => {
  const { tenantId } = await resolveNotificationScope(request);
  openTaskNotificationStream(String(tenantId), response);
}));

taskNotificationRouter.post("/task/:taskId/read", handle(async (request, response) => {
  const before = new Date();
  const taskId = String(request.params.taskId ?? "");
  if (!/^[a-f\d]{24}$/i.test(taskId)) throw new AppError("Identifiant invalide.", 400, "TASK_NOTICE_ID_INVALID");
  const { filter, agent, tenantId } = await resolveNotificationScope(request);
  const actor = await resolveTaskActor(request.tenant!, request.auth!.userId);
  const task = await getTaskById(request.tenant!, actor, taskId);
  if (request.body?.updatedAt && task.updatedAt !== request.body.updatedAt) {
    throw new AppError("La tâche a été actualisée. Rouvrez-la pour consulter sa dernière version.", 409, "TASK_NOTICE_STALE_VIEW");
  }
  if (agent && task.assignedToAgentId === String(agent._id)) await syncAssignedTaskNotices(tenantId, agent._id);
  await TaskNoticeModel.updateMany({ $and: [filter, { taskId, readAt: null }, occurredBefore(before)] },
    { $set: { readAt: new Date() } }).exec();
  publishTaskNotificationChange(String(tenantId));
  response.json({ success: true, data: { taskId } });
}));

taskNotificationRouter.get(
  "/",
  handle(async (request, response) => {
    const {
      filter,
      agent,
      tenantId,
    } = await resolveNotificationScope(request);

    const keys = agent ? await syncAssignedTaskNotices(tenantId, agent._id) : [];
    const page = Math.max(
      1,
      Math.min(
        10000,
        Math.floor(Number(request.query.page)) || 1,
      ),
    );

    const asOf = new Date();

    const baseFilter: QueryFilter<TaskNotice> = { $and: [filter, occurredBefore(asOf), { $or: [
      { kind: "COMPLETED" }, { kind: "ASSIGNED", assignmentKey: { $in: keys } },
    ] }] };

    const listFilter: QueryFilter<TaskNotice> = {
      ...baseFilter,
      ...(request.query.unread === "1"
        ? { readAt: null }
        : {}),
    };

    const [
      items,
      unreadCount,
      total,
      openTasks,
    ] = await Promise.all([
      TaskNoticeModel.find(listFilter)
        .sort({ occurredAt: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean()
        .exec(),

      // Une tâche compte une seule fois, même si elle porte plusieurs avis non lus.
      TaskNoticeModel.distinct("taskId", {
        ...baseFilter,
        readAt: null,
      }).exec().then(ids => ids.length),

      TaskNoticeModel.countDocuments(
        listFilter,
      ).exec(),

      agent
        ? TaskModel.countDocuments({
            tenantId,
            assignedToAgentId: agent._id,
            status: {
              $in: [
                "TODO",
                "IN_PROGRESS",
                "BLOCKED",
              ],
            },
          }).exec()
        : Promise.resolve(0),
    ]);

    response.json({
      success: true,
      data: {
        unreadCount,
        openTasks,
        total,
        page,
        limit: 20,
        asOf: asOf.toISOString(),
        items: items.map((item) => ({
          id: String(item._id),
          taskId: String(item.taskId),
          kind: item.kind,
          title: item.title,
          message: item.message,
          createdAt:
            (item.occurredAt ?? item.createdAt).toISOString(),
          readAt:
            item.readAt?.toISOString() ?? null,
        })),
      },
    });
  }),
);

taskNotificationRouter.patch(
  "/read-all",
  handle(async (request, response) => {
    const { filter } =
      await resolveNotificationScope(request);

    const before = new Date(
      String(request.body?.before ?? ""),
    );

    if (
      !Number.isFinite(before.getTime()) ||
      before.getTime() > Date.now() + 1000
    ) {
      throw new AppError(
        "Date de lecture invalide.",
        400,
        "TASK_NOTICE_DATE_INVALID",
      );
    }

    /*
     * Une notification arrivée après l'affichage de la liste
     * ne doit pas être marquée comme lue involontairement.
     */
    await TaskNoticeModel.updateMany(
      {
        ...filter,
        readAt: null,
        $and: [occurredBefore(before)],
      },
      {
        $set: {
          readAt: new Date(),
        },
      },
    ).exec();

    publishTaskNotificationChange(String(request.tenant!._id));
    response.json({
      success: true,
      data: {},
    });
  }),
);

taskNotificationRouter.patch(
  "/:id/read",
  handle(async (request, response) => {
    const { filter } =
      await resolveNotificationScope(request);

    const id = String(
      request.params.id ?? "",
    );

    if (!/^[a-f\d]{24}$/i.test(id)) {
      throw new AppError(
        "Identifiant invalide.",
        400,
        "TASK_NOTICE_ID_INVALID",
      );
    }

    const notification =
      await TaskNoticeModel.findOne({
        ...filter,
        _id: id,
      })
        .select("_id")
        .lean()
        .exec();

    if (!notification) {
      throw new AppError(
        "Notification introuvable.",
        404,
        "TASK_NOTICE_NOT_FOUND",
      );
    }

    await TaskNoticeModel.updateOne(
      {
        ...filter,
        _id: id,
        readAt: null,
      },
      {
        $set: {
          readAt: new Date(),
        },
      },
    ).exec();

    publishTaskNotificationChange(String(request.tenant!._id));
    response.json({
      success: true,
      data: {},
    });
  }),
);