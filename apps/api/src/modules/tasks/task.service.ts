import type { PublicTask } from "./task.types.js";
import type { TaskActor } from "./task.access.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { TaskModel } from "./task.models.js";
import * as base from "./task.base.service.js";
import { taskMutation, notifyTaskChange } from "./task-notifications.js";
import { publishTaskNotificationChange } from "./task-notification-events.js";

export * from "./task.base.service.js";

async function mutateWithNotice(
  tenant: TenantDocument, actor: TaskActor, taskId: string | null,
  run: () => Promise<PublicTask>,
): Promise<PublicTask> {
  const result = await taskMutation(async () => {
    const previous = taskId ? await base.getTaskById(tenant, actor, taskId) : null;
    const updated = await run();
    const task = await TaskModel.findOne({ _id: updated.id, tenantId: tenant._id }).exec();
    if (task) await notifyTaskChange({ task, actor,
      previousStatus: previous?.status ?? null,
      previousAssignee: previous?.assignedToAgentId ?? null,
    });
    return updated;
  });
  // Publication après validation de la transaction, jamais avant le commit.
  publishTaskNotificationChange(String(tenant._id));
  return result;
}

export async function createTask(...args: Parameters<typeof base.createTask>): Promise<PublicTask> {
  return mutateWithNotice(args[0], args[1], null, () => base.createTask(...args));
}
export async function updateTask(...args: Parameters<typeof base.updateTask>): Promise<PublicTask> {
  return mutateWithNotice(args[0], args[1], args[2], () => base.updateTask(...args));
}
export async function updateTaskProgress(...args: Parameters<typeof base.updateTaskProgress>): Promise<PublicTask> {
  return mutateWithNotice(args[0], args[1], args[2], () => base.updateTaskProgress(...args));
}
