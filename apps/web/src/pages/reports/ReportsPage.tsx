import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BadgeCheck,
  BarChart3,
  CalendarRange,
  CircleAlert,
  Download,
  Eye,
  FileBarChart2,
  FilePlus2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { useAuth } from "../../features/auth/auth.context";
import { getOrganizationTree } from "../../features/organisation/organisation.api";
import {
  archiveManagementReport,
  deleteManagementReport,
  downloadManagementReportsCsv,
  generateManagementReport,
  getManagementReportById,
  getManagementReports,
  getManagementReportScope,
  getManagementReportStats,
  recomputeManagementReport,
  updateManagementReport,
  validateManagementReport,
} from "../../features/reports/report.api";
import type {
  GenerateManagementReportInput,
  ManagementReport,
  ManagementReportStatus,
  ManagementReportType,
  UpdateManagementReportInput,
} from "../../features/reports/report.types";
import ReportDetailsDrawer from "./ReportDetailsDrawer";
import ReportFormModal from "./ReportFormModal";
import "./report-page.css";

type Filters = {
  search: string;
  reportType: "" | ManagementReportType;
  status: "" | ManagementReportStatus;
  reportYear: string;
  directionId: string;
  serviceId: string;
};
const typeLabels: Record<ManagementReportType, string> = {
  MONTHLY: "Mensuel",
  SEMIANNUAL: "Semestriel",
  ANNUAL: "Annuel",
};
const statusLabels: Record<ManagementReportStatus, string> = {
  DRAFT: "Brouillon",
  READY: "Prêt",
  VALIDATED: "Validé",
  ARCHIVED: "Archivé",
};
const riskLabels = {
  LOW: "Risque faible",
  MODERATE: "Risque modéré",
  HIGH: "Risque élevé",
  CRITICAL: "Risque critique",
} as const;

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
function currentYear(): string {
  return String(new Date().getFullYear());
}

export default function ReportsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = user?.role ?? "";
  const roleCanCreate = [
    "TENANT_ADMIN",
    "RH_MANAGER",
    "DIRECTION",
    "SERVICE_MANAGER",
  ].includes(role);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    reportType: "",
    status: "",
    reportYear: currentYear(),
    directionId: "",
    serviceId: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formMode, setFormMode] = useState<"CREATE" | "EDIT" | null>(null);
  const [editingReport, setEditingReport] = useState<ManagementReport | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ManagementReport | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      350
    );
    return () => window.clearTimeout(timer);
  }, [filters.search]);
  useEffect(
    () => setPage(1),
    [
      debouncedSearch,
      filters.reportType,
      filters.status,
      filters.reportYear,
      filters.directionId,
      filters.serviceId,
    ]
  );

  const organizationQuery = useQuery({
    queryKey: ["organization-tree"],
    queryFn: getOrganizationTree,
    staleTime: 5 * 60_000,
  });
  const scopeQuery = useQuery({
    queryKey: ["reports", "scope"],
    queryFn: getManagementReportScope,
    staleTime: 5 * 60_000,
  });
  const statsQuery = useQuery({
    queryKey: ["reports", "stats"],
    queryFn: getManagementReportStats,
    staleTime: 30_000,
  });
  const reportsQuery = useQuery({
    queryKey: ["reports", page, debouncedSearch, filters],
    queryFn: () =>
      getManagementReports({
        page,
        limit: 12,
        search: debouncedSearch || undefined,
        reportType: filters.reportType || undefined,
        status: filters.status || undefined,
        reportYear: filters.reportYear ? Number(filters.reportYear) : undefined,
        directionId: filters.directionId || undefined,
        serviceId: filters.serviceId || undefined,
        sort: "PERIOD_DESC",
      }),
    staleTime: 20_000,
  });
  const selectedQuery = useQuery({
    queryKey: ["report", selectedId],
    queryFn: () => getManagementReportById(selectedId ?? ""),
    enabled: Boolean(selectedId),
    retry: false,
  });

  async function refreshAll(id?: string): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["report"] }),
      ...(id
        ? [queryClient.invalidateQueries({ queryKey: ["report", id] })]
        : []),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: generateManagementReport,
    onSuccess: async (report) => {
      await refreshAll(report.id);
      setFormMode(null);
      setSelectedId(report.id);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateManagementReportInput;
    }) => updateManagementReport(id, input),

    onSuccess: async (updatedReport) => {
      queryClient.setQueryData(["report", updatedReport.id], updatedReport);

      setEditingReport(updatedReport);
      setSelectedId(updatedReport.id);
      setFormMode(null);

      await refreshAll(updatedReport.id);
    },
  });
  const recomputeMutation = useMutation({
    mutationFn: recomputeManagementReport,
    onSuccess: async (_, id) => refreshAll(id),
  });
  const validateMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      validateManagementReport(id, comment),
    onSuccess: async (_, variables) => refreshAll(variables.id),
  });
  const archiveMutation = useMutation({
    mutationFn: archiveManagementReport,
    onSuccess: async (_, id) => refreshAll(id),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteManagementReport,
    onSuccess: async () => {
      await refreshAll();
      setToDelete(null);
      setSelectedId(null);
    },
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      downloadManagementReportsCsv({
        search: debouncedSearch || undefined,
        reportType: filters.reportType || undefined,
        status: filters.status || undefined,
        reportYear: filters.reportYear ? Number(filters.reportYear) : undefined,
        directionId: filters.directionId || undefined,
        serviceId: filters.serviceId || undefined,
        limit: 100,
      }),
  });

  const accessScope = scopeQuery.data;
  const canCreate = roleCanCreate && Boolean(accessScope);
  const directions = organizationQuery.data ?? [];
  const visibleDirections = ["TENANT_ADMIN", "RH_MANAGER"].includes(role)
    ? directions
    : directions.filter((item) => item.id === accessScope?.directionId);
  const selectedDirection = visibleDirections.find(
    (item) => item.id === filters.directionId
  );
  const services =
    selectedDirection?.services.filter((item) => item.status === "ACTIVE") ??
    [];
  const reports = reportsQuery.data?.items ?? [];
  const pagination = reportsQuery.data?.pagination;
  const stats = statsQuery.data;

  function setFilter(key: keyof Filters, value: string): void {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "directionId" ? { serviceId: "" } : {}),
    }));
  }
  function clearFilters(): void {
    setFilters({
      search: "",
      reportType: "",
      status: "",
      reportYear: currentYear(),
      directionId: "",
      serviceId: "",
    });
  }
  const hasFilters = useMemo(
    () =>
      Boolean(
        filters.search ||
          filters.reportType ||
          filters.status ||
          filters.directionId ||
          filters.serviceId ||
          filters.reportYear !== currentYear()
      ),
    [filters]
  );

  const queryError = reportsQuery.isError
    ? getApiErrorMessage(reportsQuery.error)
    : statsQuery.isError
    ? getApiErrorMessage(statsQuery.error)
    : organizationQuery.isError
    ? getApiErrorMessage(organizationQuery.error)
    : scopeQuery.isError
    ? getApiErrorMessage(scopeQuery.error)
    : null;
  const actionError = createMutation.isError
    ? getApiErrorMessage(createMutation.error)
    : updateMutation.isError
    ? getApiErrorMessage(updateMutation.error)
    : recomputeMutation.isError
    ? getApiErrorMessage(recomputeMutation.error)
    : validateMutation.isError
    ? getApiErrorMessage(validateMutation.error)
    : archiveMutation.isError
    ? getApiErrorMessage(archiveMutation.error)
    : deleteMutation.isError
    ? getApiErrorMessage(deleteMutation.error)
    : exportMutation.isError
    ? getApiErrorMessage(exportMutation.error)
    : null;
  const isActionPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    recomputeMutation.isPending ||
    validateMutation.isPending ||
    archiveMutation.isPending;

  async function save(
    input: GenerateManagementReportInput | UpdateManagementReportInput
  ): Promise<void> {
    if (formMode === "EDIT" && editingReport) {
      await updateMutation.mutateAsync({
        id: editingReport.id,
        input: input as UpdateManagementReportInput,
      });
      return;
    }
    await createMutation.mutateAsync(input as GenerateManagementReportInput);
  }

  return (
    <section className="reports-page">
      <header className="reports-hero">
        <div>
          <p className="reports-eyebrow">
            CONSOLIDATION · PILOTAGE · REDDITION
          </p>
          <h2>
            Rapports <span>décisionnels.</span>
          </h2>
           
        </div>
        <div className="reports-hero-actions">
          <button
            className="report-secondary-button"
            type="button"
            onClick={() => void refreshAll()}
           data-ui-action="compact" aria-label="Actualiser" title="Actualiser">
            <RefreshCw size={18} /><span className="ui-action-label"> Actualiser
          </span></button>
          <button
            className="report-secondary-button"
            type="button"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
           data-ui-action="compact" aria-label="Export Excel" title="Export Excel">
            {exportMutation.isPending ? (
              <LoaderCircle size={18} className="is-spinning" />
            ) : (
              <Download size={18} />
            )}{" "}<span className="ui-action-label">
            Export Excel
          </span></button>
          {canCreate && (
            <button
              className="report-primary-button"
              type="button"
              onClick={() => {
                setEditingReport(null);
                setFormMode("CREATE");
              }}
             data-ui-action="compact" aria-label="Nouveau rapport" title="Nouveau rapport">
              <FilePlus2 size={18} /><span className="ui-action-label"> Nouveau rapport
            </span></button>
          )}
        </div>
      </header>

      {(queryError || actionError) && (
        <div className="reports-alert">
          <CircleAlert size={20} />
          <div>
            <strong>Le module Rapports rencontre une difficulté.</strong>
            <p>{queryError ?? actionError}</p>
          </div>
        </div>
      )}

      <section className="reports-metrics-grid">
        <article className="reports-metric-card">
          <span className="reports-metric-icon total">
            <FileBarChart2 size={21} />
          </span>
          <div>
            <span>Rapports enregistrés</span>
            <strong>{stats?.total ?? "—"}</strong>
            <p>Tous formats confondus</p>
          </div>
        </article>
        <article className="reports-metric-card">
          <span className="reports-metric-icon monthly">
            <CalendarRange size={21} />
          </span>
          <div>
            <span>Mensuels</span>
            <strong>{stats?.monthly ?? "—"}</strong>
            <p>Suivi régulier</p>
          </div>
        </article>
        <article className="reports-metric-card">
          <span className="reports-metric-icon validated">
            <BadgeCheck size={21} />
          </span>
          <div>
            <span>Validés</span>
            <strong>{stats?.validated ?? "—"}</strong>
            <p>Prêts à diffusion</p>
          </div>
        </article>
        <article className="reports-metric-card">
          <span className="reports-metric-icon index">
            <BarChart3 size={21} />
          </span>
          <div>
            <span>Indice moyen</span>
            <strong>{stats?.averagePerformanceIndex ?? "—"}/100</strong>
            <p>Pilotage consolidé</p>
          </div>
        </article>
        <article className="reports-metric-card">
          <span className="reports-metric-icon risk">
            <ShieldAlert size={21} />
          </span>
          <div>
            <span>Risques élevés</span>
            <strong>{stats?.highRisk ?? "—"}</strong>
            <p>Rapports à arbitrer</p>
          </div>
        </article>
        <article className="reports-metric-card">
          <span className="reports-metric-icon archived">
            <Archive size={21} />
          </span>
          <div>
            <span>Archivés</span>
            <strong>{stats?.archived ?? "—"}</strong>
            <p>Mémoire</p>
          </div>
        </article>
      </section>

      <section className="reports-filter-panel">
        <div className="reports-filter-heading">
          <Search size={19} />
          <div>
            <strong>Registre et recherche</strong>
            <span>
              Filtrez par période, format, statut ou périmètre organisationnel.
            </span>
          </div>
        </div>
        <div className="reports-filters">
          <label className="reports-search-field">
            <Search size={17} />
            <input
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Référence, titre, Direction ou Service..."
            />
          </label>
          <label className="report-filter-field">
            <span>Année</span>
            <input
              value={filters.reportYear}
              onChange={(e) => setFilter("reportYear", e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="report-filter-field">
            <span>Type</span>
            <select
              value={filters.reportType}
              onChange={(e) => setFilter("reportType", e.target.value)}
            >
              <option value="">Tous</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="report-filter-field">
            <span>Statut</span>
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
            >
              <option value="">Tous</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="report-filter-field">
            <span>Direction</span>
            <select
              value={filters.directionId}
              onChange={(e) => setFilter("directionId", e.target.value)}
            >
              <option value="">Toutes</option>
              {visibleDirections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="report-filter-field">
            <span>Service</span>
            <select
              value={filters.serviceId}
              onChange={(e) => setFilter("serviceId", e.target.value)}
              disabled={!filters.directionId}
            >
              <option value="">Tous</option>
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="report-clear-button"
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <X size={16} /> Effacer
          </button>
        </div>
      </section>

      <section className="reports-list-panel">
        <header className="reports-list-header">
          <div>
            <p>REGISTRE</p>
            <h3>Rapports de gestion et de performance</h3>
          </div>
          <span>
            {pagination?.total ?? 0} document
            {(pagination?.total ?? 0) > 1 ? "s" : ""}
          </span>
        </header>
        {reportsQuery.isLoading && (
          <div className="reports-empty">
            <LoaderCircle size={26} className="is-spinning" /> Chargement des
            rapports...
          </div>
        )}
        {!reportsQuery.isLoading &&
          !reportsQuery.isError &&
          reports.length === 0 && (
            <div className="reports-empty">
              <FileBarChart2 size={35} />
              <strong>Aucun rapport trouvé.</strong>
              <p>Générez le premier rapport mensuel, semestriel ou annuel.</p>
            </div>
          )}
        <div className="reports-list">
          {reports.map((report) => (
            <article className="report-card" key={report.id}>
              <div className="report-card-main">
                <span className="report-reference">{report.reference}</span>
                <h4>{report.title}</h4>
                <p>
                  {typeLabels[report.reportType]} ·{" "}
                  {report.scopeType === "INSTITUTION"
                    ? "Organisation"
                    : report.scopeSnapshot.serviceName ??
                      report.scopeSnapshot.directionName}
                </p>
                <small>
                  {formatDate(report.periodStartDate)} —{" "}
                  {formatDate(report.periodEndDate)}
                </small>
                <small className="report-card-owner">
                  {report.permissions.isOwner
                    ? "Votre rapport"
                    : `Rédigé par ${report.preparedByName}`}
                </small>
              </div>
              <div className="report-card-index">
                <strong>{report.intelligence.performanceIndex}</strong>
                <span>Indice /100</span>
              </div>
              <div className="report-card-status">
                <span>{statusLabels[report.status]}</span>
                <small>
                  {riskLabels[report.intelligence.riskLevel]} · Données{" "}
                  {report.intelligence.dataConfidence.toLowerCase()}
                </small>
                <small>
                  {report.snapshot.tasks.completed}/
                  {report.snapshot.tasks.total} tâche(s) · Roadmap{" "}
                  {report.snapshot.roadmaps.averageProgress}%
                </small>
              </div>
              <div className="report-card-actions">
                <button
                  type="button"
                  onClick={() => setSelectedId(report.id)}
                  title="Consulter"
                 aria-label="Consulter">
                  <Eye size={17} />
                </button>
                {report.permissions.canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReport(report);
                      setFormMode("EDIT");
                    }}
                    title="Compléter"
                   aria-label="Compléter">
                    <Pencil size={17} />
                  </button>
                )}
                {report.permissions.canDelete && (
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => setToDelete(report)}
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
          <footer className="reports-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
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
                setPage((value) => Math.min(pagination.totalPages, value + 1))
              }
            >
              Suivant
            </button>
          </footer>
        )}
      </section>

      {formMode && accessScope && (
        <ReportFormModal
          key={`${formMode}-${editingReport?.id ?? "new"}-${
            editingReport?.updatedAt ?? "initial"
          }`}
          mode={formMode}
          role={role}
          accessScope={accessScope}
          directions={visibleDirections}
          report={editingReport}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          errorMessage={actionError}
          onClose={() => {
            setFormMode(null);
            setEditingReport(null);
          }}
          onSubmit={save}
        />
      )}
      {selectedQuery.data && (
        <ReportDetailsDrawer
          report={selectedQuery.data}
          isSubmitting={isActionPending}
          errorMessage={actionError}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setEditingReport(selectedQuery.data);
            setFormMode("EDIT");
          }}
          onRecompute={async () => {
            await recomputeMutation.mutateAsync(selectedQuery.data.id);
          }}
          onValidate={async (comment) => {
            await validateMutation.mutateAsync({
              id: selectedQuery.data.id,
              comment,
            });
          }}
          onArchive={async () => {
            await archiveMutation.mutateAsync(selectedQuery.data.id);
          }}
        />
      )}

      {toDelete && (
        <div className="report-delete-layer">
          <button
            className="report-delete-backdrop"
            type="button"
            onClick={() => setToDelete(null)}
          />
          <section className="report-delete-modal">
            <h3>Supprimer ce rapport ?</h3>
            <p>
              Le document <strong>{toDelete.reference}</strong> et son snapshot
              historique seront supprimés définitivement.
            </p>
            <footer>
              <button
                type="button"
                className="report-cancel-button"
                onClick={() => setToDelete(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="report-danger-button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(toDelete.id)}
               data-ui-action="compact" aria-label="Supprimer" title="Supprimer">
                {deleteMutation.isPending ? (
                  <LoaderCircle size={17} className="is-spinning" />
                ) : (
                  <Trash2 size={17} />
                )}{" "}<span className="ui-action-label">
                Supprimer
              </span></button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
