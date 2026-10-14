import {
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
  BadgeCheck,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  Filter,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { useAuth } from "../../features/auth/auth.context";
import {
  addAgentHistory,
  createAgent,
  deleteAgent,
  getAgentById,
  getAgents,
  getAgentScope,
  getAgentStats,
  updateAgent,
} from "../../features/agents/agent.api";
import type {
  AddAgentHistoryInput,
  Agent,
  AgentEmploymentStatus,
  AgentScope,
  CreateAgentInput,
} from "../../features/agents/agent.types";
import { getOrganizationTree } from "../../features/organisation/organisation.api";
import AgentDetailsDrawer from "./AgentDetailsDrawer";
import AgentFormModal from "./AgentFormModal";
import "./agents-page.css";

type AgentFilters = {
  search: string;
  employmentStatus: "" | AgentEmploymentStatus;
  directionId: string;
  serviceId: string;
};

type ModalMode = "CREATE" | "EDIT" | null;

const statusLabels: Record<AgentEmploymentStatus, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  ON_LEAVE: "En congé",
  SUSPENDED: "Suspendu",
  LEFT: "Sorti",
};

function getInitials(fullName: string): string {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item.charAt(0).toUpperCase())
      .join("") || "A"
  );
}

function formatDate(value?: string): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getStatusClass(status: AgentEmploymentStatus): string {
  return status.toLowerCase().replace("_", "-");
}

function isDirectionScoped(scope?: AgentScope): boolean {
  return scope?.role === "DIRECTION";
}

function isServiceScoped(scope?: AgentScope): boolean {
  return scope?.role === "SERVICE_MANAGER";
}

function isOwnAgentScoped(scope?: AgentScope): boolean {
  return scope?.role === "AGENT";
}

export default function AgentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<AgentFilters>({
    search: "",
    employmentStatus: "",
    directionId: "",
    serviceId: "",
  });

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingAgent, setEditingAgent] =
    useState<Agent | null>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<
    string | null
  >(null);

  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters.search]);

  const scopeQuery = useQuery({
    queryKey: ["agents", "scope"],
    queryFn: getAgentScope,
    staleTime: 1000 * 60,
    retry: false,
  });

  const scope = scopeQuery.data;

  const lockedDirectionId =
    isDirectionScoped(scope) ||
    isServiceScoped(scope) ||
    isOwnAgentScoped(scope)
      ? scope?.directionId ?? ""
      : "";

  const lockedServiceId =
    isServiceScoped(scope) || isOwnAgentScoped(scope)
      ? scope?.serviceId ?? ""
      : "";

  const isDirectionFilterLocked = Boolean(lockedDirectionId);
  const isServiceFilterLocked = Boolean(lockedServiceId);

  const effectiveDirectionId =
    lockedDirectionId || filters.directionId;

  const effectiveServiceId =
    lockedServiceId || filters.serviceId;

  useEffect(() => {
    if (!scope) {
      return;
    }

    setFilters((currentValue) => {
      const nextDirectionId =
        lockedDirectionId || currentValue.directionId;

      const nextServiceId =
        lockedServiceId ||
        (lockedDirectionId &&
        currentValue.directionId !== lockedDirectionId
          ? ""
          : currentValue.serviceId);

      if (
        currentValue.directionId === nextDirectionId &&
        currentValue.serviceId === nextServiceId
      ) {
        return currentValue;
      }

      return {
        ...currentValue,
        directionId: nextDirectionId,
        serviceId: nextServiceId,
      };
    });
  }, [scope, lockedDirectionId, lockedServiceId]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    effectiveDirectionId,
    filters.employmentStatus,
    effectiveServiceId,
  ]);

  const organizationQuery = useQuery({
    queryKey: ["organization-tree"],
    queryFn: getOrganizationTree,
    staleTime: 1000 * 60 * 5,
  });

  const statsQuery = useQuery({
    queryKey: ["agent-stats"],
    queryFn: getAgentStats,
    staleTime: 1000 * 30,
    retry: false,
  });

  const agentsQuery = useQuery({
    queryKey: [
      "agents",
      page,
      debouncedSearch,
      filters.employmentStatus,
      effectiveDirectionId,
      effectiveServiceId,
    ],
    queryFn: () =>
      getAgents({
        page,
        limit: 12,
        search: debouncedSearch || undefined,
        employmentStatus:
          filters.employmentStatus || undefined,
        directionId: effectiveDirectionId || undefined,
        serviceId: effectiveServiceId || undefined,
      }),
    staleTime: 1000 * 20,
    retry: false,
  });

  const supervisorsQuery = useQuery({
    queryKey: [
      "agents",
      "supervisors",
      effectiveDirectionId,
      effectiveServiceId,
    ],
    queryFn: () =>
      getAgents({
        page: 1,
        limit: 100,
        employmentStatus: "ACTIVE",
        directionId: effectiveDirectionId || undefined,
        serviceId: effectiveServiceId || undefined,
      }),
    enabled: modalMode !== null || Boolean(selectedAgentId),
    staleTime: 1000 * 60,
    retry: false,
  });

  const selectedAgentQuery = useQuery({
    queryKey: ["agent", selectedAgentId],
    queryFn: () => getAgentById(selectedAgentId ?? ""),
    enabled: Boolean(selectedAgentId),
    retry: false,
  });

  const directions = organizationQuery.data ?? [];

  const visibleDirections = useMemo(() => {
    if (!lockedDirectionId) {
      return directions;
    }

    return directions.filter(
      (direction) => direction.id === lockedDirectionId,
    );
  }, [directions, lockedDirectionId]);

  const activeDirections = useMemo(
    () =>
      visibleDirections.filter(
        (direction) => direction.status === "ACTIVE",
      ),
    [visibleDirections],
  );

  const selectedFilterDirection = directions.find(
    (direction) => direction.id === effectiveDirectionId,
  );

  const availableFilterServices =
    selectedFilterDirection?.services.filter(
      (service) =>
        service.status === "ACTIVE" ||
        service.id === effectiveServiceId,
    ) ?? [];

  const agentLookup = useMemo(() => {
    const agents = supervisorsQuery.data?.items ?? [];

    return new Map(
      agents.map((agent) => [agent.id, agent.fullName]),
    );
  }, [supervisorsQuery.data?.items]);

  const organizationLookup = useMemo(() => {
    const directionNames = new Map<string, string>();
    const serviceNames = new Map<string, string>();

    directions.forEach((direction) => {
      directionNames.set(direction.id, direction.name);

      direction.services.forEach((service) => {
        serviceNames.set(service.id, service.name);
      });
    });

    return {
      directionNames,
      serviceNames,
    };
  }, [directions]);

  const canManageAgents =
    user?.role === "TENANT_ADMIN" ||
    user?.role === "RH_MANAGER";

  const canDeleteAgents = user?.role === "TENANT_ADMIN";

  async function refreshAgentData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["agents"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["agent-stats"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["agents", "scope"],
      }),
    ]);
  }

  function closeAgentModal(): void {
    setModalMode(null);
    setEditingAgent(null);
  }

  const createMutation = useMutation({
    mutationFn: createAgent,
    onSuccess: async () => {
      await refreshAgentData();
      setPage(1);
      closeAgentModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      agentId,
      input,
    }: {
      agentId: string;
      input: CreateAgentInput;
    }) => updateAgent(agentId, input),
    onSuccess: async () => {
      await refreshAgentData();

      if (editingAgent) {
        await queryClient.invalidateQueries({
          queryKey: ["agent", editingAgent.id],
        });
      }

      closeAgentModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: async () => {
      await refreshAgentData();
      setPage(1);
      setSelectedAgentId(null);
      setAgentToDelete(null);
    },
  });

  const addHistoryMutation = useMutation({
    mutationFn: ({
      agentId,
      input,
    }: {
      agentId: string;
      input: AddAgentHistoryInput;
    }) => addAgentHistory(agentId, input),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["agent", variables.agentId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["agents"],
        }),
      ]);
    },
  });

  const formError = createMutation.isError
    ? getApiErrorMessage(createMutation.error)
    : updateMutation.isError
      ? getApiErrorMessage(updateMutation.error)
      : null;

  const historyError = addHistoryMutation.isError
    ? getApiErrorMessage(addHistoryMutation.error)
    : null;

  const deleteError = deleteMutation.isError
    ? getApiErrorMessage(deleteMutation.error)
    : null;

  function openCreateModal(): void {
    createMutation.reset();
    updateMutation.reset();
    setEditingAgent(null);
    setModalMode("CREATE");
  }

  function openEditModal(agent: Agent): void {
    createMutation.reset();
    updateMutation.reset();
    setEditingAgent(agent);
    setModalMode("EDIT");
  }

  async function handleSaveAgent(
    input: CreateAgentInput,
  ): Promise<void> {
    if (modalMode === "EDIT" && editingAgent) {
      await updateMutation.mutateAsync({
        agentId: editingAgent.id,
        input,
      });

      return;
    }

    await createMutation.mutateAsync(input);
  }

  async function handleAddHistory(
    input: AddAgentHistoryInput,
  ): Promise<void> {
    if (!selectedAgentId) {
      return;
    }

    await addHistoryMutation.mutateAsync({
      agentId: selectedAgentId,
      input,
    });
  }

  async function handleDeleteAgent(): Promise<void> {
    if (!agentToDelete) {
      return;
    }

    await deleteMutation.mutateAsync(agentToDelete.id);
  }

  function updateFilter(
    key: keyof AgentFilters,
    value: string,
  ): void {
    setFilters((currentValue) => {
      if (key === "directionId" && isDirectionFilterLocked) {
        return currentValue;
      }

      if (key === "serviceId" && isServiceFilterLocked) {
        return currentValue;
      }

      return {
        ...currentValue,
        [key]: value,
        ...(key === "directionId" ? { serviceId: "" } : {}),
      };
    });
  }

  function clearFilters(): void {
    setFilters({
      search: "",
      employmentStatus: "",
      directionId: lockedDirectionId,
      serviceId: lockedServiceId,
    });
  }

  const agents = agentsQuery.data?.items ?? [];
  const pagination = agentsQuery.data?.pagination;

  const hasFilters =
    Boolean(filters.search) ||
    Boolean(filters.employmentStatus) ||
    Boolean(filters.directionId && !isDirectionFilterLocked) ||
    Boolean(filters.serviceId && !isServiceFilterLocked);

  return (
    <section className="agents-page">
      <header className="agents-hero">
        <div>
          <p className="agents-eyebrow">
            GESTION DES RESSOURCES HUMAINES
          </p>

          <h2>
            Dossiers <span>Agents.</span>
          </h2>

          <p>
            Centralisez les informations administratives, contrats,
            rattachements hiérarchiques et historiques professionnels
            du personnel .
          </p>
        </div>

        <div className="agents-hero-actions">
          <button
            className="agents-secondary-button"
            type="button"
            onClick={() =>
              void Promise.all([
                agentsQuery.refetch(),
                statsQuery.refetch(),
                scopeQuery.refetch(),
                organizationQuery.refetch(),
              ])
            }
            disabled={
              agentsQuery.isFetching ||
              statsQuery.isFetching ||
              scopeQuery.isFetching
            }
           data-ui-action="compact" aria-label="Actualiser" title="Actualiser">
            <RefreshCw
              size={18}
              className={
                agentsQuery.isFetching ||
                statsQuery.isFetching ||
                scopeQuery.isFetching
                  ? "is-spinning"
                  : ""
              }
            />
            <span className="ui-action-label">Actualiser</span>
          </button>

          {canManageAgents && (
            <button
              className="agents-primary-button"
              type="button"
              onClick={openCreateModal}
              disabled={activeDirections.length === 0}
              title={
                activeDirections.length === 0
                  ? "Créez d’abord une Direction active."
                  : "Créer un dossier agent"
              }
             aria-label={
                activeDirections.length === 0
                  ? "Créez d’abord une Direction active."
                  : "Créer un dossier agent"
              } data-ui-action="compact">
              <Plus size={18} />
              <span>Nouvel Agent</span>
            </button>
          )}
        </div>
      </header>

      {scopeQuery.isError && (
        <div className="agents-alert">
          <CircleAlert size={20} />
          <div>
            <strong>Périmètre Agent indisponible.</strong>
            <p>
              Le compte connecté doit être lié à un Agent actif avec
              une Direction renseignée pour accéder au module Agents
              avec un périmètre Direction ou Service.
            </p>
          </div>
        </div>
      )}

      {activeDirections.length === 0 &&
        !organizationQuery.isLoading && (
          <div className="agents-alert">
            <CircleAlert size={20} />
            <div>
              <strong>
                La structure organisationnelle doit être complétée.
              </strong>
              <p>
                Créez au moins une Direction active dans la Structure
                avant d’enregistrer un agent.
              </p>
            </div>
          </div>
        )}

      {(agentsQuery.isError ||
        statsQuery.isError ||
        organizationQuery.isError) && (
        <div className="agents-alert">
          <CircleAlert size={20} />
          <div>
            <strong>
              Une partie des données Agents est indisponible.
            </strong>
            <p>
              Vérifie que le serveur est démarré, que ta
              session est active et que le rôle possède AGENT_VIEW.
            </p>
          </div>
        </div>
      )}

      <section className="agents-metrics-grid">
        <article className="agents-metric-card">
          <span className="agents-metric-icon total">
            <UsersRound size={21} />
          </span>
          <div>
            <span>Total des agents</span>
            <strong>{statsQuery.data?.total ?? "—"}</strong>
            <p>Effectif accessible</p>
          </div>
        </article>

        <article className="agents-metric-card">
          <span className="agents-metric-icon active">
            <BadgeCheck size={21} />
          </span>
          <div>
            <span>Agents actifs</span>
            <strong>{statsQuery.data?.active ?? "—"}</strong>
            <p>Personnel actuellement opérationnel</p>
          </div>
        </article>

        <article className="agents-metric-card">
          <span className="agents-metric-icon leave">
            <BriefcaseBusiness size={21} />
          </span>
          <div>
            <span>En congé</span>
            <strong>{statsQuery.data?.onLeave ?? "—"}</strong>
            <p>Situation temporaire déclarée</p>
          </div>
        </article>
      </section>

      <section className="agents-filter-panel">
        <div className="agents-filter-heading">
          <Filter size={19} />
          <div>
            <strong>Recherche et filtres</strong>
            <span>
              {isDirectionScoped(scope)
                ? "Vous consultez uniquement les Agents de votre Direction."
                : isServiceScoped(scope)
                  ? "Vous consultez uniquement les Agents de votre Service."
                  : "Affinez rapidement la liste du personnel."}
            </span>
          </div>
        </div>

        <div className="agents-filters">
          <label className="agents-search-field">
            <Search size={18} />
            <input
              value={filters.search}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) => updateFilter("search", event.target.value)}
              placeholder="Nom, prénom, matricule, email ou poste..."
            />
          </label>

          <label className="agents-filter-field">
            <span>Statut</span>
            <select
              value={filters.employmentStatus}
              onChange={(
                event: ChangeEvent<HTMLSelectElement>,
              ) =>
                updateFilter(
                  "employmentStatus",
                  event.target.value,
                )
              }
            >
              <option value="">Tous les statuts</option>

              {Object.entries(statusLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="agents-filter-field">
            <span>Direction</span>
            <select
              value={effectiveDirectionId}
              onChange={(
                event: ChangeEvent<HTMLSelectElement>,
              ) =>
                updateFilter("directionId", event.target.value)
              }
              disabled={isDirectionFilterLocked}
              title={
                isDirectionFilterLocked
                  ? "Direction imposée par le compte connecté."
                  : "Filtrer par Direction"
              }
            >
              <option value="">Toutes les Directions</option>

              {visibleDirections.map((direction) => (
                <option key={direction.id} value={direction.id}>
                  {direction.name}
                </option>
              ))}
            </select>
          </label>

          <label className="agents-filter-field">
            <span>Service</span>
            <select
              value={effectiveServiceId}
              onChange={(
                event: ChangeEvent<HTMLSelectElement>,
              ) =>
                updateFilter("serviceId", event.target.value)
              }
              disabled={
                !effectiveDirectionId || isServiceFilterLocked
              }
              title={
                isServiceFilterLocked
                  ? "Service imposé par le compte connecté."
                  : "Filtrer par Service"
              }
            >
              <option value="">Tous les Services</option>

              {availableFilterServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="agents-clear-button"
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <X size={16} />
            <span>Effacer</span>
          </button>
        </div>
      </section>

      <section className="agents-list-panel">
        <header className="agents-list-header">
          <div>
            <p>PERSONNEL</p>
            <h3>Liste des agents</h3>
          </div>

          <span className="agents-list-count">
            {pagination?.total ?? 0} résultat
            {(pagination?.total ?? 0) > 1 ? "s" : ""}
          </span>
        </header>

        {agentsQuery.isLoading && (
          <div className="agents-loading-state">
            <LoaderCircle size={24} className="is-spinning" />
            <span>Chargement des agents...</span>
          </div>
        )}

        {!agentsQuery.isLoading &&
          !agentsQuery.isError &&
          agents.length === 0 && (
            <div className="agents-empty-state">
              <UsersRound size={34} />

              <h4>Aucun agent trouvé.</h4>

              <p>
                Ajustez vos filtres ou créez le premier dossier agent de votre structure organisationnelle
                .
              </p>

              {canManageAgents &&
                activeDirections.length > 0 && (
                  <button
                    className="agents-primary-button"
                    type="button"
                    onClick={openCreateModal}
                   data-ui-action="compact" aria-label="Créer un Agent" title="Créer un Agent">
                    <Plus size={18} />
                    <span className="ui-action-label">Créer un Agent</span>
                  </button>
                )}
            </div>
          )}

        {agents.length > 0 && (
          <div className="agents-table">
            <div className="agents-table-header">
              <span>Agent</span>
              <span>Rattachement</span>
              <span>Poste</span>
              <span>Statut</span>
              <span>Action</span>
            </div>

            <div className="agents-table-body">
              {agents.map((agent) => (
                <article key={agent.id} className="agent-row">
                  <div className="agent-identity-cell">
                    <span className="agent-row-avatar">
                      {getInitials(agent.fullName)}
                    </span>

                    <div>
                      <strong>{agent.fullName}</strong>
                      <span>{agent.matricule}</span>
                    </div>
                  </div>

                  <div className="agent-cell">
                    <span className="agent-cell-label">
                      Rattachement
                    </span>

                    <strong>
                      {organizationLookup.directionNames.get(
                        agent.directionId,
                      ) ?? "Direction non renseignée"}
                    </strong>

                    <small>
                      {organizationLookup.serviceNames.get(
                        agent.serviceId ?? "",
                      ) ?? "Aucun service précisé"}
                    </small>
                  </div>

                  <div className="agent-cell">
                    <span className="agent-cell-label">Poste</span>
                    <strong>{agent.jobTitle}</strong>
                    <small>{agent.grade || "Grade non renseigné"}</small>
                  </div>

                  <div className="agent-cell">
                    <span className="agent-cell-label">Statut</span>
                    <span
                      className={`agent-status-pill ${getStatusClass(
                        agent.employmentStatus,
                      )}`}
                    >
                      {statusLabels[agent.employmentStatus]}
                    </span>
                    <small>
                      Depuis {formatDate(agent.employmentStartDate)}
                    </small>
                  </div>

                  <div className="agent-row-actions">
                    <button
                      className="agent-view-button"
                      type="button"
                      onClick={() => setSelectedAgentId(agent.id)}
                     data-ui-action="compact" aria-label="Voir" title="Voir">
                      <Eye size={17} />
                      <span className="ui-action-label">Voir</span>
                    </button>

                    {canManageAgents && (
                      <button
                        className="agent-edit-button"
                        type="button"
                        title="Modifier cet agent"
                        onClick={() => openEditModal(agent)}
                       aria-label="Modifier cet agent">
                        <BriefcaseBusiness size={17} />
                      </button>
                    )}

                    {canDeleteAgents && (
                      <button
                        className="agent-delete-button"
                        type="button"
                        title="Supprimer définitivement cet agent"
                        onClick={() => {
                          deleteMutation.reset();
                          setAgentToDelete(agent);
                        }}
                        disabled={deleteMutation.isPending}
                       aria-label="Supprimer définitivement cet agent">
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <footer className="agents-pagination">
            <p>
              Page {pagination.page} sur {pagination.totalPages}
            </p>

            <div>
              <button
                type="button"
                onClick={() =>
                  setPage((currentValue) =>
                    Math.max(1, currentValue - 1),
                  )
                }
                disabled={pagination.page <= 1}
              >
                <ChevronLeft size={18} />
                <span>Précédent</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPage((currentValue) =>
                    Math.min(
                      pagination.totalPages,
                      currentValue + 1,
                    ),
                  )
                }
                disabled={
                  pagination.page >= pagination.totalPages
                }
              >
                <span>Suivant</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </footer>
        )}
      </section>

      {modalMode && (
        <AgentFormModal
          key={`${modalMode}-${editingAgent?.id ?? "new"}`}
          mode={modalMode}
          agent={editingAgent}
          directions={directions}
          supervisors={supervisorsQuery.data?.items ?? []}
          isSubmitting={
            createMutation.isPending || updateMutation.isPending
          }
          errorMessage={formError}
          onClose={closeAgentModal}
          onSubmit={handleSaveAgent}
        />
      )}

      {agentToDelete && (
        <div className="agent-delete-layer" role="presentation">
          <button
            className="agent-delete-backdrop"
            type="button"
            aria-label="Annuler la suppression"
            onClick={() => setAgentToDelete(null)}
            disabled={deleteMutation.isPending}
          />

          <section
            className="agent-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmer la suppression de l'agent"
          >
            <header>
              <span>SUPPRESSION ADMINISTRATEUR</span>
              <h3>Supprimer ce dossier Agent ?</h3>
            </header>

            <p>
              Cette action supprimera définitivement le dossier de
              <strong> {agentToDelete.fullName}</strong>. Les comptes utilisateurs
              liés à cet Agent seront automatiquement détachés.
            </p>

            <div className="agent-delete-warning">
              <CircleAlert size={18} />
              <span>
                La suppression est réservée à l'administrateur. Si cet Agent est
                renseigné comme supérieur hiérarchique d'autres agents, le backend
                refusera l'opération jusqu'à réaffectation.
              </span>
            </div>

            {deleteError && (
              <div className="agent-form-error" role="alert">
                <span>{deleteError}</span>
              </div>
            )}

            <footer>
              <button
                className="agent-cancel-button"
                type="button"
                onClick={() => setAgentToDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Annuler
              </button>

              <button
                className="agent-delete-danger-button"
                type="button"
                onClick={() => void handleDeleteAgent()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <LoaderCircle size={18} className="is-spinning" />
                    <span>Suppression...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    <span>Supprimer l'agent</span>
                  </>
                )}
              </button>
            </footer>
          </section>
        </div>
      )}

      {selectedAgentId && (
        <AgentDetailsDrawer
          agent={selectedAgentQuery.data}
          isLoading={selectedAgentQuery.isLoading}
          canManageAgents={canManageAgents}
          isAddingHistory={addHistoryMutation.isPending}
          historyError={historyError}
          getDirectionName={(directionId) =>
            organizationLookup.directionNames.get(directionId) ??
            "Direction non renseignée"
          }
          getServiceName={(serviceId) =>
            serviceId
              ? organizationLookup.serviceNames.get(serviceId) ??
                "Service non renseigné"
              : "Aucun service précisé"
          }
          getSupervisorName={(supervisorAgentId) =>
            supervisorAgentId
              ? agentLookup.get(supervisorAgentId) ??
                "Supérieur non renseigné"
              : "Aucun supérieur hiérarchique"
          }
          onClose={() => setSelectedAgentId(null)}
          onEdit={(agent) => {
            setSelectedAgentId(null);
            openEditModal(agent);
          }}
          onAddHistory={handleAddHistory}
        />
      )}
    </section>
  );
}
