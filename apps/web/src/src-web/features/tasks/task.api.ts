import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  CreateTaskInput,
  Task,
  TaskActivity,
  TaskBoardParams,
  TaskBoardResult,
  TaskComment,
  TaskListParams,
  TaskListResult,
  TaskScope,
  TaskStats,
  UpdateTaskInput,
  UpdateTaskProgressInput,
} from "./task.types";

type TaskResponse = { task: Task };
type TaskStatsResponse = { stats: TaskStats };
type TaskScopeResponse = { scope: TaskScope };
type TaskCommentsResponse = { comments: TaskComment[] };
type TaskCommentResponse = { comment: TaskComment };
type TaskActivitiesResponse = { activities: TaskActivity[] };

export async function getTaskScope(): Promise<TaskScope> {
  const response = await api.get<
    ApiSuccess<TaskScopeResponse>
  >("/tasks/scope");

  return response.data.data.scope;
}

export async function getTaskStats(): Promise<TaskStats> {
  const response = await api.get<
    ApiSuccess<TaskStatsResponse>
  >("/tasks/stats");

  return response.data.data.stats;
}

export async function getTasks(
  params: TaskListParams,
): Promise<TaskListResult> {
  const response = await api.get<
    ApiSuccess<TaskListResult>
  >("/tasks", {
    params,
  });

  return response.data.data;
}

export async function getTaskBoard(
  params: TaskBoardParams,
): Promise<TaskBoardResult> {
  const response = await api.get<
    ApiSuccess<TaskBoardResult>
  >("/tasks/board", {
    params,
  });

  return response.data.data;
}

export async function getTaskById(
  taskId: string,
): Promise<Task> {
  const response = await api.get<
    ApiSuccess<TaskResponse>
  >(`/tasks/${taskId}`);

  return response.data.data.task;
}

export async function createTask(
  input: CreateTaskInput,
): Promise<Task> {
  const response = await api.post<
    ApiSuccess<TaskResponse>
  >("/tasks", input);

  return response.data.data.task;
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput,
): Promise<Task> {
  const response = await api.patch<
    ApiSuccess<TaskResponse>
  >(`/tasks/${taskId}`, input);

  return response.data.data.task;
}

export async function updateTaskProgress(
  taskId: string,
  input: UpdateTaskProgressInput,
): Promise<Task> {
  const response = await api.patch<
    ApiSuccess<TaskResponse>
  >(`/tasks/${taskId}/progress`, input);

  return response.data.data.task;
}

export async function submitTaskKpiValue(
  taskId: string,
  kpiId: string,
  value: string | number,
): Promise<Task> {
  const response = await api.patch<
    ApiSuccess<TaskResponse>
  >(
    `/tasks/${taskId}/kpis/${kpiId}/value`,
    { value },
  );

  return response.data.data.task;
}

export async function uploadTaskKpiFile(
  taskId: string,
  kpiId: string,
  file: File,
): Promise<Task> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<
    ApiSuccess<TaskResponse>
  >(
    `/tasks/${taskId}/kpis/${kpiId}/file`,
    formData,
  );

  return response.data.data.task;
}

export async function downloadTaskKpiFile(
  taskId: string,
  kpiId: string,
  fileName: string,
): Promise<void> {
  const response = await api.get<Blob>(
    `/tasks/${taskId}/kpis/${kpiId}/file`,
    {
      responseType: "blob",
    },
  );

  const url = URL.createObjectURL(response.data);

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(
      () => URL.revokeObjectURL(url),
      1_000,
    );
  }
}

export async function getTaskComments(
  taskId: string,
): Promise<TaskComment[]> {
  const response = await api.get<
    ApiSuccess<TaskCommentsResponse>
  >(`/tasks/${taskId}/comments`);

  return response.data.data.comments;
}

export async function addTaskComment(
  taskId: string,
  message: string,
): Promise<TaskComment> {
  const response = await api.post<
    ApiSuccess<TaskCommentResponse>
  >(`/tasks/${taskId}/comments`, {
    message,
  });

  return response.data.data.comment;
}

export async function getTaskActivities(
  taskId: string,
): Promise<TaskActivity[]> {
  const response = await api.get<
    ApiSuccess<TaskActivitiesResponse>
  >(`/tasks/${taskId}/activity`, {
    params: {
      limit: 50,
    },
  });

  return response.data.data.activities;
}
