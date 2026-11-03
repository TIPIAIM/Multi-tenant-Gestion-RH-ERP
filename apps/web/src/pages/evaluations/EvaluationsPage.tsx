const evaluationDateFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Award,
  BadgeCheck,
  CalendarDays,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../features/auth/auth.context";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { getAgents } from "../../features/agents/agent.api";
import { getOrganizationTree } from "../../features/organisation/organisation.api";
import {
  createEvaluation,
  deleteEvaluation,
  downloadEvaluationsCsv,
  getEvaluationById,
  getEvaluationStats,
  getEvaluations,
  recomputeEvaluationIntelligence,
  submitManagerReview,
  submitSelfReview,
  updateEvaluation,
  validateEvaluationHr,
} from "../../features/evaluations/evaluation.api";
import type {
  CreateEvaluationInput,
  Evaluation,
  EvaluationStatus,
  SubmitEvaluationReviewInput,
  UpdateEvaluationInput,
  ValidateEvaluationHrInput,
} from "../../features/evaluations/evaluation.types";
const EvaluationDetailsDrawer = lazy(() => import("./EvaluationDetailsDrawer"));
const EvaluationFormModal = lazy(() => import("./EvaluationFormModal"));
import "./evaluation-page.css";

type EvaluationFilters = {
  search: string;
  status: "" | EvaluationStatus;
  evaluationYear: string;
  directionId: string;
  serviceId: string;
  agentId: string;
};

type EvaluationModalMode = "CREATE" | "EDIT" | null;

async function getEvaluationAgentOptions(input: {
  directionId?: string;
  serviceId?: string;
}): Promise<Awaited<ReturnType<typeof getAgents>>> {
  const baseParams = {
    limit: 100,
    employmentStatus: "ACTIVE" as const,
    directionId: input.directionId,
    serviceId: input.serviceId,
  };

  const firstPage = await getAgents({
    ...baseParams,
    page: 1,
  });

  const allItems = [...firstPage.items];

  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const nextPage = await getAgents({
      ...baseParams,
      page,
    });

    allItems.push(...nextPage.items);
  }

  return {
    ...firstPage,
    items: allItems,
    pagination: {
      ...firstPage.pagination,
      page: 1,
      limit: 100,
      total: firstPage.pagination.total,
      totalPages: 1,
    },
  };
}

const statusLabels: Record<EvaluationStatus, string> = {
  DRAFT: "Brouillon",
  SELF_REVIEWED: "Auto-évaluation",
  MANAGER_REVIEWED: "Hiérarchie",
  HR_VALIDATED: "Validée RH",
  ARCHIVED: "Archivée",
};

const gradeLabels = {
  EXCELLENT: "Excellent",
  VERY_GOOD: "Très bon",
  SATISFACTORY: "Satisfaisant",
  NEEDS_IMPROVEMENT: "À améliorer",
  INSUFFICIENT: "Insuffisant",
} as const;

const riskLabels = {
  LOW: "Risque faible",
  MODERATE: "Risque modéré",
  HIGH: "Risque élevé",
  CRITICAL: "Risque critique",
} as const;

const potentialLabels = {
  TO_SUPPORT: "À accompagner",
  EMERGING: "Potentiel émergent",
  SOLID: "Potentiel solide",
  HIGH_POTENTIAL: "Haut potentiel",
} as const;

function currentYear(): string {
  return String(new Date().getFullYear());
}

function formatDate(value?: string): string {
  if (!value) return "—";

  return evaluationDateFormatter.format(new Date(value));
}

function getScoreClass(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 80) return "very-good";
  if (score >= 70) return "satisfactory";
  if (score >= 60) return "needs-improvement";
  return "insufficient";
}

export default function EvaluationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<EvaluationFilters>({
    search: "",
    status: "",
    evaluationYear: currentYear(),
    directionId: "",
    serviceId: "",
    agentId: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalMode, setModalMode] = useState<EvaluationModalMode>(null);
  const [editingEvaluation, setEditingEvaluation] =
    useState<Evaluation | null>(null);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<
    string | null
  >(null);
  const viewTriggerRef = useRef<HTMLButtonElement | null>(null);

  function closeEvaluationDetails(): void {
    setSelectedEvaluationId(null);
    window.requestAnimationFrame(() => viewTriggerRef.current?.focus());
  }

  const [evaluationToDelete, setEvaluationToDelete] =
    useState<Evaluation | null>(null);

  const role = user?.role ?? "";
  const canManageEvaluation = ["TENANT_ADMIN", "RH_MANAGER"].includes(
    role,
  );
  const canDeleteEvaluation = canManageEvaluation;

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => { setDebouncedSearch(filters.search.trim()); setPage(1); },
      350,
    );

    return () => window.clearTimeout(timeoutId);
  }, [filters.search]);


  const organizationQuery = useQuery({
    queryKey: ["organization-tree"],
    queryFn: getOrganizationTree,
    staleTime: 5 * 60 * 1000,
  });

  const agentsQuery = useQuery({
    queryKey: [
      "agents",
      "evaluation-options",
      filters.directionId,
      filters.serviceId,
    ],
    queryFn: () =>
      getEvaluationAgentOptions({
        directionId: filters.directionId || undefined,
        serviceId: filters.serviceId || undefined,
      }),
    staleTime: 60_000,
  });

  const statsQuery = useQuery({
    queryKey: ["evaluations", "stats"],
    queryFn: getEvaluationStats,
    staleTime: 30_000,
  });

  const evaluationsQuery = useQuery({
    queryKey: ["evaluations", page, debouncedSearch, filters.status, filters.evaluationYear, filters.directionId, filters.serviceId, filters.agentId],
    queryFn: () =>
      getEvaluations({
        page,
        limit: 12,
        search: debouncedSearch || undefined,
        status: filters.status || undefined,
        evaluationYear: filters.evaluationYear
          ? Number(filters.evaluationYear)
          : undefined,
        directionId: filters.directionId || undefined,
        serviceId: filters.serviceId || undefined,
        agentId: filters.agentId || undefined,
        sort: "PERIOD_DESC",
      }),
    staleTime: 20_000,
  });

  const selectedEvaluationQuery = useQuery({
    queryKey: ["evaluation", selectedEvaluationId],
    queryFn: () => getEvaluationById(selectedEvaluationId ?? ""),
    enabled: Boolean(selectedEvaluationId),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: createEvaluation,
    onSuccess: async () => {
      await refreshEvaluations();
      closeEvaluationModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      evaluationId,
      input,
    }: {
      evaluationId: string;
      input: UpdateEvaluationInput;
    }) => updateEvaluation(evaluationId, input),
    onSuccess: async (_, variables) => {
      await refreshSelected(variables.evaluationId);
      closeEvaluationModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEvaluation,
    onSuccess: async () => {
      await refreshEvaluations();
      setEvaluationToDelete(null);
      setSelectedEvaluationId(null);
    },
  });

  const selfReviewMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: SubmitEvaluationReviewInput;
    }) => submitSelfReview(id, input),
    onSuccess: async (_, variables) => refreshSelected(variables.id),
  });

  const managerReviewMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: SubmitEvaluationReviewInput;
    }) => submitManagerReview(id, input),
    onSuccess: async (_, variables) => refreshSelected(variables.id),
  });

  const hrValidationMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: ValidateEvaluationHrInput;
    }) => validateEvaluationHr(id, input),
    onSuccess: async (_, variables) => refreshSelected(variables.id),
  });

  const recomputeMutation = useMutation({
    mutationFn: recomputeEvaluationIntelligence,
    onSuccess: async (_, evaluationId) => refreshSelected(evaluationId),
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadEvaluationsCsv({
        search: debouncedSearch || undefined,
        status: filters.status || undefined,
        evaluationYear: filters.evaluationYear
          ? Number(filters.evaluationYear)
          : undefined,
        directionId: filters.directionId || undefined,
        serviceId: filters.serviceId || undefined,
        agentId: filters.agentId || undefined,
        limit: 100,
      }),
  });

  async function refreshEvaluations(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["evaluations"] }),
      queryClient.invalidateQueries({ queryKey: ["evaluation"] }),
    ]);
  }

  async function refreshSelected(id: string): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["evaluations"] }),
      queryClient.invalidateQueries({ queryKey: ["evaluation", id] }),
    ]);
  }

  function openCreateModal(): void {
    createMutation.reset();
    updateMutation.reset();
    setEditingEvaluation(null);
    setModalMode("CREATE");
  }

  function openEditModal(evaluation: Evaluation): void {
    createMutation.reset();
    updateMutation.reset();
    setEditingEvaluation(evaluation);
    setModalMode("EDIT");
  }

  function closeEvaluationModal(): void {
    setModalMode(null);
    setEditingEvaluation(null);
  }

  async function handleSaveEvaluation(
    input: CreateEvaluationInput | UpdateEvaluationInput,
  ): Promise<void> {
    if (modalMode === "EDIT" && editingEvaluation) {
      await updateMutation.mutateAsync({
        evaluationId: editingEvaluation.id,
        input: input as UpdateEvaluationInput,
      });
      return;
    }

    await createMutation.mutateAsync(input as CreateEvaluationInput);
  }

  const directions = organizationQuery.data ?? [];
  const agents = agentsQuery.data?.items ?? [];
  const evaluations = evaluationsQuery.data?.items ?? [];
  const pagination = evaluationsQuery.data?.pagination;
  const stats = statsQuery.data;

  const selectedDirection = directions.find(
    (direction) => direction.id === filters.directionId,
  );
  const availableServices =
    selectedDirection?.services.filter(
      (service) => service.status === "ACTIVE",
    ) ?? [];

  const queryError = evaluationsQuery.isError
    ? getApiErrorMessage(evaluationsQuery.error)
    : statsQuery.isError
      ? getApiErrorMessage(statsQuery.error)
      : organizationQuery.isError
        ? getApiErrorMessage(organizationQuery.error)
        : null;

  const actionError = createMutation.isError
    ? getApiErrorMessage(createMutation.error)
    : updateMutation.isError
      ? getApiErrorMessage(updateMutation.error)
      : deleteMutation.isError
        ? getApiErrorMessage(deleteMutation.error)
        : selfReviewMutation.isError
          ? getApiErrorMessage(selfReviewMutation.error)
          : managerReviewMutation.isError
            ? getApiErrorMessage(managerReviewMutation.error)
            : hrValidationMutation.isError
              ? getApiErrorMessage(hrValidationMutation.error)
              : recomputeMutation.isError
                ? getApiErrorMessage(recomputeMutation.error)
                : exportMutation.isError
                  ? getApiErrorMessage(exportMutation.error)
                  : null;

  function updateFilter(
    key: keyof EvaluationFilters,
    value: string,
  ): void {
    if (key !== "search") setPage(1);
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "directionId" ? { serviceId: "", agentId: "" } : {}),
      ...(key === "serviceId" ? { agentId: "" } : {}),
    }));
  }

  function clearFilters(): void {
    setPage(1);
    setDebouncedSearch("");
    setFilters({
      search: "",
      status: "",
      evaluationYear: currentYear(),
      directionId: "",
      serviceId: "",
      agentId: "",
    });
  }

  const hasFilters = useMemo(
    () =>
      Boolean(
        filters.search ||
          filters.status ||
          filters.directionId ||
          filters.serviceId ||
          filters.agentId ||
          filters.evaluationYear !== currentYear(),
      ),
    [filters],
  );

  return (
    <section className="evaluations-page">
      <header className="evaluations-hero">
        <div>
          <p className="evaluations-eyebrow">
            PERFORMANCE · TALENTS · DÉCISION RH
          </p>
          <h2>
            Évaluations <span>intelligentes.</span>
          </h2>
      
        </div>

        <div className="evaluations-hero-actions">
          <button
            className="evaluation-secondary-button"
            type="button"
            onClick={() => void refreshEvaluations()}
           data-ui-action="compact" aria-label="Actualiser" title="Actualiser">
            <RefreshCw size={18} /><span className="ui-action-label">
            Actualiser
          </span></button>
          <button
            className="evaluation-secondary-button"
            type="button"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
           data-ui-action="compact" aria-label="Export Excel" title="Export Excel">
            {exportMutation.isPending ? (
              <LoaderCircle size={18} className="is-spinning" />
            ) : (
              <Download size={18} />
            )}<span className="ui-action-label">
            Export Excel
          </span></button>
          {canManageEvaluation && (
            <button
              className="evaluation-primary-button"
              type="button"
              onClick={openCreateModal}
              disabled={agents.length === 0}
             data-ui-action="compact" aria-label="Nouvelle évaluation" title="Nouvelle évaluation">
              <Plus size={18} /><span className="ui-action-label">
              Nouvelle évaluation
            </span></button>
          )}
        </div>
      </header>

      {(queryError || actionError) && (
        <div className="evaluations-alert">
          <CircleAlert size={20} />
          <div>
            <strong>
              Une opération du module Évaluations est indisponible.
            </strong>
            <p>{queryError ?? actionError}</p>
          </div>
        </div>
      )}

      <section className="evaluations-metrics-grid">
        <article className="evaluations-metric-card">
          <span className="metric-icon total">
            <Award size={21} />
          </span>
          <div>
            <span>Total évaluations</span>
            <strong>{stats?.total ?? "—"}</strong>
            <p>Dossiers suivis</p>
          </div>
        </article>

        <article className="evaluations-metric-card">
          <span className="metric-icon score">
            <Sparkles size={21} />
          </span>
          <div>
            <span>Score moyen</span>
            <strong>{stats?.averageScore ?? "—"}/100</strong>
            <p>Performance consolidée</p>
          </div>
        </article>

        <article className="evaluations-metric-card">
          <span className="metric-icon validated">
            <ShieldCheck size={21} />
          </span>
          <div>
            <span>Validées RH</span>
            <strong>{stats?.hrValidated ?? "—"}</strong>
            <p>Fiches finalisées</p>
          </div>
        </article>

        <article className="evaluations-metric-card">
          <span className="metric-icon excellence">
            <BadgeCheck size={21} />
          </span>
          <div>
            <span>Excellentes</span>
            <strong>{stats?.excellent ?? "—"}</strong>
            <p>Potentiels à valoriser</p>
          </div>
        </article>

        <article className="evaluations-metric-card">
          <span className="metric-icon leave-total">
            <CalendarDays size={21} />
          </span>
          <div>
            <span>Demandes de congé</span>
            <strong>{stats?.leaveRequestsTotal ?? "—"}</strong>
            <p>Demandes recensées cette année</p>
          </div>
        </article>

        <article className="evaluations-metric-card">
          <span className="metric-icon leave-approved">
            <CalendarDays size={21} />
          </span>
          <div>
            <span>Congés approuvés</span>
            <strong>{stats?.approvedLeaveDays ?? "—"} j</strong>
            <p>Jours autorisés cette année</p>
          </div>
        </article>

        <article className="evaluations-metric-card">
          <span className="metric-icon leave-pending">
            <Clock3 size={21} />
          </span>
          <div>
            <span>Congés en validation</span>
            <strong>{stats?.pendingLeaveDays ?? "—"} j</strong>
            <p>Décisions encore attendues</p>
          </div>
        </article>
      </section>

      <section className="evaluations-filter-panel">
        <div className="evaluations-filter-heading">
          <Filter size={19} />
          <div>
            <strong>Recherche et filtres RH</strong>
            <span>
              Affinez par agent, statut, année, Direction ou Service.
            </span>
          </div>
        </div>

        <div className="evaluations-filters">
          <label className="evaluations-search-field">
            <Search size={18} />
            <input
              value={filters.search}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateFilter("search", event.target.value)
              }
              placeholder="Référence, agent, matricule ou poste..."
            />
          </label>

          <label className="evaluation-filter-field">
            <span>Année</span>
            <input
              value={filters.evaluationYear}
              onChange={(event) =>
                updateFilter("evaluationYear", event.target.value)
              }
              inputMode="numeric"
            />
          </label>

          <label className="evaluation-filter-field">
            <span>Statut</span>
            <select
              value={filters.status}
              onChange={(event) =>
                updateFilter("status", event.target.value)
              }
            >
              <option value="">Tous</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="evaluation-filter-field">
            <span>Direction</span>
            <select
              value={filters.directionId}
              onChange={(event) =>
                updateFilter("directionId", event.target.value)
              }
            >
              <option value="">Toutes</option>
              {directions.map((direction) => (
                <option key={direction.id} value={direction.id}>
                  {direction.name}
                </option>
              ))}
            </select>
          </label>

          <label className="evaluation-filter-field">
            <span>Service</span>
            <select
              value={filters.serviceId}
              disabled={!filters.directionId}
              onChange={(event) =>
                updateFilter("serviceId", event.target.value)
              }
            >
              <option value="">Tous</option>
              {availableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          <label className="evaluation-filter-field">
            <span>Agent</span>
            <select
              value={filters.agentId}
              onChange={(event) =>
                updateFilter("agentId", event.target.value)
              }
            >
              <option value="">Tous</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.fullName}
                </option>
              ))}
            </select>
          </label>

          <button
            className="evaluation-clear-button"
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <X size={16} />
            Effacer
          </button>
        </div>
      </section>

      <section className="evaluations-list-panel">
        <header className="evaluations-list-header">
          <div>
            <p>REGISTRE RH</p>
            <h3>Fiches d’évaluation</h3>
          </div>
          <span>
            {pagination?.total ?? 0} résultat
            {(pagination?.total ?? 0) > 1 ? "s" : ""}
          </span>
        </header>

        {evaluationsQuery.isLoading && (
          <div className="evaluations-empty">
            <LoaderCircle size={25} className="is-spinning" />
            Chargement des évaluations...
          </div>
        )}

        {!evaluationsQuery.isLoading &&
          !evaluationsQuery.isError &&
          evaluations.length === 0 && (
            <div className="evaluations-empty">
              <FileSpreadsheet size={35} />
              <strong>Aucune évaluation trouvée.</strong>
              <p>
                Créez une fiche d’évaluation pour générer une synthèse
                RH exploitable et imprimable.
              </p>
            </div>
          )}

        <div className="evaluations-list">
          {evaluations.map((evaluation) => (
            <article key={evaluation.id} className="evaluation-card">
              <div className="evaluation-card-main">
                <span className="evaluation-reference">
                  {evaluation.reference}
                </span>
                <h4>{evaluation.agentSnapshot.fullName}</h4>
                <p>
                  {evaluation.agentSnapshot.jobTitle} ·{" "}
                  {evaluation.agentSnapshot.matricule}
                </p>
                <small>
                  {formatDate(evaluation.periodStartDate)} —{" "}
                  {formatDate(evaluation.periodEndDate)}
                </small>
              </div>

              <div className="evaluation-card-score">
                <strong className={getScoreClass(evaluation.finalScore)}>
                  {evaluation.finalScore}
                </strong>
                <span>{gradeLabels[evaluation.grade]}</span>
              </div>

              <div className="evaluation-card-status">
                <span>{statusLabels[evaluation.status]}</span>
                <small>
                  {evaluation.agentSnapshot.directionName ??
                    "Direction non renseignée"}
                </small>
                <small>
                  {riskLabels[evaluation.intelligence.riskLevel]} ·{" "}
                  {potentialLabels[evaluation.intelligence.potentialLevel]}
                </small>
                <small>
                  Congés approuvés : {evaluation.performanceSnapshot.leaveApprovedDays} j ·
                  Absences non couvertes : {evaluation.performanceSnapshot.absentDays} j
                </small>
              </div>

              <div className="evaluation-card-actions">
                <button
                  type="button"
                  className="evaluation-view-button"
                  onClick={(event) => {
                    viewTriggerRef.current = event.currentTarget;
                    setSelectedEvaluationId(evaluation.id);
                  }}
                  disabled={Boolean(selectedEvaluationId && selectedEvaluationQuery.isPending)}
                  aria-busy={selectedEvaluationId === evaluation.id && selectedEvaluationQuery.isPending}
                  aria-haspopup="dialog"
                  title="Consulter l’évaluation"
                  aria-label={`Consulter l’évaluation ${evaluation.reference}`}>
                  {selectedEvaluationId === evaluation.id && selectedEvaluationQuery.isPending
                    ? <LoaderCircle size={20} className="evaluation-button-spinner" aria-hidden="true" />
                    : <Eye size={20} strokeWidth={2} aria-hidden="true" />}
                </button>

                {canManageEvaluation && (
                  <button
                    type="button"
                    onClick={() => openEditModal(evaluation)}
                    title="Modifier l’évaluation"
                   aria-label="Modifier l’évaluation">
                    <Pencil size={17} />
                  </button>
                )}

                {canDeleteEvaluation && (
                  <button
                    className="is-danger"
                    type="button"
                    onClick={() => setEvaluationToDelete(evaluation)}
                    disabled={deleteMutation.isPending}
                    title="Supprimer"
                   aria-label="Supprimer">
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <footer className="evaluations-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
            >
              Précédent
            </button>
            <span>
              Page {pagination.page} sur {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination.totalPages, current + 1),
                )
              }
            >
              Suivant
            </button>
          </footer>
        )}
      </section>

      <Suspense fallback={<p role="status">Chargement du formulaire…</p>}>
      {modalMode && (
        <EvaluationFormModal
          key={`${modalMode}-${editingEvaluation?.id ?? "new"}`}
          mode={modalMode}
          agents={agents}
          evaluation={editingEvaluation}
          isSubmitting={
            createMutation.isPending || updateMutation.isPending
          }
          errorMessage={
            createMutation.isError
              ? getApiErrorMessage(createMutation.error)
              : updateMutation.isError
                ? getApiErrorMessage(updateMutation.error)
                : null
          }
          onClose={closeEvaluationModal}
          onSubmit={handleSaveEvaluation}
        />
      )}

      </Suspense>
      <div className="evaluation-view-status" role="status" aria-live="polite" aria-atomic="true">
        {selectedEvaluationId && selectedEvaluationQuery.isPending && (
          <span><LoaderCircle size={18} className="evaluation-button-spinner" aria-hidden="true" /> Ouverture de l’évaluation…</span>
        )}
      </div>
      {selectedEvaluationId && selectedEvaluationQuery.isPending && (
        <button className="evaluation-cancel-button" type="button" onClick={closeEvaluationDetails}>
          Annuler l’ouverture
        </button>
      )}
      {selectedEvaluationId && selectedEvaluationQuery.isError && !selectedEvaluationQuery.data && (
        <div className="evaluation-view-error" role="alert">
          <p>Impossible d’ouvrir l’évaluation : {getApiErrorMessage(selectedEvaluationQuery.error)}</p>
          <button className="evaluation-secondary-button" type="button"
            disabled={selectedEvaluationQuery.isFetching}
            onClick={() => void selectedEvaluationQuery.refetch()}>
            {selectedEvaluationQuery.isFetching ? "Chargement…" : "Réessayer"}
          </button>
          <button className="evaluation-cancel-button" type="button" onClick={closeEvaluationDetails}>Fermer</button>
        </div>
      )}
      <Suspense fallback={<p role="status">Chargement du dossier…</p>}>
      {selectedEvaluationId && selectedEvaluationQuery.data && (
        <EvaluationDetailsDrawer
          evaluation={selectedEvaluationQuery.data}
          currentRole={role}
          isSubmitting={
            selfReviewMutation.isPending ||
            managerReviewMutation.isPending ||
            hrValidationMutation.isPending ||
            recomputeMutation.isPending
          }
          errorMessage={actionError}
          onClose={closeEvaluationDetails}
          onSubmitSelfReview={async (input) => {
            await selfReviewMutation.mutateAsync({
              id: selectedEvaluationQuery.data.id,
              input,
            });
          }}
          onSubmitManagerReview={async (input) => {
            await managerReviewMutation.mutateAsync({
              id: selectedEvaluationQuery.data.id,
              input,
            });
          }}
          onValidateHr={async (input) => {
            await hrValidationMutation.mutateAsync({
              id: selectedEvaluationQuery.data.id,
              input,
            });
          }}
          isRecomputing={recomputeMutation.isPending}
          onRecomputeIntelligence={async () => {
            await recomputeMutation.mutateAsync(
              selectedEvaluationQuery.data.id,
            );
          }}
        />
      )}

      </Suspense>
      {evaluationToDelete && (
        <div className="evaluation-delete-layer">
          <button
            className="evaluation-delete-backdrop"
            type="button"
            onClick={() => setEvaluationToDelete(null)}
          />
          <section className="evaluation-delete-modal">
            <h3>Supprimer cette évaluation ?</h3>
            <p>
              La fiche <strong>{evaluationToDelete.reference}</strong> sera
              supprimée définitivement. Cette action est réservée à la RH
              et à l’administrateur.
            </p>
            <footer>
              <button
                className="evaluation-cancel-button"
                type="button"
                onClick={() => setEvaluationToDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Annuler
              </button>
              <button
                className="evaluation-danger-button"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate(evaluationToDelete.id)
                }
               data-ui-action="compact" aria-label="Supprimer" title="Supprimer">
                {deleteMutation.isPending ? (
                  <LoaderCircle size={17} className="is-spinning" />
                ) : (
                  <Trash2 size={17} />
                )}<span className="ui-action-label">
                Supprimer
              </span></button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
