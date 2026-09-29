import type {
  NextFunction,
  Request,
  Response,
} from "express";
import { AppError } from "../../core/errors/app-error.js";
import {
  resolveTaskActor,
} from "./task.access.js";
import {
  addTaskCommentSchema,
  createTaskSchema,
  listTaskActivitiesQuerySchema,
  listTasksQuerySchema,
  submitTaskKpiValueSchema,
  taskBoardQuerySchema,
  taskIdParamsSchema,
  taskKpiParamsSchema,
  updateTaskProgressSchema,
  updateTaskSchema,
} from "./task.schema.js";
import {
  addTaskComment,
  createTask,
  getTaskBoard,
  getTaskById,
  getTaskKpiFileForDownload,
  getTaskStats,
  listTaskActivities,
  listTaskComments,
  listTasks,
  submitTaskKpiValue,
  updateTask,
  updateTaskProgress,
  uploadTaskKpiFile,
} from "./task.service.js";

function getTenantOrThrow(request: Request) {
  if (!request.tenant) {
    throw new AppError(
      "Le contexte organisationnel est introuvable.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  return request.tenant;
}

function getAuthenticatedUserIdOrThrow(
  request: Request,
): string {
  if (!request.auth?.userId) {
    throw new AppError(
      "Authentification requise.",
      401,
      "AUTH_REQUIRED",
    );
  }

  return request.auth.userId;
}

async function getTaskRequestContext(
  request: Request,
) {
  const tenant = getTenantOrThrow(request);
  const userId =
    getAuthenticatedUserIdOrThrow(request);

  const actor = await resolveTaskActor(
    tenant,
    userId,
  );

  return {
    tenant,
    actor,
  };
}

export async function getTaskScopeController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { actor } = await getTaskRequestContext(request);

    response.status(200).json({
      success: true,
      data: {
        scope: {
          role: actor.role,
          fullName: actor.fullName,
          agentId:
            actor.agentId?.toString() ?? null,
          directionId:
            actor.directionId?.toString() ?? null,
          serviceId:
            actor.serviceId?.toString() ?? null,
          readOnly:
            actor.role === "RH_MANAGER",
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getTaskStatsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const stats = await getTaskStats(
      tenant,
      actor,
    );

    response.status(200).json({
      success: true,
      data: {
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getTaskBoardController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const query = taskBoardQuerySchema.parse(
      request.query,
    );

    const board = await getTaskBoard(
      tenant,
      actor,
      query,
    );

    response.status(200).json({
      success: true,
      data: board,
    });
  } catch (error) {
    next(error);
  }
}

export async function listTasksController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const query = listTasksQuerySchema.parse(
      request.query,
    );

    const result = await listTasks(
      tenant,
      actor,
      query,
    );

    response.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTaskController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id } = taskIdParamsSchema.parse(
      request.params,
    );

    const task = await getTaskById(
      tenant,
      actor,
      id,
    );

    response.status(200).json({
      success: true,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createTaskController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const input = createTaskSchema.parse(
      request.body,
    );

    const task = await createTask(
      tenant,
      actor,
      input,
    );

    response.status(201).json({
      success: true,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateTaskController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id } = taskIdParamsSchema.parse(
      request.params,
    );

    const input = updateTaskSchema.parse(
      request.body,
    );

    const task = await updateTask(
      tenant,
      actor,
      id,
      input,
    );

    response.status(200).json({
      success: true,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateTaskProgressController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id } = taskIdParamsSchema.parse(
      request.params,
    );

    const input =
      updateTaskProgressSchema.parse(
        request.body,
      );

    const task = await updateTaskProgress(
      tenant,
      actor,
      id,
      input,
    );

    response.status(200).json({
      success: true,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function submitTaskKpiValueController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id, kpiId } =
      taskKpiParamsSchema.parse(request.params);

    const input =
      submitTaskKpiValueSchema.parse(
        request.body,
      );

    const task = await submitTaskKpiValue(
      tenant,
      actor,
      id,
      kpiId,
      input,
    );

    response.status(200).json({
      success: true,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadTaskKpiFileController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id, kpiId } =
      taskKpiParamsSchema.parse(request.params);

    if (!request.file) {
      throw new AppError(
        "Aucun fichier KPI n'a été transmis.",
        400,
        "TASK_KPI_FILE_REQUIRED",
      );
    }

    const task = await uploadTaskKpiFile(
      tenant,
      actor,
      id,
      kpiId,
      request.file,
    );

    response.status(200).json({
      success: true,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadTaskKpiFileController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id, kpiId } =
      taskKpiParamsSchema.parse(request.params);

    const file =
      await getTaskKpiFileForDownload(
        tenant,
        actor,
        id,
        kpiId,
      );

    response.type(file.mimeType);

    response.download(
      file.absolutePath,
      file.originalName,
      (error) => {
        if (error && !response.headersSent) {
          next(error);
        }
      },
    );
  } catch (error) {
    next(error);
  }
}

export async function listTaskCommentsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id } = taskIdParamsSchema.parse(
      request.params,
    );

    const comments = await listTaskComments(
      tenant,
      actor,
      id,
    );

    response.status(200).json({
      success: true,
      data: {
        comments,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function addTaskCommentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id } = taskIdParamsSchema.parse(
      request.params,
    );

    const input = addTaskCommentSchema.parse(
      request.body,
    );

    const comment = await addTaskComment(
      tenant,
      actor,
      id,
      input,
    );

    response.status(201).json({
      success: true,
      data: {
        comment,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listTaskActivitiesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } =
      await getTaskRequestContext(request);

    const { id } = taskIdParamsSchema.parse(
      request.params,
    );

    const query =
      listTaskActivitiesQuerySchema.parse(
        request.query,
      );

    const activities = await listTaskActivities(
      tenant,
      actor,
      id,
      query.limit,
    );

    response.status(200).json({
      success: true,
      data: {
        activities,
      },
    });
  } catch (error) {
    next(error);
  }
}
