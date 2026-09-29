export type TaskStatus =
  | "TODO"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export type TaskPriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type TaskKpiKind =
  | "FILE"
  | "NUMBER"
  | "TEXT";

export type TaskDueFilter =
  | "ALL"
  | "OVERDUE"
  | "TODAY"
  | "NEXT_7_DAYS"
  | "NO_DUE_DATE";

export type TaskKpiFile = {
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type TaskKpi = {
  id: string;
  label: string;
  kind: TaskKpiKind;
  required: boolean;
  instructions?: string;
  targetNumber?: number;
  unit?: string;
  resultNumber?: number;
  resultText?: string;
  isSubmitted: boolean;
  submittedAt?: string;
  file?: TaskKpiFile;
  canDownload: boolean;
};

export type TaskPermissions = {
  canManage: boolean;
  canUpdateProgress: boolean;
  canSubmitKpi: boolean;
  canDownloadKpiFiles: boolean;
  canComment: boolean;
  readOnly: boolean;
};

export type Task = {
  id: string;
  tenantId: string;
  reference: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  progressPercentage: number;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  directionId: string;
  serviceId: string | null;
  assignedToAgentId: string;
  createdByUserId: string;
  lastUpdatedByUserId?: string;
  tags: string[];
  kpis: TaskKpi[];
  permissions: TaskPermissions;
  commentCount: number;
  lastCommentAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorUserId: string;
  authorName: string;
  message: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TaskActivityAction =
  | "CREATED"
  | "UPDATED"
  | "STATUS_CHANGED"
  | "PROGRESS_UPDATED"
  | "COMMENT_ADDED"
  | "KPI_SUBMITTED";

export type TaskActivity = {
  id: string;
  taskId: string;
  actorUserId: string;
  actorName: string;
  action: TaskActivityAction;
  summary: string;
  createdAt?: string;
};

export type TaskScope = {
  role: string;
  fullName: string;
  agentId: string | null;
  directionId: string | null;
  serviceId: string | null;
  readOnly?: boolean;
};

export type TaskStats = {
  total: number;
  todo: number;
  inProgress: number;
  blocked: number;
  completed: number;
  overdue: number;
  dueSoon: number;
};

export type TaskListParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  directionId?: string;
  serviceId?: string;
  assignedToAgentId?: string;
  due?: TaskDueFilter;
  sort?:
    | "DUE_DATE_ASC"
    | "UPDATED_DESC"
    | "CREATED_DESC";
};

export type TaskListResult = {
  items: Task[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type TaskBoardParams = {
  search?: string;
  priority?: TaskPriority;
  directionId?: string;
  serviceId?: string;
  assignedToAgentId?: string;
  due?: TaskDueFilter;
  limit?: number;
};

export type TaskBoardResult = {
  columns: Record<TaskStatus, Task[]>;
};

export type TaskKpiDefinitionInput = {
  id?: string;
  label: string;
  kind: TaskKpiKind;
  required: boolean;
  instructions?: string;
  targetNumber?: number;
  unit?: string;
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  progressPercentage: number;
  startDate?: string;
  dueDate?: string;
  directionId: string;
  serviceId?: string | null;
  assignedToAgentId: string;
  tags: string[];
  kpis: TaskKpiDefinitionInput[];
};

export type UpdateTaskInput =
  Partial<CreateTaskInput>;

export type UpdateTaskProgressInput = {
  progressPercentage: number;
  status?:
    | "TODO"
    | "IN_PROGRESS"
    | "BLOCKED"
    | "COMPLETED";
  note?: string;
};
