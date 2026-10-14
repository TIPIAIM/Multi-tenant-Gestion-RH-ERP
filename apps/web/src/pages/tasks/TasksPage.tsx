import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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
  TaskDueFilter,
  TaskPriority,
  TaskStatus,
} from "../../features/tasks/task.types";
import TaskDetailsDrawer from "./TaskDetailsDrawer";
import TaskFormModal from "./TaskFormModal";
import "./tasks-page.css";
import "./task-kpi.css";

type DisplayMode = "BOARD" | "LIST";

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

  /**
   * RH_MANAGER est volontairement absent :
   * il peut consulter toutes les tâches et leurs KPI,
   * mais ne doit pas créer, modifier ou valider.
   */
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
  const [editingTask, setEditingTask] =
    useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] =
    useState<string | null>(null);

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

  const boardQuery = useQuery({
    queryKey: [
      "tasks",
      "board",
      debouncedSearch,
      filters.priority,
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

  const listQuery = useQuery({
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

  const selectedTaskQuery = useQuery({
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
    canManageTasks &&
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

    onSuccess: async () => {
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
      _,
      variables,
    ) => {
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
    (taskId: string): void => {
      setSelectedTaskId(taskId);
    },
    [],
  );

  const openCreateModal = useCallback((): void => {
    if (!canManageTasks) return;

    createMutation.reset();
    updateMutation.reset();

    setEditingTask(null);
    setIsFormOpen(true);
  }, [
    canManageTasks,
    createMutation,
    updateMutation,
  ]);

  const openEditModal = useCallback(
    (task: Task): void => {
      if (!task.permissions?.canManage) {
        return;
      }

      createMutation.reset();
      updateMutation.reset();

      setEditingTask(task);
      setIsFormOpen(true);
    },
    [
      createMutation,
      updateMutation,
    ],
  );

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

  const boardColumns =
    boardQuery.data?.columns;

  const listTasks =
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
      <header className="tasks-hero">
        <div className="tasks-hero-copy">
          <p className="tasks-eyebrow">
            PILOTAGE DES ACTIVITÉS
          </p>

          <h2>
            Tâches et <span>suivi.</span>
          </h2>

          <p>
            Organisez les missions,
            attribuez les responsabilités,
            définissez les KPI attendus et
            suivez l’exécution opérationnelle.
          </p>
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

          {canManageTasks && (
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
              Consultation RH en lecture seule.
            </strong>
            <p>
              Vous pouvez consulter toutes les tâches,
              leur avancement, les KPI et télécharger
              les pièces justificatives disponibles,
              sans modifier ni valider les activités.
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
        <article className="tasks-metric-card">
          <span className="tasks-metric-icon total">
            <SquareCheckBig size={21} />
          </span>
          <div>
            <span>Total des tâches</span>
            <strong>
              {statsQuery.data?.total ??
                "—"}
            </strong>
            <p>Activités accessibles</p>
          </div>
        </article>

        <article className="tasks-metric-card">
          <span className="tasks-metric-icon progress">
            <CalendarClock size={21} />
          </span>
          <div>
            <span>En cours</span>
            <strong>
              {statsQuery.data
                ?.inProgress ?? "—"}
            </strong>
            <p>
              Actions opérationnelles
            </p>
          </div>
        </article>

        <article className="tasks-metric-card">
          <span className="tasks-metric-icon alert">
            <AlertTriangle size={21} />
          </span>
          <div>
            <span>En retard</span>
            <strong>
              {statsQuery.data
                ?.overdue ?? "—"}
            </strong>
            <p>
              À traiter rapidement
            </p>
          </div>
        </article>

        <article className="tasks-metric-card">
          <span className="tasks-metric-icon complete">
            <CheckCircle2 size={21} />
          </span>
          <div>
            <span>Terminées</span>
            <strong>
              {statsQuery.data
                ?.completed ?? "—"}
            </strong>
            <p>Objectifs finalisés</p>
          </div>
        </article>
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
        <section className="tasks-board-shell">
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
                  const tasks =
                    boardColumns?.[
                      status
                    ] ?? [];

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

                      <div className="tasks-kanban-list">
                        {tasks.length === 0 && (
                          <p className="tasks-kanban-empty">
                            Aucune tâche dans
                            cette colonne.
                          </p>
                        )}

                        {tasks.map(
                          (task) => {
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
                                onClick={() =>
                                  openTask(
                                    task.id,
                                  )
                                }
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
                    </article>
                  );
                },
              )}
            </div>
          )}
        </section>
      )}

      {displayMode === "LIST" && (
        <section className="tasks-list-panel">
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
                  (task) => {
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
                        onClick={() =>
                          openTask(task.id)
                        }
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

      {isFormOpen && canManageTasks && (
        <TaskFormModal
          key={`${editingTask?.id ?? "new-task"}-${currentAgentDirectionId ?? "no-direction"}-${currentAgentServiceId ?? "no-service"}`}
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
            setIsFormOpen(false);
            setEditingTask(null);
          }}
          onSubmit={handleSubmitTask}
        />
      )}

      {selectedTaskId &&
        selectedTaskQuery.data && (
          <TaskDetailsDrawer
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
            onClose={() =>
              setSelectedTaskId(null)
            }
            onEdit={(task) => {
              setSelectedTaskId(null);
              openEditModal(task);
            }}
          />
        )}
    </section>
  );
}
