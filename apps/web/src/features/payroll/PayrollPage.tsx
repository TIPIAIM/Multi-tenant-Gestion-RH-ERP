import PayrollShareDialog from "./PayrollShareDialog";
import PayslipDocument from "./PayslipDocument";
import { usePayrollDialog } from "./payroll-dialog";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  Clock3,
  BadgeCheck,
  CreditCard,
  Share2,
  Pencil,
  Plus,
  X,
  Eye,
  Search,
  Filter,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  CircleAlert,
} from "lucide-react";
import { useAuth } from "../auth/auth.context";
import { getApiErrorMessage } from "../auth/auth.api";
import {
  listPayroll,
  savePayroll,
  searchPayrollAgents,
  transitionPayroll,
  type Payroll,
  type PayrollInput,
  type PayrollListFilters,
  type PayrollSortField,
} from "./payroll.api";
import "./payroll.css";
import "./payroll-table.css";
import "./payroll-ui.css";
const statusLabels = {
  DRAFT: "Brouillon",
  APPROVED: "Validé",
  PAID: "Payé",
  CANCELLED: "Annulé",
};
function money(
  value: number,
  row: Pick<Payroll, "minorUnitDigits" | "currency">,
) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: row.currency,
  }).format(value / 10 ** row.minorUnitDigits);
}
function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
export default function PayrollPage() {
  const { user } = useAuth();
  const manager = user?.role === "TENANT_ADMIN" || user?.role === "RH_MANAGER";
  const [view, setView] = useState<
    PayrollListFilters & { period: string; page: number }
  >({
    period: localMonth(),
    page: 1,
    search: "",
    status: "",
    currency: "",
    sortBy: "period",
    sortOrder: "desc",
    limit: 20,
  });
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setView((current) =>
          current.search === search.trim()
            ? current
            : { ...current, search: search.trim(), page: 1 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);
  function updateView(patch: Partial<PayrollListFilters & { period: string }>) {
    setView((current) => ({ ...current, ...patch, page: 1 }));
  }
  function resetFilters() {
    setSearch("");
    setView((current) => ({
      ...current,
      period: localMonth(),
      search: "",
      status: "",
      currency: "",
      page: 1,
    }));
  }
  function sortBy(field: PayrollSortField) {
    setView((current) => ({
      ...current,
      sortBy: field,
      sortOrder:
        current.sortBy === field && current.sortOrder === "asc"
          ? "desc"
          : "asc",
      page: 1,
    }));
  }
  const hasFilters = Boolean(
    search || view.status || view.currency || view.period !== localMonth(),
  );
  const [editor, setEditor] = useState<Payroll | "new" | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [selected, setSelected] = useState<Payroll | null>(null);
  const [confirmation, setConfirmation] = useState<{
    row: Payroll;
    action: "APPROVE" | "PAY" | "CANCEL";
  } | null>(null);
  const [share, setShare] = useState<Payroll | null>(null);
  const [reference, setReference] = useState("");
  const client = useQueryClient();
  const key = ["payroll", user?.tenantId, user?.id];
  const query = useQuery({
    queryKey: [...key, "list", view],
    queryFn: ({ signal }) => listPayroll(view.period, view.page, view, signal),
  });
  useEffect(() => {
    if (query.data && query.data.page !== view.page)
      setView((current) => ({ ...current, page: query.data.page }));
  }, [query.data, view.page]);
  const statCards: {
    status: PayrollListFilters["status"];
    label: string;
    description: string;
    icon: typeof FileText;
  }[] = [
    {
      status: "",
      label: "Tous les bulletins",
      description: "Selon la période et les filtres",
      icon: FileText,
    },
    ...(manager
      ? [
          {
            status: "DRAFT" as const,
            label: "Brouillons",
            description: "À compléter ou à valider",
            icon: Pencil,
          },
        ]
      : []),
    {
      status: "APPROVED",
      label: "Validés",
      description: "En attente de paiement",
      icon: Clock3,
    },
    {
      status: "PAID",
      label: "Payés",
      description: "Paiement enregistré",
      icon: BadgeCheck,
    },
  ];
  const statistics = useQueries({
    queries: statCards.map((card) => ({
      queryKey: [
        ...key,
        "statistics",
        {
          period: view.period,
          search: view.search,
          currency: view.currency,
          status: card.status,
        },
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        listPayroll(
          view.period,
          1,
          { ...view, status: card.status, limit: 20 },
          signal,
        ),
      enabled: Boolean(user),
      staleTime: 30_000,
    })),
  });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const limit = query.data?.limit ?? view.limit;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  function sortHeader(label: string, field: PayrollSortField, numeric = false) {
    const active = view.sortBy === field;
    const Icon = active
      ? view.sortOrder === "asc"
        ? ArrowUp
        : ArrowDown
      : ArrowUpDown;
    return (
      <th
        scope="col"
        className={numeric ? "is-number" : undefined}
        aria-sort={
          active
            ? view.sortOrder === "asc"
              ? "ascending"
              : "descending"
            : undefined
        }
      >
        <button
          type="button"
          className="payroll-sort-button"
          onClick={() => sortBy(field)}
          aria-label={`Trier par ${label}, ${active && view.sortOrder === "asc" ? "ordre décroissant" : "ordre croissant"}`}
        >
          {label}
          <Icon size={14} aria-hidden="true" />
        </button>
      </th>
    );
  }
  const mutation = useMutation({
    mutationFn: ({
      row,
      action,
    }: {
      row: Payroll;
      action: "APPROVE" | "PAY" | "CANCEL";
    }) => transitionPayroll(row, action, reference),
    onSuccess: async (response, variables) => {
      setConfirmation(null);
      setSelected(
        variables.action === "APPROVE"
          ? (response.data.data.payroll as Payroll)
          : null,
      );
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const closeDialog = useCallback(() => {
    if (!mutation.isPending && !documentBusy) {
      setSelected(null);
      setConfirmation(null);
    }
  }, [mutation.isPending, documentBusy]);
  usePayrollDialog(Boolean(selected || confirmation), closeDialog);
  return (
    <div className="payroll-page" aria-label="Gestion de la paie">
      <header className="payroll-hero payroll-table-hero">
        <div>
          <p className="payroll-eyebrow">GESTION DES RESSOURCES HUMAINES</p>
          <h2>
            Gestion de la <span>paie</span>
          </h2>
          <p className="payroll-hero-description">
            {manager
              ? "Préparez les bulletins et suivez les paiements."
              : "Consultez vos bulletins validés et vos paiements."}
          </p>
        </div>
        <div className="payroll-hero-actions">
          <button
            type="button"
            className="payroll-secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            title="Actualiser les bulletins"
            aria-label="Actualiser les bulletins"
            data-ui-action="compact"
            aria-busy={query.isFetching}
          >
            <RefreshCw
              size={18}
              className={query.isFetching ? "is-spinning" : undefined}
            />
            <span className="ui-action-label">Actualiser</span>
          </button>
          {manager && (
            <button
              type="button"
              className="payroll-primary"
              onClick={() => setEditor("new")}
            >
              <Plus size={18} />
              Nouveau bulletin
            </button>
          )}
        </div>
      </header>
      <section
        className={`payroll-stats-grid${manager ? "" : " is-personal"}`}
        aria-label="Suivi des bulletins"
      >
        {statCards.map((card, index) => {
          const result = statistics[index];
          const Icon = card.icon;
          return (
            <button
              key={card.status || "all"}
              type="button"
              className="payroll-stat-card"
              aria-pressed={view.status === card.status}
              aria-label={`Afficher : ${card.label.toLowerCase()}`}
              onClick={() => updateView({ status: card.status })}
            >
              <span className="payroll-stat-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="payroll-stat-content">
                <span>{card.label}</span>
                <strong aria-live="polite">{result?.data?.total ?? "—"}</strong>
                <small>
                  {result?.isError ? "Compteur indisponible" : card.description}
                </small>
              </span>
            </button>
          );
        })}
      </section>
      <section
        className="payroll-filter-panel"
        aria-labelledby="payroll-filter-title"
      >
        <div className="payroll-filter-heading">
          <Filter size={19} aria-hidden="true" />
          <div>
            <strong id="payroll-filter-title">Recherche et filtres</strong>
            <span>
              {manager
                ? "Retrouvez un collaborateur, un matricule ou une référence de paiement."
                : "Retrouvez vos bulletins par période, statut ou référence de paiement."}
            </span>
          </div>
        </div>
        <div className="payroll-filters">
          <label className="payroll-search-field">
            <span className="payroll-search-label">Rechercher un bulletin</span>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="Nom, matricule ou référence…"
            />
          </label>
          <label className="payroll-filter-field">
            <span>Période</span>
            <input
              type="month"
              value={view.period}
              onChange={(event) => updateView({ period: event.target.value })}
            />
            <button
              type="button"
              className="payroll-all-periods"
              disabled={!view.period}
              onClick={() => updateView({ period: "" })}
            >
              Toutes les périodes
            </button>
          </label>
          <label className="payroll-filter-field">
            <span>Statut</span>
            <select
              value={view.status}
              onChange={(event) =>
                updateView({
                  status: event.target.value as PayrollListFilters["status"],
                })
              }
            >
              <option value="">Tous les statuts</option>
              {Object.entries(statusLabels)
                .filter(
                  ([status]) =>
                    manager || ["APPROVED", "PAID"].includes(status),
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label className="payroll-filter-field">
            <span>Devise</span>
            <select
              value={view.currency}
              onChange={(event) => updateView({ currency: event.target.value })}
            >
              <option value="">Toutes les devises</option>
              {["GNF", "EUR", "USD", "XOF", "XAF"].map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
          <button
            className="payroll-clear"
            type="button"
            onClick={resetFilters}
            disabled={!hasFilters}
          >
            <X size={16} />
            Effacer
          </button>
        </div>
      </section>
      <section
        className="payroll-list-panel"
        aria-labelledby="payroll-list-title"
        aria-busy={query.isFetching}
      >
        <header className="payroll-list-header">
          <div>
            <p>BULLETINS ET PAIEMENTS</p>
            <h3 id="payroll-list-title">
              {manager ? "Liste des bulletins" : "Mes bulletins"}
            </h3>
          </div>
          <span className="payroll-list-count" role="status">
            {query.data ? `${total} résultat${total > 1 ? "s" : ""}` : "…"}
          </span>
        </header>
        <div className="payroll-table-tools">
          <span id="payroll-table-help">
            Cliquez sur un en-tête pour trier les résultats.
          </span>
          <label>
            <span>Lignes par page</span>
            <select
              value={view.limit}
              onChange={(event) =>
                updateView({
                  limit: Number(event.target.value) as 20 | 50 | 100,
                })
              }
            >
              {[20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        {query.isPending && (
          <div className="payroll-list-state" role="status">
            <LoaderCircle size={24} className="is-spinning" />
            <span>Chargement des bulletins…</span>
          </div>
        )}
        {query.isError && (
          <div className="payroll-list-error" role="alert">
            <CircleAlert size={20} />
            <div>
              <strong>Liste indisponible</strong>
              <p>{getApiErrorMessage(query.error)}</p>
              <button type="button" onClick={() => void query.refetch()}>
                Réessayer
              </button>
            </div>
          </div>
        )}
        {!query.isPending && !query.isError && items.length === 0 && (
          <div className="payroll-list-state">
            <FileText size={32} />
            <strong>Aucun bulletin trouvé</strong>
            <p>
              {hasFilters
                ? "Modifiez vos filtres ou votre recherche pour afficher d’autres résultats."
                : manager
                  ? "Créez votre premier bulletin pour cette période."
                  : "Aucun bulletin validé n’est disponible pour cette période."}
            </p>
            {hasFilters && (
              <button type="button" onClick={resetFilters}>
                Effacer les filtres
              </button>
            )}
          </div>
        )}
        {!query.isError && items.length > 0 && (
          <>
            <p className="payroll-table-mobile-hint">
              <ArrowUpDown size={14} aria-hidden="true" />
              Faites défiler le tableau pour voir les montants et les actions.
            </p>
            <div
              className="payroll-table-scroll"
              role="region"
              aria-label="Tableau des bulletins, défilement horizontal"
              tabIndex={0}
            >
              <table
                className="payroll-list-table"
                aria-describedby="payroll-table-help"
              >
                <caption className="payroll-sr-only">
                  Bulletins de paie avec tri sur l’ensemble des résultats
                  filtrés
                </caption>
                <thead>
                  <tr>
                    {sortHeader("Collaborateur", "agentName")}
                    {sortHeader("Période", "period")}
                    {sortHeader("Brut", "gross", true)}
                    <th scope="col" className="is-number">
                      Retenues
                    </th>
                    {sortHeader("Net à payer", "net", true)}
                    <th scope="col">Statut</th>
                    {sortHeader("Paiement", "paidAt")}
                    <th scope="col" className="payroll-actions-heading">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <th scope="row" className="payroll-person-cell">
                        <button
                          type="button"
                          className="payroll-person-link"
                          aria-haspopup="dialog"
                          onClick={() => setSelected(row)}
                        >
                          {row.agentName}
                        </button>
                        <span>{row.matricule}</span>
                      </th>
                      <td className="payroll-period-cell">
                        {new Intl.DateTimeFormat("fr-FR", {
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(`${row.period}-01T00:00:00Z`))}
                      </td>
                      <td className="is-number">{money(row.gross, row)}</td>
                      <td className="is-number">
                        {money(
                          row.employeeContribution + row.tax + row.deductions,
                          row,
                        )}
                      </td>
                      <td className="is-number payroll-net-cell">
                        {money(row.net, row)}
                      </td>
                      <td>
                        <span
                          className={`payroll-status is-${row.status.toLowerCase()}`}
                        >
                          {statusLabels[row.status]}
                        </span>
                      </td>
                      <td className="payroll-payment-cell">
                        {row.paidAt ? (
                          <time dateTime={row.paidAt}>
                            {new Intl.DateTimeFormat("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              timeZone: "UTC",
                            }).format(new Date(row.paidAt))}
                          </time>
                        ) : (
                          <span className="payroll-muted">—</span>
                        )}
                        {row.paymentReference && (
                          <small title={row.paymentReference}>
                            {row.paymentReference}
                          </small>
                        )}
                      </td>
                      <td>
                        <div className="payroll-row-actions">
                          <button
                            type="button"
                            className="payroll-view-button"
                            aria-haspopup="dialog"
                            onClick={() => setSelected(row)}
                            aria-label={`Voir le bulletin de ${row.agentName}`}
                            title="Voir le bulletin"
                          >
                            <Eye size={20} aria-hidden="true" />
                          </button>
                          {manager &&
                            ["APPROVED", "PAID"].includes(row.status) && (
                              <button
                                type="button"
                                onClick={() => setShare(row)}
                                aria-label={`Partager le bulletin de ${row.agentName}`}
                                title="Partager à l’agent"
                              >
                                <Share2 size={17} />
                              </button>
                            )}
                          {manager && row.status === "DRAFT" && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditor(row)}
                                aria-label={`Modifier le bulletin de ${row.agentName}`}
                                title="Modifier"
                              >
                                <Pencil size={17} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  mutation.reset();
                                  setConfirmation({ row, action: "APPROVE" });
                                }}
                                aria-label={`Valider le bulletin de ${row.agentName}`}
                                title="Valider"
                              >
                                <Check size={17} />
                              </button>
                            </>
                          )}
                          {manager && row.status === "APPROVED" && (
                            <button
                              type="button"
                              onClick={() => {
                                mutation.reset();
                                setReference("");
                                setConfirmation({ row, action: "PAY" });
                              }}
                              aria-label={`Enregistrer le paiement de ${row.agentName}`}
                              title="Enregistrer un paiement"
                            >
                              <CreditCard size={17} />
                            </button>
                          )}
                          {manager &&
                            ["DRAFT", "APPROVED"].includes(row.status) && (
                              <button
                                type="button"
                                className="payroll-cancel-action"
                                onClick={() => {
                                  mutation.reset();
                                  setConfirmation({ row, action: "CANCEL" });
                                }}
                                aria-label={`Annuler le bulletin de ${row.agentName}`}
                                title="Annuler le bulletin"
                              >
                                <X size={17} />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="payroll-table-pagination">
              <p>
                {(view.page - 1) * limit + 1}–
                {Math.min(view.page * limit, total)} sur {total} · Page{" "}
                {view.page} sur {totalPages}
              </p>
              <div>
                <button
                  type="button"
                  disabled={view.page <= 1 || query.isFetching}
                  onClick={() =>
                    setView((current) => ({
                      ...current,
                      page: current.page - 1,
                    }))
                  }
                >
                  <ChevronLeft size={17} />
                  Précédent
                </button>
                <button
                  type="button"
                  disabled={view.page >= totalPages || query.isFetching}
                  onClick={() =>
                    setView((current) => ({
                      ...current,
                      page: current.page + 1,
                    }))
                  }
                >
                  Suivant
                  <ChevronRight size={17} />
                </button>
              </div>
            </footer>
          </>
        )}
        {!view.currency && ["gross", "net"].includes(view.sortBy) && (
          <p className="payroll-sort-note">
            Les montants sont regroupés par devise, puis triés par valeur.
          </p>
        )}
      </section>
      {editor && (
        <PayrollEditor
          existing={editor === "new" ? undefined : editor}
          period={view.period || localMonth()}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await client.invalidateQueries({ queryKey: key });
          }}
        />
      )}
      {selected && (
        <section
          className="payroll-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Bulletin de paie"
        >
          <PayslipDocument
            row={selected}
            manager={manager}
            onBusyChange={setDocumentBusy}
            onUpdate={(updated) => {
              setSelected(updated);
              void client.invalidateQueries({ queryKey: ["payroll"] });
            }}
            onClose={() => setSelected(null)}
            onShare={
              manager && ["APPROVED", "PAID"].includes(selected.status)
                ? () => {
                    setSelected(null);
                    setShare(selected);
                  }
                : undefined
            }
          />
        </section>
      )}
      {share && (
        <PayrollShareDialog row={share} onClose={() => setShare(null)} />
      )}
      {confirmation && (
        <section
          className="payroll-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer l’action"
        >
          <form
            className="payroll-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(confirmation);
            }}
          >
            <h3>
              {confirmation.action === "APPROVE"
                ? "Valider le bulletin ?"
                : confirmation.action === "PAY"
                  ? "Enregistrer le paiement ?"
                  : "Annuler le bulletin ?"}
            </h3>
            <p>
              {confirmation.row.agentName} ·{" "}
              {money(confirmation.row.net, confirmation.row)}
            </p>
            <p>
              {confirmation.action === "APPROVE"
                ? "Les montants seront verrouillés après validation."
                : confirmation.action === "PAY"
                  ? "Cette action enregistre un paiement effectué ; elle ne déclenche aucun virement bancaire."
                  : "Le bulletin restera dans l’historique."}
            </p>
            {confirmation.action === "PAY" && (
              <label>
                Référence du paiement
                <input
                  required
                  maxLength={180}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            )}
            {mutation.isError && (
              <p role="alert">{getApiErrorMessage(mutation.error)}</p>
            )}
            <div className="payroll-actions">
              <button
                autoFocus
                type="button"
                disabled={mutation.isPending}
                onClick={() => setConfirmation(null)}
                aria-busy={mutation.isPending}
              >
                Retour
              </button>
              <button
                className="payroll-primary"
                disabled={mutation.isPending}
                aria-busy={mutation.isPending}
              >
                Confirmer
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
function PayrollEditor({
  existing,
  period,
  onClose,
  onSaved,
}: {
  existing?: Payroll;
  period: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const { user } = useAuth();
  const agents = useQuery({
    queryKey: ["payroll", "agents", user?.tenantId, user?.id, debounced],
    queryFn: () => searchPayrollAgents(debounced),
    enabled: !existing,
  });
  const [data, setData] = useState<PayrollInput>(
    existing ?? {
      agentId: "",
      period,
      currency: "GNF",
      base: 0,
      bonus: 0,
      deductions: 0,
      employeeRate: 0,
      employerRate: 0,
      taxRate: 0,
      rulesNote: "",
      note: "",
    },
  );
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (input: PayrollInput) => savePayroll(input, existing),
    onSuccess: onSaved,
  });
  const digits = ["GNF", "XOF", "XAF"].includes(data.currency) ? 0 : 2;
  const closeEditor = useCallback(() => {
    if (!mutation.isPending) onClose();
  }, [mutation.isPending, onClose]);
  usePayrollDialog(true, closeEditor);
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const {
      agentId,
      period: month,
      currency,
      base,
      bonus,
      deductions,
      employeeRate,
      employerRate,
      taxRate,
      rulesNote,
      note,
    } = data;
    if (!agentId) {
      setError("Choisissez un agent.");
      return;
    }
    mutation.mutate({
      agentId,
      period: month,
      currency,
      base,
      bonus,
      deductions,
      employeeRate,
      employerRate,
      taxRate,
      rulesNote,
      note,
    });
  }
  return (
    <section
      className="payroll-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Préparer un bulletin"
    >
      <form className="payroll-dialog" onSubmit={submit}>
        <h2>{existing ? "Modifier le brouillon" : "Nouveau bulletin"}</h2>
        {!existing && (
          <>
            <label>
              Rechercher un agent
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom ou matricule"
              />
            </label>
            <label>
              Agent
              <select
                required
                value={data.agentId}
                onChange={(e) =>
                  setData((d) => ({ ...d, agentId: e.target.value }))
                }
              >
                <option value="">Sélectionner</option>
                {agents.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName} · {a.matricule}
                  </option>
                ))}
              </select>
            </label>
            {agents.isError && (
              <p role="alert">{getApiErrorMessage(agents.error)}</p>
            )}
            <small>
              Jusqu’à 50 résultats ; précisez la recherche pour retrouver un
              agent.
            </small>
          </>
        )}
        {existing && <p>{existing.agentName}</p>}
        <div className="payroll-fields">
          <label>
            Période
            <input
              required
              type="month"
              disabled={Boolean(existing)}
              value={data.period}
              onChange={(e) =>
                setData((d) => ({ ...d, period: e.target.value }))
              }
            />
          </label>
          <label>
            Devise
            <select
              disabled={Boolean(existing)}
              value={data.currency}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  currency: e.target.value,
                  base: 0,
                  bonus: 0,
                  deductions: 0,
                }))
              }
            >
              {["GNF", "EUR", "USD", "XOF", "XAF"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {(
            [
              ["base", "Salaire de base"],
              ["bonus", "Primes"],
              ["deductions", "Autres retenues"],
            ] as const
          ).map(([field, label]) => (
            <label key={field}>
              {label} ({data.currency})
              <input
                type="number"
                min="0"
                max={1_000_000_000_000 / 10 ** digits}
                step={1 / 10 ** digits}
                required
                value={data[field] / 10 ** digits}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    [field]: Math.round(Number(e.target.value) * 10 ** digits),
                  }))
                }
              />
            </label>
          ))}
          {(
            [
              ["employeeRate", "Cotisations salariales"],
              ["employerRate", "Cotisations patronales"],
              ["taxRate", "Impôt"],
            ] as const
          ).map(([field, label]) => (
            <label key={field}>
              {label} (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={data[field] / 100}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    [field]: Math.round(Number(e.target.value) * 100),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <p className="payroll-help">
          Les cotisations portent sur le brut. L’impôt configuré porte sur le
          brut diminué des cotisations salariales. Les autres retenues sont
          déduites ensuite. Aucun barème légal n’est prérempli.
        </p>
        <label>
          Référence des règles appliquées
          <textarea
            required
            minLength={5}
            maxLength={2000}
            value={data.rulesNote}
            onChange={(e) =>
              setData((d) => ({ ...d, rulesNote: e.target.value }))
            }
            placeholder="Accord, période d’application et règles validées par votre organisation"
          />
        </label>
        <label>
          Note sur le bulletin
          <textarea
            maxLength={2000}
            value={data.note}
            onChange={(e) => setData((d) => ({ ...d, note: e.target.value }))}
          />
        </label>
        {(error || mutation.isError) && (
          <p role="alert">{error || getApiErrorMessage(mutation.error)}</p>
        )}
        <div className="payroll-actions">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={onClose}
            aria-busy={mutation.isPending}
          >
            Annuler
          </button>
          <button
            className="payroll-primary"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
          >
            Enregistrer le brouillon
          </button>
        </div>
      </form>
    </section>
  );
}
