import { useTenantSettings } from "../settings/settings.context";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, Download, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "../auth/auth.context";
import { getApiErrorMessage } from "../auth/auth.api";
import {
  listPayroll,
  savePayroll,
  searchPayrollAgents,
  transitionPayroll,
  type Payroll,
  type PayrollInput,
} from "./payroll.api";
import "./payroll.css";
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
function usePayrollDialog(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>(
      ".payroll-overlay .payroll-dialog",
    );
    const selector =
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
    const frame = requestAnimationFrame(() =>
      dialog?.querySelector<HTMLElement>(selector)?.focus(),
    );
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
      const first = items[0],
        last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [active, close]);
}
function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
export default function PayrollPage() {
  const { settings } = useTenantSettings();
  const { user } = useAuth();
  const manager = user?.role === "TENANT_ADMIN" || user?.role === "RH_MANAGER";
  const [period, setPeriod] = useState(localMonth);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Payroll | "new" | null>(null);
  const [selected, setSelected] = useState<Payroll | null>(null);
  const [confirmation, setConfirmation] = useState<{
    row: Payroll;
    action: "APPROVE" | "PAY" | "CANCEL";
  } | null>(null);
  const [reference, setReference] = useState("");
  const client = useQueryClient();
  const key = ["payroll", user?.tenantId, user?.id];
  const query = useQuery({
    queryKey: [...key, period, page],
    queryFn: () => listPayroll(period, page),
  });
  const mutation = useMutation({
    mutationFn: ({
      row,
      action,
    }: {
      row: Payroll;
      action: "APPROVE" | "PAY" | "CANCEL";
    }) => transitionPayroll(row, action, reference),
    onSuccess: async () => {
      setConfirmation(null);
      setSelected(null);
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const closeDialog = useCallback(() => {
    if (!mutation.isPending) {
      setSelected(null);
      setConfirmation(null);
    }
  }, [mutation.isPending]);
  usePayrollDialog(Boolean(selected || confirmation), closeDialog);
  return (
    <div className="payroll-page">
      <header className="payroll-hero">
        <div>
          <h2>Paie</h2>
          <p>
            Préparez, contrôlez et suivez les bulletins de votre organisation.
          </p>
        </div>
        {manager && (
          <button className="payroll-primary" onClick={() => setEditor("new")}>
            <Plus size={18} /> Nouveau bulletin
          </button>
        )}
      </header>
      <div className="payroll-toolbar">
        <label>
          Période{" "}
          <input
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <span>{query.data?.total ?? 0} bulletin(s)</span>
      </div>
      {query.isPending && <p role="status">Chargement des bulletins…</p>}
      {query.isError && (
        <div role="alert">
          {getApiErrorMessage(query.error)}{" "}
          <button onClick={() => void query.refetch()}>Réessayer</button>
        </div>
      )}
      {query.data?.items.length === 0 && (
        <div className="payroll-empty">Aucun bulletin pour cette période.</div>
      )}
      <div className="payroll-grid">
        {query.data?.items.map((row) => (
          <article className="payroll-card" key={row.id}>
            <div className="payroll-card-heading">
              <div>
                <h3>{row.agentName}</h3>
                <small>
                  {row.matricule} · {row.period}
                </small>
              </div>
              <span className={`payroll-status is-${row.status.toLowerCase()}`}>
                {statusLabels[row.status]}
              </span>
            </div>
            <dl>
              <div>
                <dt>Brut</dt>
                <dd>{money(row.gross, row)}</dd>
              </div>
              <div>
                <dt>Net à payer</dt>
                <dd>{money(row.net, row)}</dd>
              </div>
            </dl>
            <div className="payroll-actions">
              <button onClick={() => setSelected(row)}>Voir le bulletin</button>
              {manager && row.status === "DRAFT" && (
                <>
                  <button
                    aria-label="Modifier le bulletin"
                    title="Modifier"
                    onClick={() => setEditor(row)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    aria-label="Valider le bulletin"
                    title="Valider"
                    onClick={() => {
                      mutation.reset();
                      setConfirmation({ row, action: "APPROVE" });
                    }}
                  >
                    <Check size={17} />
                  </button>
                </>
              )}
              {manager && row.status === "APPROVED" && (
                <button
                  title="Enregistrer un paiement"
                  aria-label="Enregistrer un paiement"
                  onClick={() => {
                    mutation.reset();
                    setReference("");
                    setConfirmation({ row, action: "PAY" });
                  }}
                >
                  <CreditCard size={17} />
                </button>
              )}
              {manager && ["DRAFT", "APPROVED"].includes(row.status) && (
                <button
                  title="Annuler le bulletin"
                  aria-label="Annuler le bulletin"
                  onClick={() => {
                    mutation.reset();
                    setConfirmation({ row, action: "CANCEL" });
                  }}
                >
                  <X size={17} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {query.data && query.data.total > 20 && (
        <nav
          className="payroll-pagination"
          aria-label="Pagination des bulletins"
        >
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Précédent
          </button>
          <span>Page {page}</span>
          <button
            disabled={page * 20 >= query.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </button>
        </nav>
      )}
      {editor && (
        <PayrollEditor
          existing={editor === "new" ? undefined : editor}
          period={period}
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
          <div className="payroll-dialog payroll-document">
            <div className="payroll-actions payroll-no-print">
              <button onClick={() => window.print()}>
                <Download size={17} /> Imprimer / PDF
              </button>
              <button
                autoFocus
                aria-label="Fermer le bulletin"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </div>
            <header>
              <h2>{settings?.institution.legalName || "Organisation"}</h2>
              <p>{settings?.institution.address}</p>
              <h3>Bulletin de paie · {selected.period}</h3>
            </header>
            <h3>{selected.agentName}</h3>
            <p>
              Matricule : {selected.matricule} · {statusLabels[selected.status]}
            </p>
            <dl>
              {(
                [
                  ["Salaire de base", selected.base],
                  ["Primes", selected.bonus],
                  ["Brut", selected.gross],
                  ["Cotisations salariales", selected.employeeContribution],
                  ["Impôt configuré", selected.tax],
                  ["Autres retenues", selected.deductions],
                  ["Net à payer", selected.net],
                  ["Cotisations patronales", selected.employerContribution],
                  ["Coût employeur", selected.employerCost],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{money(value, selected)}</dd>
                </div>
              ))}
            </dl>
            <p>
              Taux salarial : {selected.employeeRate / 100} % · patronal :{" "}
              {selected.employerRate / 100} % · impôt : {selected.taxRate / 100}{" "}
              %
            </p>
            <p>Règles appliquées : {selected.rulesNote}</p>
            {selected.note && <p>{selected.note}</p>}
            {selected.paymentReference && (
              <p>Référence du paiement : {selected.paymentReference}</p>
            )}
          </div>
        </section>
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
              >
                Retour
              </button>
              <button className="payroll-primary" disabled={mutation.isPending}>
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
          <button type="button" disabled={mutation.isPending} onClick={onClose}>
            Annuler
          </button>
          <button className="payroll-primary" disabled={mutation.isPending}>
            Enregistrer le brouillon
          </button>
        </div>
      </form>
    </section>
  );
}
