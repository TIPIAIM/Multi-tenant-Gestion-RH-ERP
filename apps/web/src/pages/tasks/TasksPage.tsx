import { useLocation } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ChangeEvent,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Columns3,
  Filter,
  List,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  SquareCheckBig,
  Target,
  UserRound,
} from "lucide-react";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { useAuth } from "../../features/auth/auth.context";
import { getAgents } from "../../features/agents/agent.api";
import { getOrganizationTree } from "../../features/organisation/organisation.api";
import {
  createTask,
  getTaskBoard,
  getTaskById,
  getTaskScope,
  getTaskStats,
  getTasks,
  updateTask,
} from "../../features/tasks/task.api";
import type {
  CreateTaskInput,
  Task,
  TaskBoardResult,
  TaskListResult,
  TaskDueFilter,
  TaskPriority,
  TaskStatus,
} from "../../features/tasks/task.types";
import TaskDetailsDrawer from "./TaskDetailsDrawer";
import TaskFormModal from "./TaskFormModal";
import "./tasks-page.css";
import "./task-experience.css";
import "./task-kpi.css";

type DisplayMode = "BOARD" | "LIST";
type MetricSelection = "total" | "progress" | "alert" | "complete";

type TaskFilters = {
  search: string;
  priority: "" | TaskPriority;
  status: "" | TaskStatus;
  directionId: string;
  serviceId: string;
  assignedToAgentId: string;
  due: TaskDueFilter;
};

type AuthUserWithAgent = {
  id?: string;
  role?: string;
  agentId?: string | null;
};

type AgentForTask = {
  id: string;
  fullName: string;
  userId?: string | null;
  directionId?: string | null;
  serviceId?: string | null;
  jobTitle?: string | null;
};

const taskStatusOrder: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

const statusLabels: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloquées",
  COMPLETED: "Terminées",
  CANCELLED: "Annulées",
};

const priorityLabels: Record<TaskPriority, string> = {
  LOW: "Faible",
  MEDIUM: "Normale",
  HIGH: "Élevée",
  CRITICAL: "Critique",
};

function formatDate(value?: string): string {
  if (!value) {
    return "Sans échéance";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function getStatusClass(status: TaskStatus): string {
  return status.toLowerCase().replace("_", "-");
}

function getPriorityClass(
  priority: TaskPriority,
): string {
  return priority.toLowerCase();
}

function sameId(
  first?: string | null,
  second?: string | null,
): boolean {
  return Boolean(
    first &&
      second &&
      String(first) === String(second),
  );
}

function isTaskOverdue(task: Task): boolean {
  if (
    !task.dueDate ||
    task.status === "COMPLETED" ||
    task.status === "CANCELLED"
  ) {
    return false;
  }

  return (
    new Date(task.dueDate).getTime() <
    Date.now()
  );
}

function getKpiSummary(task: Task): {
  total: number;
  completed: number;
} {
  const kpis = task.kpis ?? [];

  return {
    total: kpis.length,
    completed: kpis.filter(
      (kpi) => kpi.isSubmitted,
    ).length,
  };
}

export default function TasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const authUser =
    user as AuthUserWithAgent | undefined;

  const role = authUser?.role ?? "";

  const canReadOrganization =
    role === "TENANT_ADMIN" ||
    role === "RH_MANAGER" ||
    role === "DIRECTION" ||
    role === "SERVICE_MANAGER";

  const canReadAgents =
    canReadOrganization;

  // Les RH peuvent créer ; leurs autres droits de gestion restent inchangés.
  const canCreateTasks =
    role === "TENANT_ADMIN" ||
    role === "RH_MANAGER" ||
    role === "DIRECTION" ||
    role === "SERVICE_MANAGER";

  const canManageTasks =
    role === "TENANT_ADMIN" ||
    role === "DIRECTION" ||
    role === "SERVICE_MANAGER";

  const [displayMode, setDisplayMode] =
    useState<DisplayMode>("BOARD");

  const [filters, setFilters] =
    useState<TaskFilters>({
      search: "",
      priority: "",
      status: "",
      directionId: "",
      serviceId: "",
      assignedToAgentId: "",
      due: "ALL",
    });

  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] =
    useState(false);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const editRequest = useRef(0);
  useEffect(() => () => { editRequest.current += 1; }, []);
  const [editingTask, setEditingTask] =
    useState<Task | null>(null);
  const taskViewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [expandedColumns, setExpandedColumns] = useState<Partial<Record<TaskStatus, boolean>>>({});

  const [selectedTaskId, setSelectedTaskId] =
    useState<string | null>(null);
  const taskLocation = useLocation();
  useEffect(() => {
    const taskId = new URLSearchParams(taskLocation.search).get("task");
    if (taskId && /^[a-f\d]{24}$/i.test(taskId)) setSelectedTaskId(taskId);
  }, [taskLocation.key, taskLocation.search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters.search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.priority,
    filters.status,
    filters.directionId,
    filters.serviceId,
    filters.assignedToAgentId,
    filters.due,
  ]);

  const organizationQuery = useQuery({
    queryKey: ["organization-tree"],
    queryFn: getOrganizationTree,
    enabled: canReadOrganization,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const taskScopeQuery = useQuery({
    queryKey: ["tasks", "scope"],
    queryFn: getTaskScope,
    enabled: Boolean(role),
    staleTime: 1000 * 60,
    retry: false,
  });

  const taskScope = taskScopeQuery.data;

  const currentAgentDirectionId =
    taskScope?.directionId ?? null;

  const currentAgentServiceId =
    taskScope?.serviceId ?? null;

  const scopeReady =
    role === "TENANT_ADMIN" ||
    role === "RH_MANAGER" ||
    (role === "DIRECTION" &&
      Boolean(currentAgentDirectionId)) ||
    (role === "SERVICE_MANAGER" &&
      Boolean(currentAgentDirectionId) &&
      Boolean(currentAgentServiceId)) ||
    role === "AGENT";

  const agentsQuery = useQuery({
    queryKey: [
      "agents",
      "task-select",
      role,
      currentAgentDirectionId,
      currentAgentServiceId,
    ],

    queryFn: () =>
      getAgents({
        page: 1,
        limit: 100,
        employmentStatus: "ACTIVE",
      }),

    enabled:
      canReadAgents &&
      taskScopeQuery.isSuccess &&
      scopeReady,

    staleTime: 1000 * 60,
    retry: false,
  });

  const statsQuery = useQuery({
    queryKey: [
      "task-stats",
      role,
      currentAgentDirectionId,
      currentAgentServiceId,
    ],

    queryFn: getTaskStats,

    enabled:
      taskScopeQuery.isSuccess &&
      scopeReady,

    staleTime: 1000 * 20,
    retry: false,
  });

  const boardQuery = useQuery<TaskBoardResult>({
    queryKey: [
      "tasks",
      "board",
      debouncedSearch,
      filters.priority,
      filters.status,
      filters.directionId,
      filters.serviceId,
      filters.assignedToAgentId,
      filters.due,
      role,
      currentAgentDirectionId,
      currentAgentServiceId,
    ],

    queryFn: () =>
      getTaskBoard({
        search:
          debouncedSearch || undefined,
        priority:
          filters.priority || undefined,
        status: filters.status || undefined,
        directionId:
          filters.directionId || undefined,
        serviceId:
          filters.serviceId || undefined,
        assignedToAgentId:
          filters.assignedToAgentId ||
          undefined,
        due: filters.due,
      }),

    enabled:
      displayMode === "BOARD" &&
      taskScopeQuery.isSuccess &&
      scopeReady,

    staleTime: 1000 * 15,
    retry: false,
  });

  const listQuery = useQuery<TaskListResult>({
    queryKey: [
      "tasks",
      "list",
      page,
      debouncedSearch,
      filters.priority,
      filters.status,
      filters.directionId,
      filters.serviceId,
      filters.assignedToAgentId,
      filters.due,
      role,
      currentAgentDirectionId,
      currentAgentServiceId,
    ],

    queryFn: () =>
      getTasks({
        page,
        limit: 12,
        search:
          debouncedSearch || undefined,
        priority:
          filters.priority || undefined,
        status:
          filters.status || undefined,
        directionId:
          filters.directionId || undefined,
        serviceId:
          filters.serviceId || undefined,
        assignedToAgentId:
          filters.assignedToAgentId ||
          undefined,
        due: filters.due,
      }),

    enabled:
      displayMode === "LIST" &&
      taskScopeQuery.isSuccess &&
      scopeReady,

    staleTime: 1000 * 15,
    retry: false,
  });

  const selectedTaskQuery = useQuery<Task>({
    queryKey: ["task", selectedTaskId],

    queryFn: () =>
      getTaskById(
        selectedTaskId ?? "",
      ),

    enabled: Boolean(selectedTaskId),
    staleTime: 1000 * 10,
    retry: false,
  });

  const directions =
    organizationQuery.data ?? [];

  const agents =
    (agentsQuery.data?.items ??
      []) as AgentForTask[];

  useEffect(() => {
    if (
      role === "DIRECTION" &&
      currentAgentDirectionId
    ) {
      setFilters((currentValue) => ({
        ...currentValue,
        directionId:
          currentAgentDirectionId,
      }));
    }

    if (
      role === "SERVICE_MANAGER" &&
      currentAgentDirectionId &&
      currentAgentServiceId
    ) {
      setFilters((currentValue) => ({
        ...currentValue,
        directionId:
          currentAgentDirectionId,
        serviceId:
          currentAgentServiceId,
      }));
    }
  }, [
    role,
    currentAgentDirectionId,
    currentAgentServiceId,
  ]);

  const scopedDirections = useMemo(() => {
    if (
      role === "DIRECTION" ||
      role === "SERVICE_MANAGER"
    ) {
      return directions.filter(
        (direction) =>
          sameId(
            direction.id,
            currentAgentDirectionId,
          ),
      );
    }

    return directions;
  }, [
    currentAgentDirectionId,
    directions,
    role,
  ]);

  const selectedFilterDirection =
    directions.find(
      (direction) =>
        direction.id === filters.directionId,
    );

  const availableServices = useMemo(() => {
    const services =
      selectedFilterDirection?.services.filter(
        (service) =>
          service.status === "ACTIVE",
      ) ?? [];

    if (role === "SERVICE_MANAGER") {
      return services.filter((service) =>
        sameId(
          service.id,
          currentAgentServiceId,
        ),
      );
    }

    return services;
  }, [
    currentAgentServiceId,
    role,
    selectedFilterDirection,
  ]);

  const availableResponsibleAgents =
    useMemo(() => {
      let candidates = agents;

      if (
        role === "DIRECTION" &&
        currentAgentDirectionId
      ) {
        candidates = candidates.filter(
          (agent) =>
            sameId(
              agent.directionId,
              currentAgentDirectionId,
            ),
        );
      }

      if (
        role === "SERVICE_MANAGER" &&
        currentAgentDirectionId &&
        currentAgentServiceId
      ) {
        candidates = candidates.filter(
          (agent) =>
            sameId(
              agent.directionId,
              currentAgentDirectionId,
            ) &&
            sameId(
              agent.serviceId,
              currentAgentServiceId,
            ),
        );
      }

      if (filters.serviceId) {
        return candidates.filter(
          (agent) =>
            sameId(
              agent.serviceId,
              filters.serviceId,
            ),
        );
      }

      if (filters.directionId) {
        return candidates.filter(
          (agent) =>
            sameId(
              agent.directionId,
              filters.directionId,
            ),
        );
      }

      return candidates;
    }, [
      agents,
      currentAgentDirectionId,
      currentAgentServiceId,
      filters.directionId,
      filters.serviceId,
      role,
    ]);

  const organizationLookup = useMemo(() => {
    const directionsMap =
      new Map<string, string>();

    const servicesMap =
      new Map<string, string>();

    directions.forEach(
      (direction) => {
        directionsMap.set(
          direction.id,
          direction.name,
        );

        direction.services?.forEach(
          (service) => {
            servicesMap.set(
              service.id,
              service.name,
            );
          },
        );
      },
    );

    return {
      directionsMap,
      servicesMap,
    };
  }, [directions]);

  const agentLookup = useMemo(
    () =>
      new Map(
        agents.map((agent) => [
          agent.id,
          agent.fullName,
        ]),
      ),
    [agents],
  );

  const directionProfileMissing =
    role === "DIRECTION" &&
    !currentAgentDirectionId;

  const serviceManagerProfileMissing =
    role === "SERVICE_MANAGER" &&
    (!currentAgentDirectionId ||
      !currentAgentServiceId);

  const canOpenCreateModal =
    canCreateTasks &&
    taskScopeQuery.isSuccess &&
    scopeReady &&
    scopedDirections.length > 0 &&
    agents.length > 0 &&
    !directionProfileMissing &&
    !serviceManagerProfileMissing;

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (filters.search.trim()) count += 1;
    if (filters.priority) count += 1;
    if (filters.status) count += 1;
    if (filters.assignedToAgentId) count += 1;
    if (filters.due !== "ALL") count += 1;

    if (
      role !== "DIRECTION" &&
      role !== "SERVICE_MANAGER" &&
      filters.directionId
    ) {
      count += 1;
    }

    if (
      role !== "SERVICE_MANAGER" &&
      filters.serviceId
    ) {
      count += 1;
    }

    return count;
  }, [
    filters.assignedToAgentId,
    filters.directionId,
    filters.due,
    filters.priority,
    filters.search,
    filters.serviceId,
    filters.status,
    role,
  ]);

  const isRefreshing =
    taskScopeQuery.isFetching ||
    statsQuery.isFetching ||
    (displayMode === "BOARD"
      ? boardQuery.isFetching
      : listQuery.isFetching) ||
    (canReadOrganization &&
      organizationQuery.isFetching) ||
    (canReadAgents &&
      agentsQuery.isFetching);

  async function refreshTasks(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["tasks"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["task-stats"],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          "agents",
          "task-select",
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          "organization-tree",
        ],
      }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: createTask,

    onSuccess: async (task) => {
      queryClient.setQueryData(["task", task.id], task);
      setSaveMessage("La tâche a été créée.");
      await refreshTasks();
      setIsFormOpen(false);
      setEditingTask(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      taskId,
      input,
    }: {
      taskId: string;
      input: CreateTaskInput;
    }) => updateTask(taskId, input),

    onSuccess: async (
      task,
      variables,
    ) => {
      queryClient.setQueryData(["task", task.id], task);
      setSaveMessage("Les modifications de la tâche ont été enregistrées.");
      await Promise.all([
        refreshTasks(),
        queryClient.invalidateQueries({
          queryKey: [
            "task",
            variables.taskId,
          ],
        }),
      ]);

      setIsFormOpen(false);
      setEditingTask(null);
    },
  });

  const formError =
    createMutation.isError
      ? getApiErrorMessage(
          createMutation.error,
        )
      : updateMutation.isError
        ? getApiErrorMessage(
            updateMutation.error,
          )
        : null;

  const updateFilter = useCallback(
    (
      key: keyof TaskFilters,
      value: string,
    ): void => {
      setFilters((currentValue) => ({
        ...currentValue,
        [key]: value,

        ...(key === "directionId"
          ? {
              serviceId: "",
              assignedToAgentId: "",
            }
          : {}),

        ...(key === "serviceId"
          ? {
              assignedToAgentId: "",
            }
          : {}),
      }));
    },
    [],
  );

  const resetFilters = useCallback((): void => {
    setFilters({
      search: "",
      priority: "",
      status: "",

      directionId:
        role === "DIRECTION" ||
        role === "SERVICE_MANAGER"
          ? currentAgentDirectionId ??
            ""
          : "",

      serviceId:
        role === "SERVICE_MANAGER"
          ? currentAgentServiceId ??
            ""
          : "",

      assignedToAgentId: "",
      due: "ALL",
    });
  }, [
    currentAgentDirectionId,
    currentAgentServiceId,
    role,
  ]);

  const openTask = useCallback(
    (taskId: string, trigger?: HTMLButtonElement): void => {
      taskViewTriggerRef.current = trigger ?? null;
      setSelectedTaskId(taskId);
    },
    [],
  );

  const openCreateModal = useCallback((): void => {
    if (!canCreateTasks) return;

    createMutation.reset();
    updateMutation.reset();

    setEditingTask(null);
    setEditError(null);
    setSaveMessage("");
    setIsFormOpen(true);
  }, [
    canCreateTasks,
    createMutation,
    updateMutation,
  ]);

  const openEditModal = useCallback(async (task: Task): Promise<void> => {
    if (!task.permissions?.canManage || isPreparingEdit) return;
    const requestId = ++editRequest.current;
    setIsPreparingEdit(true);
    setEditError(null);
    setSaveMessage("");
    try {
      // Le formulaire utilise la dernière version et les permissions actuelles.
      const latest = await getTaskById(task.id);
      if (requestId !== editRequest.current) return;
      if (!latest.permissions?.canManage) {
        throw new Error("Vous ne pouvez plus modifier cette tâche.");
      }
      queryClient.setQueryData(["task", latest.id], latest);
      createMutation.reset();
      updateMutation.reset();
      setSelectedTaskId(null);
      setEditingTask(latest);
      setIsFormOpen(true);
    } catch (error) {
      if (requestId === editRequest.current) setEditError(getApiErrorMessage(error));
    } finally {
      if (requestId === editRequest.current) setIsPreparingEdit(false);
    }
  }, [isPreparingEdit, queryClient, createMutation, updateMutation]);

  const selectMetric = (metric: MetricSelection): void => {
    // Les chiffres représentent le périmètre accessible, sans les filtres manuels.
    resetFilters();
    setFilters(previous => ({
      ...previous,
      status: metric === "progress" ? "IN_PROGRESS" : metric === "complete" ? "COMPLETED" : "",
      due: metric === "alert" ? "OVERDUE" : "ALL",
    }));
    setDebouncedSearch("");
    setPage(1);
  };
  const metricBaseActive = !filters.search && !filters.priority && !filters.assignedToAgentId
    && filters.directionId === ((role === "DIRECTION" || role === "SERVICE_MANAGER") ? currentAgentDirectionId ?? "" : "")
    && filters.serviceId === (role === "SERVICE_MANAGER" ? currentAgentServiceId ?? "" : "");
  const activeMetric: MetricSelection | null = !metricBaseActive ? null
    : filters.due === "OVERDUE" && !filters.status ? "alert"
    : filters.due !== "ALL" ? null
    : filters.status === "IN_PROGRESS" ? "progress"
    : filters.status === "COMPLETED" ? "complete"
    : !filters.status ? "total" : null;

  async function handleSubmitTask(
    input: CreateTaskInput,
  ): Promise<void> {
    if (editingTask) {
      await updateMutation.mutateAsync({
        taskId: editingTask.id,
        input,
      });

      return;
    }

    await createMutation.mutateAsync(
      input,
    );
  }

  const handleManualRefresh =
    useCallback(async (): Promise<void> => {
      const refreshes: Promise<unknown>[] = [
        taskScopeQuery.refetch(),
        statsQuery.refetch(),
        displayMode === "BOARD"
          ? boardQuery.refetch()
          : listQuery.refetch(),
      ];

      if (canReadOrganization) {
        refreshes.push(
          organizationQuery.refetch(),
        );
      }

      if (
        canReadAgents &&
        taskScopeQuery.isSuccess &&
        scopeReady
      ) {
        refreshes.push(
          agentsQuery.refetch(),
        );
      }

      await Promise.all(refreshes);
    }, [
      agentsQuery,
      boardQuery,
      canReadAgents,
      canReadOrganization,
      displayMode,
      listQuery,
      organizationQuery,
      scopeReady,
      statsQuery,
      taskScopeQuery,
    ]);

  useEffect(() => {
    setExpandedColumns({});
  }, [debouncedSearch, filters.priority, filters.status, filters.directionId,
    filters.serviceId, filters.assignedToAgentId, filters.due, role,
    currentAgentDirectionId, currentAgentServiceId]);

  const boardColumns = useMemo<TaskBoardResult["columns"] | undefined>(() => {
    if (!boardQuery.data?.columns) return undefined;
    const columns = { ...boardQuery.data.columns };
    for (const status of taskStatusOrder) {
      columns[status] = [...(columns[status] ?? [])].sort((first, second) => {
        // Une tâche récemment terminée remonte à sa date de fin.
        // Dans les autres colonnes, priorité à la dernière actualisation.
        const firstDate = Date.parse(
          (status === "COMPLETED" ? first.completedAt : undefined)
            ?? first.updatedAt ?? first.createdAt ?? "",
        );
        const secondDate = Date.parse(
          (status === "COMPLETED" ? second.completedAt : undefined)
            ?? second.updatedAt ?? second.createdAt ?? "",
        );
        const delta = (Number.isFinite(secondDate) ? secondDate : 0)
          - (Number.isFinite(firstDate) ? firstDate : 0);
        return delta || second.id.localeCompare(first.id);
      });
    }
    return columns;
  }, [boardQuery.data?.columns]);

  const listTasks: Task[] =
    listQuery.data?.items ?? [];

  const pagination =
    listQuery.data?.pagination;

  const hasTaskDataError =
    statsQuery.isError ||
    boardQuery.isError ||
    listQuery.isError ||
    agentsQuery.isError ||
    organizationQuery.isError ||
    taskScopeQuery.isError;

  const visibleBoardCount =
    displayMode === "BOARD"
      ? taskStatusOrder.reduce(
          (total, status) =>
            total +
            (boardColumns?.[status]
              ?.length ?? 0),
          0,
        )
      : 0;

  return (
    <section className="tasks-page">
      <p className="task-ux-feedback" role="status" aria-live="polite">{isPreparingEdit ? "Chargement de la dernière version de la tâche…" : saveMessage}</p>
      {editError && <p className="task-ux-error" role="alert">{editError}</p>}
      <div className="task-view-status" role="status" aria-live="polite">
        {selectedTaskId && selectedTaskQuery.isPending ? "Ouverture de la tâche…" : ""}
      </div>
      {selectedTaskId && selectedTaskQuery.isPending && (
        <button className="task-cancel-button" type="button" onClick={() => { setSelectedTaskId(null); window.requestAnimationFrame(() => taskViewTriggerRef.current?.focus()); }}>Annuler l’ouverture</button>
      )}
      {selectedTaskId && selectedTaskQuery.isError && !selectedTaskQuery.data && (
        <div className="task-view-error" role="alert">
          <p>Impossible d’ouvrir la tâche : {getApiErrorMessage(selectedTaskQuery.error)}</p>
          <button className="task-secondary-button" type="button" disabled={selectedTaskQuery.isFetching} aria-busy={selectedTaskQuery.isFetching} onClick={() => void selectedTaskQuery.refetch()}>{selectedTaskQuery.isFetching ? "Chargement…" : "Réessayer"}</button>
          <button className="task-cancel-button" type="button" onClick={() => { setSelectedTaskId(null); window.requestAnimationFrame(() => taskViewTriggerRef.current?.focus()); }}>Fermer</button>
        </div>
      )}
      <header className="tasks-hero">
        <div className="tasks-hero-copy">
          <p className="tasks-eyebrow">
            PILOTAGE DES ACTIVITÉS
          </p>

          <h2>
            Tâches et <span>suivi.</span>
          </h2>

           
        </div>

        <div className="tasks-hero-actions">
          <button
            className="tasks-secondary-button"
            type="button"
            onClick={() =>
              void handleManualRefresh()
            }
            disabled={isRefreshing}
           data-ui-action="compact" aria-label="Actualiser" title="Actualiser">
            <RefreshCw
              size={18}
              className={
                isRefreshing
                  ? "is-spinning"
                  : undefined
              }
            />
            <span>
              {isRefreshing
                ? "Actualisation..."
                : "Actualiser"}
            </span>
          </button>

          {canCreateTasks && (
            <button
              className="tasks-primary-button"
              type="button"
              onClick={openCreateModal}
              disabled={
                !canOpenCreateModal
              }
             data-ui-action="compact" aria-label="Nouvelle tâche" title="Nouvelle tâche">
              <Plus size={18} />
              <span className="ui-action-label">
                Nouvelle tâche
              </span>
            </button>
          )}
        </div>
      </header>

      {role === "RH_MANAGER" && (
        <div className="tasks-alert tasks-rh-readonly-page-alert">
          <CircleAlert size={20} />
          <div>
            <strong>
              Création et consultation RH.
            </strong>
            <p>
              Vous pouvez créer des tâches pour tous les agents de votre entreprise,
              consulter leur avancement, les KPI et télécharger les pièces justificatives.
              La modification et la validation des activités existantes restent réservées
              aux rôles habilités.
            </p>
          </div>
        </div>
      )}

      {hasTaskDataError && (
        <div className="tasks-alert">
          <CircleAlert size={20} />
          <div>
            <strong>
              Certaines données Tâches
              sont indisponibles.
            </strong>
            <p>
              Vérifiez que la session est
              active et que le compte est
              correctement rattaché.
            </p>
          </div>
        </div>
      )}

      <section className="tasks-metrics-grid">
        <button type="button"
          className={`tasks-metric-card tasks-metric-action total ${activeMetric === "total" ? "is-selected" : ""}`}
          aria-label="Afficher toutes les tâches"
          aria-pressed={activeMetric === "total"}
          onClick={() => selectMetric("total")} aria-controls="tasks-results">
          <span className="tasks-metric-icon total">
            <SquareCheckBig size={21} />
          </span>
          <span className="tasks-metric-copy">
            <span>Total des tâches</span>
            <strong>
              {statsQuery.data?.total ??
                "—"}
            </strong>
            <span className="tasks-metric-description">Activités accessibles</span>
          </span>
        </button>

        <button type="button"
          className={`tasks-metric-card tasks-metric-action progress ${activeMetric === "progress" ? "is-selected" : ""}`}
          aria-label="Afficher les tâches en cours"
          aria-pressed={activeMetric === "progress"}
          onClick={() => selectMetric("progress")} aria-controls="tasks-results">
          <span className="tasks-metric-icon progress">
            <CalendarClock size={21} />
          </span>
          <span className="tasks-metric-copy">
            <span>En cours</span>
            <strong>
              {statsQuery.data
                ?.inProgress ?? "—"}
            </strong>
            <span className="tasks-metric-description">
              Actions opérationnelles
            </span>
          </span>
        </button>

        <button type="button"
          className={`tasks-metric-card tasks-metric-action alert ${activeMetric === "alert" ? "is-selected" : ""}`}
          aria-label="Afficher les tâches en retard"
          aria-pressed={activeMetric === "alert"}
          onClick={() => selectMetric("alert")} aria-controls="tasks-results">
          <span className="tasks-metric-icon alert">
            <AlertTriangle size={21} />
          </span>
          <span className="tasks-metric-copy">
            <span>En retard</span>
            <strong>
              {statsQuery.data
                ?.overdue ?? "—"}
            </strong>
            <span className="tasks-metric-description">
              À traiter rapidement
            </span>
          </span>
        </button>

        <button type="button"
          className={`tasks-metric-card tasks-metric-action complete ${activeMetric === "complete" ? "is-selected" : ""}`}
          aria-label="Afficher les tâches terminées"
          aria-pressed={activeMetric === "complete"}
          onClick={() => selectMetric("complete")} aria-controls="tasks-results">
          <span className="tasks-metric-icon complete">
            <CheckCircle2 size={21} />
          </span>
          <span className="tasks-metric-copy">
            <span>Terminées</span>
            <strong>
              {statsQuery.data
                ?.completed ?? "—"}
            </strong>
            <span className="tasks-metric-description">Objectifs finalisés</span>
          </span>
        </button>
      </section>

      <section className="tasks-filter-panel">
        <div className="tasks-filter-header">
          <div className="tasks-filter-heading">
            <span className="tasks-filter-heading-icon">
              <Filter size={18} />
            </span>

            <div>
              <p>RECHERCHE ET FILTRES</p>
              <h3>
                Affiner les activités
              </h3>
            </div>
          </div>

          <div className="tasks-filter-toolbar">
            <span className="tasks-active-filter-count">
              {activeFilterCount > 0
                ? `${activeFilterCount} filtre${
                    activeFilterCount > 1
                      ? "s"
                      : ""
                  } actif${
                    activeFilterCount > 1
                      ? "s"
                      : ""
                  }`
                : "Aucun filtre actif"}
            </span>

            <div className="tasks-view-toggle">
              <button
                type="button"
                aria-pressed={
                  displayMode === "BOARD"
                }
                className={
                  displayMode === "BOARD"
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  setDisplayMode("BOARD")
                }
              >
                <Columns3 size={17} />
                <span>Kanban</span>
              </button>

              <button
                type="button"
                aria-pressed={
                  displayMode === "LIST"
                }
                className={
                  displayMode === "LIST"
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  setDisplayMode("LIST")
                }
              >
                <List size={17} />
                <span>Liste</span>
              </button>
            </div>
          </div>
        </div>

        <div className="tasks-filters">
          <label className="tasks-search-field">
            <span className="tasks-visually-hidden">
              Rechercher une tâche
            </span>
            <Search size={18} />

            <input
              value={filters.search}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) =>
                updateFilter(
                  "search",
                  event.target.value,
                )
              }
              placeholder="Titre, référence, description, KPI ou étiquette..."
            />
          </label>

          {displayMode === "LIST" && (
            <label className="tasks-filter-field">
              <span>Statut</span>
              <select
                value={filters.status}
                onChange={(event) =>
                  updateFilter(
                    "status",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Tous les statuts
                </option>

                {taskStatusOrder.map(
                  (status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {
                        statusLabels[
                          status
                        ]
                      }
                    </option>
                  ),
                )}
              </select>
            </label>
          )}

          <label className="tasks-filter-field">
            <span>Priorité</span>
            <select
              value={filters.priority}
              onChange={(event) =>
                updateFilter(
                  "priority",
                  event.target.value,
                )
              }
            >
              <option value="">
                Toutes les priorités
              </option>

              {Object.entries(
                priorityLabels,
              ).map(([value, label]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="tasks-filter-field">
            <span>Direction</span>
            <select
              value={filters.directionId}
              disabled={
                role === "DIRECTION" ||
                role ===
                  "SERVICE_MANAGER"
              }
              onChange={(event) =>
                updateFilter(
                  "directionId",
                  event.target.value,
                )
              }
            >
              <option value="">
                Toutes les Directions
              </option>

              {scopedDirections.map(
                (direction) => (
                  <option
                    key={direction.id}
                    value={direction.id}
                  >
                    {direction.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="tasks-filter-field">
            <span>Service</span>
            <select
              value={filters.serviceId}
              disabled={
                !filters.directionId ||
                role ===
                  "SERVICE_MANAGER"
              }
              onChange={(event) =>
                updateFilter(
                  "serviceId",
                  event.target.value,
                )
              }
            >
              <option value="">
                Tous les Services
              </option>

              {availableServices.map(
                (service) => (
                  <option
                    key={service.id}
                    value={service.id}
                  >
                    {service.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="tasks-filter-field">
            <span>Responsable</span>
            <select
              value={
                filters.assignedToAgentId
              }
              onChange={(event) =>
                updateFilter(
                  "assignedToAgentId",
                  event.target.value,
                )
              }
            >
              <option value="">
                Tous les responsables
              </option>

              {availableResponsibleAgents.map(
                (agent) => (
                  <option
                    key={agent.id}
                    value={agent.id}
                  >
                    {agent.fullName}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="tasks-filter-field">
            <span>Échéance</span>
            <select
              value={filters.due}
              onChange={(event) =>
                updateFilter(
                  "due",
                  event.target.value,
                )
              }
            >
              <option value="ALL">
                Toutes les échéances
              </option>
              <option value="OVERDUE">
                En retard
              </option>
              <option value="TODAY">
                Aujourd’hui
              </option>
              <option value="NEXT_7_DAYS">
                Dans les 7 jours
              </option>
              <option value="NO_DUE_DATE">
                Sans échéance
              </option>
            </select>
          </label>

          <button
            className="tasks-clear-button tasks-reset-button"
            type="button"
            onClick={resetFilters}
            disabled={
              activeFilterCount === 0
            }
          >
            Réinitialiser
          </button>
        </div>
      </section>

      {displayMode === "BOARD" && (
        <section id="tasks-results" className="tasks-board-shell" aria-label="Résultats des tâches" aria-busy={boardQuery.isFetching}>
          <header className="tasks-content-heading">
            <div>
              <p>VUE OPÉRATIONNELLE</p>
              <h3>Tableau Kanban</h3>
            </div>

            <span className="tasks-list-count">
              {visibleBoardCount} tâche
              {visibleBoardCount > 1
                ? "s"
                : ""}
            </span>
          </header>

          {boardQuery.isLoading && (
            <div className="tasks-loading-state">
              <LoaderCircle
                size={24}
                className="is-spinning"
              />
              <span>
                Chargement du tableau
                Kanban...
              </span>
            </div>
          )}

          {!boardQuery.isLoading && (
            <div className="tasks-board">
              {taskStatusOrder.map(
                (status) => {
                  const tasks: Task[] =
                    boardColumns?.[
                      status
                    ] ?? [];
                  const isExpanded = expandedColumns[status] === true;
                  const displayedTasks = isExpanded ? tasks : tasks.slice(0, 4);
                  const remainingCount = tasks.length - displayedTasks.length;

                  return (
                    <article
                      key={status}
                      className={`tasks-kanban-column ${getStatusClass(
                        status,
                      )}`}
                    >
                      <header>
                        <div>
                          <span>
                            {
                              statusLabels[
                                status
                              ]
                            }
                          </span>
                          <strong>
                            {tasks.length}
                          </strong>
                        </div>
                      </header>

                      <div className="tasks-kanban-list" id={`tasks-column-${status}`}>
                        {tasks.length === 0 && (
                          <p className="tasks-kanban-empty">
                            Aucune tâche dans
                            cette colonne.
                          </p>
                        )}

                        {displayedTasks.map(
                          (task: Task) => {
                            const kpi =
                              getKpiSummary(
                                task,
                              );

                            const directionName =
                              organizationLookup
                                .directionsMap.get(
                                  task.directionId,
                                );

                            const serviceName =
                              task.serviceId
                                ? organizationLookup
                                    .servicesMap.get(
                                      task.serviceId,
                                    )
                                : null;

                            return (
                              <button
                                key={task.id}
                                className={`task-kanban-card${
                                  isTaskOverdue(
                                    task,
                                  )
                                    ? " is-overdue-card"
                                    : ""
                                }`}
                                type="button"
                                aria-haspopup="dialog"
                                disabled={Boolean(selectedTaskId && selectedTaskQuery.isPending)}
                                aria-busy={selectedTaskId === task.id && selectedTaskQuery.isPending}
                                onClick={(event) => openTask(task.id, event.currentTarget)}
                              >
                                <div className="task-card-top">
                                  <div className="task-card-reference">
                                    <span
                                      className={`task-priority-dot ${getPriorityClass(
                                        task.priority,
                                      )}`}
                                    />
                                    <small>
                                      {
                                        task.reference
                                      }
                                    </small>
                                  </div>

                                  <span
                                    className={`task-priority-badge ${getPriorityClass(
                                      task.priority,
                                    )}`}
                                  >
                                    {
                                      priorityLabels[
                                        task.priority
                                      ]
                                    }
                                  </span>
                                </div>

                                <strong className="task-card-title">
                                  {task.title}
                                </strong>

                                <div className="task-card-context">
                                  <span>
                                    <UserRound
                                      size={14}
                                    />
                                    {agentLookup.get(
                                      task.assignedToAgentId,
                                    ) ??
                                      "Agent non renseigné"}
                                  </span>

                                  {(serviceName ||
                                    directionName) && (
                                    <span>
                                      <Building2
                                        size={14}
                                      />
                                      {serviceName ??
                                        directionName ??
                                        "Structure non renseignée"}
                                    </span>
                                  )}
                                </div>

                                <div className="task-card-progress">
                                  <div>
                                    <span>
                                      Progression
                                    </span>
                                    <strong>
                                      {
                                        task.progressPercentage
                                      }
                                      %
                                    </strong>
                                  </div>

                                  <span>
                                    <i
                                      style={{
                                        width: `${task.progressPercentage}%`,
                                      }}
                                    />
                                  </span>
                                </div>

                                <footer>
                                  <span
                                    className={
                                      isTaskOverdue(
                                        task,
                                      )
                                        ? "is-overdue"
                                        : ""
                                    }
                                  >
                                    <CalendarClock
                                      size={14}
                                    />
                                    {formatDate(
                                      task.dueDate,
                                    )}
                                  </span>

                                  {kpi.total > 0 && (
                                    <span className="task-card-kpi">
                                      <Target
                                        size={14}
                                      />
                                      {
                                        kpi.completed
                                      }
                                      /{kpi.total} KPI
                                    </span>
                                  )}
                                </footer>
                              </button>
                            );
                          },
                        )}
                      </div>
                      {tasks.length > 4 && (
                        <footer className="tasks-kanban-more">
                          <p role="status" aria-live="polite">
                            {displayedTasks.length} sur {tasks.length} tâches affichées
                          </p>
                          <button type="button" className="task-secondary-button tasks-kanban-expand-icon"
                            title={isExpanded ? "Réduire à quatre tâches" : `Afficher les ${remainingCount} autres tâches`}
                            aria-controls={`tasks-column-${status}`}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded
                              ? `Réduire la colonne ${statusLabels[status]} à quatre tâches`
                              : `Afficher les ${remainingCount} autres tâches de la colonne ${statusLabels[status]}`}
                            onClick={() => setExpandedColumns((current) => ({
                              ...current, [status]: !current[status],
                            }))}>
                            {isExpanded ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
                          </button>
                        </footer>
                      )}
                    </article>
                  );
                },
              )}
            </div>
          )}
        </section>
      )}

      {displayMode === "LIST" && (
        <section id="tasks-results" className="tasks-list-panel" aria-label="Résultats des tâches" aria-busy={listQuery.isFetching}>
          <header className="tasks-list-header">
            <div>
              <p>
                LISTE DES ACTIVITÉS
              </p>
              <h3>
                Tâches filtrées
              </h3>
            </div>

            <span className="tasks-list-count">
              {pagination?.total ?? 0}{" "}
              résultat
              {(pagination?.total ??
                0) > 1
                ? "s"
                : ""}
            </span>
          </header>

          {listQuery.isLoading && (
            <div className="tasks-loading-state">
              <LoaderCircle
                size={24}
                className="is-spinning"
              />
              <span>
                Chargement des tâches...
              </span>
            </div>
          )}

          {!listQuery.isLoading &&
            !listQuery.isError &&
            listTasks.length === 0 && (
              <div className="tasks-empty-state">
                <SquareCheckBig
                  size={30}
                />
                <strong>
                  Aucune tâche trouvée.
                </strong>
                <p>
                  Modifiez vos filtres
                  ou créez une nouvelle
                  activité.
                </p>
              </div>
            )}

          {listTasks.length > 0 && (
            <div className="tasks-list-table">
              <div
                className="tasks-list-columns"
                aria-hidden="true"
              >
                <span>Tâche</span>
                <span>Responsable</span>
                <span>Structure</span>
                <span>Statut</span>
                <span>Progression</span>
                <span>Échéance</span>
              </div>

              <div className="tasks-list">
                {listTasks.map(
                  (task: Task) => {
                    const directionName =
                      organizationLookup
                        .directionsMap.get(
                          task.directionId,
                        ) ??
                      "Direction non renseignée";

                    const serviceName =
                      task.serviceId
                        ? organizationLookup
                            .servicesMap.get(
                              task.serviceId,
                            ) ??
                          "Service non renseigné"
                        : "Aucun service";

                    const kpi =
                      getKpiSummary(task);

                    return (
                      <button
                        key={task.id}
                        className={`task-list-row${
                          isTaskOverdue(
                            task,
                          )
                            ? " is-overdue-row"
                            : ""
                        }`}
                        type="button"
                        aria-haspopup="dialog"
                        disabled={Boolean(selectedTaskId && selectedTaskQuery.isPending)}
                        aria-busy={selectedTaskId === task.id && selectedTaskQuery.isPending}
                        onClick={(event) => openTask(task.id, event.currentTarget)}
                      >
                        <div className="task-list-cell task-list-task-cell">
                          <div className="task-list-reference-line">
                            <span
                              className={`task-priority-dot ${getPriorityClass(
                                task.priority,
                              )}`}
                            />
                            <small>
                              {
                                task.reference
                              }
                            </small>
                            <span
                              className={`task-priority-badge ${getPriorityClass(
                                task.priority,
                              )}`}
                            >
                              {
                                priorityLabels[
                                  task.priority
                                ]
                              }
                            </span>
                          </div>

                          <strong>
                            {task.title}
                          </strong>

                          {kpi.total > 0 && (
                            <span className="task-list-kpi">
                              <Target
                                size={13}
                              />
                              {
                                kpi.completed
                              }
                              /{kpi.total} KPI
                            </span>
                          )}
                        </div>

                        <div className="task-list-cell">
                          <span className="task-list-mobile-label">
                            Responsable
                          </span>

                          <div className="task-list-person">
                            <span>
                              <UserRound
                                size={15}
                              />
                            </span>

                            <strong>
                              {agentLookup.get(
                                task.assignedToAgentId,
                              ) ??
                                "Agent non renseigné"}
                            </strong>
                          </div>
                        </div>

                        <div className="task-list-cell task-list-structure-cell">
                          <span className="task-list-mobile-label">
                            Structure
                          </span>

                          <strong>
                            {serviceName}
                          </strong>
                          <small>
                            {directionName}
                          </small>
                        </div>

                        <div className="task-list-cell">
                          <span className="task-list-mobile-label">
                            Statut
                          </span>

                          <span
                            className={`task-status-pill ${getStatusClass(
                              task.status,
                            )}`}
                          >
                            {
                              statusLabels[
                                task.status
                              ]
                            }
                          </span>
                        </div>

                        <div className="task-list-cell task-list-progress-cell">
                          <span className="task-list-mobile-label">
                            Progression
                          </span>

                          <div>
                            <strong>
                              {
                                task.progressPercentage
                              }
                              %
                            </strong>

                            <span>
                              <i
                                style={{
                                  width: `${task.progressPercentage}%`,
                                }}
                              />
                            </span>
                          </div>
                        </div>

                        <div className="task-list-cell task-list-due-cell">
                          <span className="task-list-mobile-label">
                            Échéance
                          </span>

                          <span
                            className={
                              isTaskOverdue(
                                task,
                              )
                                ? "tasks-overdue-date"
                                : ""
                            }
                          >
                            <CalendarClock
                              size={14}
                            />
                            {formatDate(
                              task.dueDate,
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          )}

          {pagination &&
            pagination.totalPages > 1 && (
              <div className="tasks-pagination">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((value) =>
                      Math.max(
                        1,
                        value - 1,
                      ),
                    )
                  }
                >
                  Précédent
                </button>

                <span>
                  Page {pagination.page} /{" "}
                  {pagination.totalPages}
                </span>

                <button
                  type="button"
                  disabled={
                    page >=
                    pagination.totalPages
                  }
                  onClick={() =>
                    setPage((value) =>
                      Math.min(
                        pagination.totalPages,
                        value + 1,
                      ),
                    )
                  }
                >
                  Suivant
                </button>
              </div>
            )}
        </section>
      )}

      {isFormOpen && (editingTask ? canManageTasks : canCreateTasks) && (
        <TaskFormModal
          key={`${editingTask?.id ?? "new-task"}-${editingTask?.updatedAt ?? "new"}-${currentAgentDirectionId ?? "no-direction"}-${currentAgentServiceId ?? "no-service"}`}
          task={editingTask}
          directions={scopedDirections}
          agents={agents as any}
          currentUserRole={role}
          currentAgentDirectionId={
            currentAgentDirectionId
          }
          currentAgentServiceId={
            currentAgentServiceId
          }
          isSubmitting={
            createMutation.isPending ||
            updateMutation.isPending
          }
          errorMessage={formError}
          onClose={() => {
            if (createMutation.isPending || updateMutation.isPending) return;
            setIsFormOpen(false);
            setEditingTask(null);
          }}
          onSubmit={handleSubmitTask}
        />
      )}

      {selectedTaskId &&
        selectedTaskQuery.data && (
          <TaskDetailsDrawer
            isPreparingEdit={isPreparingEdit}
            editError={editError}
            task={
              selectedTaskQuery.data
            }
            assigneeName={
              agentLookup.get(
                selectedTaskQuery.data
                  .assignedToAgentId,
              ) ??
              taskScope?.fullName ??
              "Agent non renseigné"
            }
            directionName={
              organizationLookup
                .directionsMap.get(
                  selectedTaskQuery
                    .data.directionId,
                ) ??
              "Direction non renseignée"
            }
            serviceName={
              selectedTaskQuery.data
                .serviceId
                ? organizationLookup
                    .servicesMap.get(
                      selectedTaskQuery
                        .data
                        .serviceId,
                    ) ??
                  "Service non renseigné"
                : "Aucun service précisé"
            }
            canManage={
              selectedTaskQuery.data
                .permissions
                ?.canManage ?? false
            }
            canUpdateProgress={
              selectedTaskQuery.data
                .permissions
                ?.canUpdateProgress ?? false
            }
            onClose={() => {
              editRequest.current += 1;
              setIsPreparingEdit(false);
              setEditError(null);
              setSelectedTaskId(null);
              window.requestAnimationFrame(() => taskViewTriggerRef.current?.focus());
            }}
            onEdit={(task) => {
              void openEditModal(task);
            }}
          />
        )}
    </section>
  );
}
