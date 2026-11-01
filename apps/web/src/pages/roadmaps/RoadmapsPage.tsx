import { useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import {
  useEffect,
  useRef, useState,
  type ChangeEvent,
} from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Eye,
  Filter,
  LoaderCircle,
  Plus,
  Pencil,
  RefreshCw,
  Route,
  Search,
  Send,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "../../features/auth/auth.context";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import {
  approveRoadmap,
  createRoadmap,
  getRoadmapScope,
  getRoadmapStats,
  getRoadmaps,
  returnRoadmap,
  submitRoadmap,
  updateRoadmap,
} from "../../features/roadmaps/roadmap.api";
import type {
  CreateRoadmapInput,
  Roadmap,
  RoadmapListParams,
  RoadmapStatus,
  UpdateRoadmapInput,
} from "../../features/roadmaps/roadmap.types";
import {
  formatRoadmapDate,
  getApprovalHelp,
  getRoadmapProgressLabel,
  roadmapRoleLabels,
  roadmapStatusLabels,
  statusClass,
} from "../../features/roadmaps/roadmap.utils";
import RoadmapDetailsDrawer from "./RoadmapDetailsDrawer";
import RoadmapEditorModal from "./RoadmapEditorModal";
import "./roadmaps-page.css";
import "./roadmaps-ui.css";

type Filters = {
  search: string;
  status: "" | RoadmapStatus;
  year: string;
  sort: NonNullable<RoadmapListParams["sort"]>;
};

const defaultFilters: Filters = {
  search: "",
  status: "",
  year: String(new Date().getFullYear()),
  sort: "UPDATED_DESC",
};

export default function RoadmapsPage() {
  const viewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const role = user?.role ?? "";

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRoadmap, setEditingRoadmap] =
    useState<Roadmap | null>(null);
  const [selectedRoadmap, setSelectedRoadmap] =
    useState<Roadmap | null>(null);
  const roadmapLocation = useLocation();
  const linkedRoadmapId = new URLSearchParams(roadmapLocation.search).get("roadmap");
  const linkedRoadmapQuery = useQuery({
    queryKey: ["roadmaps", "notification-detail", user?.tenantId, user?.id, linkedRoadmapId, roadmapLocation.key],
    enabled: Boolean(user && linkedRoadmapId && /^[a-f\d]{24}$/i.test(linkedRoadmapId)),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      const response = await api.get<{ data: { roadmap: Roadmap } }>(`/roadmaps/${linkedRoadmapId}`, { signal });
      return response.data.data.roadmap;
    },
  });
  useEffect(() => {
    if (linkedRoadmapQuery.data) setSelectedRoadmap(linkedRoadmapQuery.data);
  }, [linkedRoadmapQuery.data]);


  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [filters.search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.status,
    filters.year,
    filters.sort,
  ]);

  const scopeQuery = useQuery({
    queryKey: ["roadmaps", "scope"],
    queryFn: getRoadmapScope,
    staleTime: 60_000,
    retry: false,
  });

  const canLoadRoadmaps =
    scopeQuery.isSuccess &&
    Boolean(scopeQuery.data) &&
    (
      scopeQuery.data.isGlobalScope ||
      scopeQuery.data.isConfigured
    );

  const statsQuery = useQuery({
    queryKey: ["roadmaps", "stats"],
    queryFn: getRoadmapStats,
    enabled: canLoadRoadmaps,
    staleTime: 20_000,
    retry: false,
  });

  const roadmapsQuery = useQuery({
    queryKey: [
      "roadmaps",
      "list",
      page,
      debouncedSearch,
      filters.status,
      filters.year,
      filters.sort,
      scopeQuery.data?.agentId,
      scopeQuery.data?.directionId,
      scopeQuery.data?.serviceId,
    ],

    queryFn: () =>
      getRoadmaps({
        page,
        limit: 15,
        search: debouncedSearch || undefined,
        status: filters.status || undefined,
        calendarYear: filters.year
          ? Number(filters.year)
          : undefined,
        sort: filters.sort,
      }),

    enabled: canLoadRoadmaps,
    staleTime: 15_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: ["roadmaps"],
    });
  }

  const createMutation = useMutation({
    mutationFn: createRoadmap,

    onSuccess: async (roadmap) => {
      await refresh();
      setIsEditorOpen(false);
      setEditingRoadmap(null);
      setSelectedRoadmap(roadmap);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateRoadmapInput;
    }) => updateRoadmap(id, input),

    onSuccess: async (roadmap) => {
      await refresh();
      setIsEditorOpen(false);
      setEditingRoadmap(null);
      setSelectedRoadmap(roadmap);
    },
  });

  const submitMutation = useMutation({
    mutationFn: submitRoadmap,

    onSuccess: async (roadmap) => {
      await refresh();
      setSelectedRoadmap(roadmap);
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({
      id,
      comment,
    }: {
      id: string;
      comment?: string;
    }) => approveRoadmap(id, comment),

    onSuccess: async (roadmap) => {
      await refresh();
      setSelectedRoadmap(roadmap);
    },
  });

  const returnMutation = useMutation({
    mutationFn: ({
      id,
      comment,
    }: {
      id: string;
      comment?: string;
    }) => returnRoadmap(id, comment),

    onSuccess: async (roadmap) => {
      await refresh();
      setSelectedRoadmap(roadmap);
    },
  });

  const formError = createMutation.isError
    ? getApiErrorMessage(createMutation.error)
    : updateMutation.isError
      ? getApiErrorMessage(updateMutation.error)
      : submitMutation.isError
        ? getApiErrorMessage(submitMutation.error)
        : null;

  const globalError = scopeQuery.isError
    ? getApiErrorMessage(scopeQuery.error)
    : roadmapsQuery.isError
      ? getApiErrorMessage(roadmapsQuery.error)
      : statsQuery.isError
        ? getApiErrorMessage(statsQuery.error)
        : approveMutation.isError
          ? getApiErrorMessage(approveMutation.error)
          : returnMutation.isError
            ? getApiErrorMessage(returnMutation.error)
            : null;

  const scope = scopeQuery.data;
  const roadmaps = roadmapsQuery.data?.items ?? [];
  const pagination = roadmapsQuery.data?.pagination;

  const canCreateRoadmap =
    Boolean(scope?.canCreate) &&
    ["TENANT_ADMIN", "RH_MANAGER", "DIRECTION", "SERVICE_MANAGER", "AGENT"].includes(role);

  const hasFilters =
    Boolean(filters.search.trim()) ||
    Boolean(filters.status) ||
    filters.year !== String(new Date().getFullYear()) ||
    filters.sort !== "UPDATED_DESC";

  const submittedCount =
    (statsQuery.data?.submitted ?? 0) +
    (statsQuery.data?.partiallyApproved ?? 0);

  async function saveRoadmap(
    input: CreateRoadmapInput | UpdateRoadmapInput,
    submit: boolean,
  ): Promise<void> {
    const roadmap = editingRoadmap
      ? await updateMutation.mutateAsync({
          id: editingRoadmap.id,
          input: input as UpdateRoadmapInput,
        })
      : await createMutation.mutateAsync(
          input as CreateRoadmapInput,
        );

    if (submit) {
      await submitMutation.mutateAsync(roadmap.id);
    }
  }

  function openCreateModal(): void {
    createMutation.reset();
    updateMutation.reset();
    submitMutation.reset();
    setEditingRoadmap(null);
    setIsEditorOpen(true);
  }

  function openEditModal(roadmap: Roadmap): void {
    createMutation.reset();
    updateMutation.reset();
    submitMutation.reset();
    setEditingRoadmap(roadmap);
    setIsEditorOpen(true);
  }

  function clearFilters(): void {
    setFilters(defaultFilters);
  }

  function applyStatusFilter(status: "" | RoadmapStatus): void {
    setFilters((current) => ({
      ...current,
      status,
    }));
  }

  return (
    <section className="roadmaps-page">
      <header className="roadmaps-hero">
        <div>
          <p className="roadmaps-eyebrow">
            PERFORMANCE ANNUELLE
          </p>

          <h2>
            Feuilles de route <span>& KPI.</span>
          </h2>

 
        </div>

        <div className="roadmaps-hero-actions">
          <button
            className="roadmaps-secondary-button"
            type="button"
            onClick={() => void refresh()}
            disabled={
              roadmapsQuery.isFetching ||
              statsQuery.isFetching ||
              scopeQuery.isFetching
            }
           data-ui-action="compact" aria-label="Actualiser" title="Actualiser">
            <RefreshCw
              size={18}
              className={
                roadmapsQuery.isFetching ||
                statsQuery.isFetching ||
                scopeQuery.isFetching
                  ? "is-spinning"
                  : ""
              }
            />
            <span className="ui-action-label">Actualiser</span>
          </button>

          <button
            className="roadmaps-primary-button"
            type="button"
            onClick={openCreateModal}
            disabled={!canCreateRoadmap}
            title={
              canCreateRoadmap
                ? "Créer votre feuille de route annuelle"
                : scope?.configurationMessage ??
                  "Le compte doit être rattaché à une fiche Agent active avec une Direction."
            }
           aria-label={
              canCreateRoadmap
                ? "Créer votre feuille de route annuelle"
                : scope?.configurationMessage ??
                  "Le compte doit être rattaché à une fiche Agent active avec une Direction."
            } data-ui-action="compact">
            <Plus size={18} />
            <span className="ui-action-label">Nouvelle feuille</span>
          </button>
        </div>
      </header>

      {globalError && (
        <div className="roadmaps-alert">
          <CircleAlert size={20} />
          <div>
            <strong>Données feuilles de route indisponibles.</strong>
            <p>{globalError}</p>
          </div>
        </div>
      )}

      {scopeQuery.isSuccess && scope && !scope.canCreate && (
        <div className="roadmaps-alert">
          <CircleAlert size={20} />
          <div>
            <strong>Profil feuille de route incomplet.</strong>
            <p>
              {scope.configurationMessage ??
                "Le compte connecté doit être rattaché à un Agent actif avec une Direction avant toute création."}
            </p>
          </div>
        </div>
      )}

      <section className="roadmap-stats-grid">
        <button
          className="roadmap-stat-card total"
          aria-pressed={filters.status === ""}
          title="Afficher toutes les feuilles de route"
          type="button"
          onClick={() => applyStatusFilter("")}
        >
          <span className="roadmap-stat-icon">
            <Route size={21} />
          </span>
          <div>
            <span>Total</span>
            <strong>{statsQuery.data?.total ?? "—"}</strong>
            <p>Feuilles accessibles</p>
          </div>
        </button>

        <button
          className="roadmap-stat-card draft"
          aria-pressed={filters.status === "DRAFT"}
          title="Afficher les feuilles de route en brouillon"
          type="button"
          onClick={() => applyStatusFilter("DRAFT")}
        >
          <span className="roadmap-stat-icon">
            <FileTextIcon />
          </span>
          <div>
            <span>Brouillons</span>
            <strong>{statsQuery.data?.draft ?? "—"}</strong>
            <p>À finaliser</p>
          </div>
        </button>

        <button
          className="roadmap-stat-card submitted"
          aria-pressed={filters.status === "SUBMITTED"}
          title="Afficher les feuilles en attente de validation"
          type="button"
          onClick={() => applyStatusFilter("SUBMITTED")}
        >
          <span className="roadmap-stat-icon">
            <Send size={21} />
          </span>
          <div>
            <span>En validation</span>
            <strong>{statsQuery.data ? submittedCount : "—"}</strong>
            <p>À suivre</p>
          </div>
        </button>

        <button
          className="roadmap-stat-card approved"
          aria-pressed={filters.status === "APPROVED"}
          title="Afficher les feuilles de route approuvées"
          type="button"
          onClick={() => applyStatusFilter("APPROVED")}
        >
          <span className="roadmap-stat-icon">
            <CheckCircle2 size={21} />
          </span>
          <div>
            <span>Progression moyenne</span>
            <strong>
              {statsQuery.data
                ? `${statsQuery.data.averageProgress}%`
                : "—"}
            </strong>
            <p>Exécution globale</p>
          </div>
        </button>
      </section>

      <section className="roadmap-filters-panel">
        <div className="roadmap-filter-heading">
          <Filter size={19} />
          <div>
            <strong>Recherche et filtres</strong>
            <span>
              {scope?.isGlobalScope
                ? "Vue globale RH / Administration."
                : "Vue limitée au périmètre autorisé du compte connecté."}
            </span>
          </div>
        </div>

        <div className="roadmap-filters">
          <label className="roadmap-search-field">
            <span className="roadmap-search-label">Rechercher</span>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              autoComplete="off"
              value={filters.search}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Rechercher une feuille, une ligne ou une référence..."
            />
          </label>

          <label className="roadmap-filter-field">
            <span>Statut</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as Filters["status"],
                }))
              }
            >
              <option value="">Tous les statuts</option>

              {Object.entries(roadmapStatusLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="roadmap-filter-field">
            <span>Année</span>
            <input
              type="number"
              min={2020}
              max={2200}
              value={filters.year}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  year: event.target.value,
                }))
              }
            />
          </label>

          <label className="roadmap-filter-field">
            <span>Tri</span>
            <select
              value={filters.sort}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sort: event.target.value as Filters["sort"],
                }))
              }
            >
              <option value="UPDATED_DESC">Mise à jour récente</option>
              <option value="CREATED_DESC">Création récente</option>
              <option value="PROGRESS_DESC">Progression élevée</option>
              <option value="PROGRESS_ASC">Progression faible</option>
            </select>
          </label>

          <button
            className="roadmaps-clear-button"
            title="Réinitialiser la recherche et les filtres"
            aria-label="Réinitialiser la recherche et les filtres"
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <X size={16} />
            <span>Effacer</span>
          </button>
        </div>
      </section>

      <section className="roadmap-list-panel">
        <header className="roadmap-list-header">
          <div>
            <p>REGISTRE</p>
            <h3>Feuilles de route</h3>
          </div>

          <span className="roadmap-list-count">
            {pagination?.total ?? 0} résultat
            {(pagination?.total ?? 0) > 1 ? "s" : ""}
          </span>
        </header>

        {(roadmapsQuery.isLoading || scopeQuery.isLoading) && (
          <div className="roadmap-empty-state">
            <LoaderCircle size={24} className="is-spinning" />
            <strong>Chargement des feuilles de route...</strong>
          </div>
        )}

        {!roadmapsQuery.isLoading &&
          !scopeQuery.isLoading &&
          canLoadRoadmaps &&
          roadmaps.length === 0 && (
            <div className="roadmap-empty-state">
              <BarChart3 size={34} />
              <strong>Aucune feuille de route trouvée.</strong>
              <p>
                Créez une feuille annuelle ou ajustez vos filtres de recherche.
              </p>

              {canCreateRoadmap && (
                <button
                  className="roadmaps-primary-button"
                  type="button"
                  onClick={openCreateModal}
                 data-ui-action="compact" aria-label="Créer une feuille" title="Créer une feuille">
                  <Plus size={18} />
                  <span className="ui-action-label">Créer une feuille</span>
                </button>
              )}
            </div>
          )}

        {!roadmapsQuery.isLoading && roadmaps.length > 0 && (
          <>
            <p className="roadmap-register-scroll-hint">Faites défiler le tableau horizontalement pour accéder à toutes les colonnes.</p>
            <div className="roadmap-register-scroll" role="region" aria-label="Registre des feuilles de route" tabIndex={0}>
              <table className="roadmap-register-table">
                <caption className="roadmap-register-caption">Feuilles de route accessibles selon vos droits</caption>
                <thead><tr>
                  <th scope="col">Feuille de route</th>
                  <th scope="col">Année</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Progression</th>
                  <th scope="col">Mise à jour</th>
                  <th scope="col" className="roadmap-register-actions-heading">Actions</th>
                </tr></thead>
                <tbody>
                  {roadmaps.map((roadmap) => {
                    const { canEdit, canSubmit, canApprove, canReturn } = roadmap.permissions;
                    return <tr key={roadmap.id}>
                      <th scope="row" className="roadmap-register-identity">
                        <strong>{roadmap.title}</strong>
                        <span>{roadmap.reference} · {roadmapRoleLabels[roadmap.ownerRole]}</span>
                        <small>{getApprovalHelp(roadmap.ownerRole)}</small>
                      </th>
                      <td className="roadmap-register-year">{roadmap.calendarYear}</td>
                      <td><span className={`roadmap-status ${statusClass(roadmap.status)}`}>
                        {roadmapStatusLabels[roadmap.status]}
                      </span></td>
                      <td className="roadmap-register-progress">
                        <div className="roadmap-register-progress-heading"><strong>{roadmap.progressPercentage}%</strong>
                          <span>{roadmap.completedItemCount}/{roadmap.itemCount} objectifs</span></div>
                        <div className="roadmap-register-progress-track" role="progressbar"
                          aria-label={`Progression de ${roadmap.title}`} aria-valuemin={0} aria-valuemax={100}
                          aria-valuenow={roadmap.progressPercentage}>
                          <span style={{ width: `${roadmap.progressPercentage}%` }} />
                        </div>
                        <small>{getRoadmapProgressLabel(roadmap.progressPercentage)}</small>
                      </td>
                      <td className="roadmap-register-date">{formatRoadmapDate(roadmap.updatedAt)}</td>
                      <td>
                <div className="roadmap-card-actions">
                  <button
                    type="button"
                    className="roadmap-view-button"
                    aria-haspopup="dialog"
                    onClick={(event) => { viewTriggerRef.current = event.currentTarget; setSelectedRoadmap(roadmap); }}
                   data-ui-action="compact" data-tooltip="Consulter la feuille" title="Consulter la feuille"
                   aria-label={`Consulter la feuille : ${roadmap.title}`}>
                    <Eye size={20} aria-hidden="true" />
                  </button>

                  {canEdit && (
                    <button
                      type="button"
                      data-tooltip="Modifier le brouillon" title="Modifier le brouillon"
                      aria-label={`Modifier la feuille : ${roadmap.title}`}
                      onClick={() => openEditModal(roadmap)}
                    >
                      <Pencil size={18} aria-hidden="true" />
                    </button>
                  )}

                  {canSubmit && (
                    <button
                      type="button"
                      data-tooltip="Soumettre pour validation" title="Soumettre pour validation"
                      aria-label={`Soumettre la feuille : ${roadmap.title}`}
                      disabled={submitMutation.isPending} aria-busy={submitMutation.isPending}
                      onClick={() => submitMutation.mutate(roadmap.id)}
                    >
                      {submitMutation.isPending && submitMutation.variables === roadmap.id
                        ? <LoaderCircle size={18} className="is-spinning" aria-hidden="true" />
                        : <Send size={18} aria-hidden="true" />}
                    </button>
                  )}

                  {canApprove && (
                    <>
                      <button
                        type="button"
                        data-tooltip="Approuver la feuille" title="Approuver la feuille"
                        aria-label={`Approuver la feuille : ${roadmap.title}`}
                        disabled={approveMutation.isPending} aria-busy={approveMutation.isPending}
                        onClick={() =>
                          approveMutation.mutate({
                            id: roadmap.id,
                          })
                        }
                      >
                        {approveMutation.isPending && approveMutation.variables?.id === roadmap.id
                          ? <LoaderCircle size={18} className="is-spinning" aria-hidden="true" />
                          : <ShieldCheck size={18} aria-hidden="true" />}
                      
                      </button>

                      {canReturn && (
                        <button
                          type="button"
                          data-tooltip="Demander une reprise" title="Demander une reprise"
                          aria-label={`Demander une reprise de la feuille : ${roadmap.title}`}
                          disabled={returnMutation.isPending} aria-busy={returnMutation.isPending}
                          onClick={() =>
                            returnMutation.mutate({
                              id: roadmap.id,
                              comment:
                                "À reprendre après échange avec le responsable.",
                            })
                          }
                        >
                          {returnMutation.isPending && returnMutation.variables?.id === roadmap.id
                            ? <LoaderCircle size={18} className="is-spinning" aria-hidden="true" />
                            : <Undo2 size={18} aria-hidden="true" />}
                         
                        </button>
                      )}
                    </>
                  )}
                </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(pagination?.totalPages ?? 1) > 1 && (
          <footer className="roadmap-pagination">
            <button
              type="button"
              title="Afficher la page précédente"
              aria-label="Afficher la page précédente"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
            >
              Précédent
            </button>

            <span>
              Page {pagination?.page} sur {pagination?.totalPages}
            </span>

            <button
              type="button"
              title="Afficher la page suivante"
              aria-label="Afficher la page suivante"
              disabled={page >= (pagination?.totalPages ?? 1)}
              onClick={() =>
                setPage((current) =>
                  Math.min(
                    pagination?.totalPages ?? 1,
                    current + 1,
                  ),
                )
              }
            >
              Suivant
            </button>
          </footer>
        )}
      </section>

      {isEditorOpen && (
        <RoadmapEditorModal
          roadmap={editingRoadmap}
          isSubmitting={
            createMutation.isPending ||
            updateMutation.isPending ||
            submitMutation.isPending
          }
          errorMessage={formError}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingRoadmap(null);
          }}
          onSave={saveRoadmap}
        />
      )}

      {linkedRoadmapQuery.isFetching && !selectedRoadmap && (
        <p role="status">Ouverture de la feuille de route…</p>
      )}
      {linkedRoadmapQuery.isError && (
        <div role="alert">
          <p>{getApiErrorMessage(linkedRoadmapQuery.error)}</p>
          <button type="button" className="roadmap-secondary-action" disabled={linkedRoadmapQuery.isFetching}
            onClick={() => void linkedRoadmapQuery.refetch()}>Réessayer</button>
        </div>
      )}
      {selectedRoadmap && (
        <RoadmapDetailsDrawer
          roadmap={selectedRoadmap}
          role={role}
          currentUserId={user?.id}
          onClose={() => { setSelectedRoadmap(null); window.requestAnimationFrame(() => viewTriggerRef.current?.focus()); }}
          onEdit={(roadmap) => {
            setSelectedRoadmap(null);
            openEditModal(roadmap);
          }}
          onChanged={refresh}
          onRoadmapUpdated={setSelectedRoadmap}
        />
      )}
    </section>
  );
}

function FileTextIcon() {
  return <Clock3 size={21} />;
}
