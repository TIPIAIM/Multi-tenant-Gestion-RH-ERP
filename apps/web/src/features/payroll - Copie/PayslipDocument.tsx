import {
  PrivateDocumentMark,
  useDocumentMarks,
} from "../settings/DocumentMarks";
import { useEffect, useState } from "react";
import { Download, Share2, X, ShieldCheck } from "lucide-react";
import { useTenantSettings } from "../settings/settings.context";
import { getApiErrorMessage } from "../auth/auth.api";
import {
  downloadPayrollPdf,
  updatePayrollPresentation,
  type Payroll,
} from "./payroll.api";

const labels = {
  DRAFT: "Brouillon",
  APPROVED: "Validé",
  PAID: "Payé",
  CANCELLED: "Annulé",
};
export default function PayslipDocument({
  row,
  onClose,
  onShare,
  manager = false,
  onUpdate,
  onBusyChange,
}: {
  row: Payroll;
  onClose: () => void;
  onShare?: () => void;
  manager?: boolean;
  onUpdate?: (row: Payroll) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { settings } = useTenantSettings();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = manager && ["APPROVED", "PAID"].includes(row.status);
  const marks = useDocumentMarks(editable);
  const [includeStamp, setIncludeStamp] = useState(Boolean(row.includeStamp));
  const [includeSignature, setIncludeSignature] = useState(
    Boolean(row.includeSignature),
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setIncludeStamp(Boolean(row.includeStamp));
    setIncludeSignature(Boolean(row.includeSignature));
  }, [row.id, row.revision, row.includeStamp, row.includeSignature]);
  const dirty =
    includeStamp !== Boolean(row.includeStamp) ||
    includeSignature !== Boolean(row.includeSignature);
  async function applyMarks() {
    if (!marks.data || !onUpdate) return;
    setSaving(true);
    onBusyChange?.(true);
    setError(null);
    try {
      onUpdate(
        await updatePayrollPresentation(row, {
          marksRevision: marks.data.revision,
          includeStamp,
          includeSignature,
        }),
      );
    } catch (e) {
      setError(getApiErrorMessage(e));
      await marks.refetch();
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }
  const company = settings?.institution;
  const logo = settings?.branding.printLogoUrl || settings?.branding.logoUrl;
  const money = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: row.currency,
    }).format(n / 10 ** row.minorUnitDigits);
  const amount = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: row.minorUnitDigits,
      maximumFractionDigits: row.minorUnitDigits,
    }).format(n / 10 ** row.minorUnitDigits);
  const period = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${row.period}-01T00:00:00Z`));
  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadPayrollPdf(row);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="payroll-dialog payroll-document">
      <div className="payroll-document-tools payroll-no-print">
        <span>
          <ShieldCheck size={16} /> Bulletin individuel
        </span>
        <div className="payroll-actions">
          {onShare && (
            <button
              type="button"
              aria-label="Partager à l’agent"
              title="Partager à l’agent"
              onClick={onShare}
              disabled={dirty || saving || downloading}
            >
              <Share2 size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading || dirty || saving}
            aria-busy={downloading || saving}
          >
            <Download size={17} />
            {downloading ? "Préparation…" : "PDF / Imprimer"}
          </button>
          <button
            type="button"
            aria-label="Fermer le bulletin"
            onClick={onClose}
            disabled={saving}
           aria-busy={saving}>
            <X size={18} />
          </button>
        </div>
      </div>
      {editable && (
        <section
          className="payroll-mark-options payroll-no-print"
          aria-label="Visuels du bulletin"
        >
          <strong>Visuels sur ce bulletin</strong>
          <label>
            <input
              type="checkbox"
              checked={includeStamp}
              onChange={(event) => setIncludeStamp(event.target.checked)}
              disabled={
                saving ||
                downloading ||
                !marks.data ||
                (!marks.data.stamp && !includeStamp)
              }
            />
             
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeSignature}
              onChange={(event) => setIncludeSignature(event.target.checked)}
              disabled={
                saving ||
                downloading ||
                !marks.data ||
                (!marks.data.signature && !includeSignature)
              }
            />
             
          </label>
          <button
            type="button"
            disabled={
              saving ||
              downloading ||
              !marks.data ||
              (!dirty && !includeStamp && !includeSignature)
            }
            onClick={() => void applyMarks()}
          >
            {saving
              ? "Application…"
              : dirty
                ? "Appliquer au bulletin"
                : "Actualiser les visuels"}
          </button>
          {marks.isError ? (
            <p role="alert">
              Configuration indisponible.{" "}
              <button type="button" onClick={() => void marks.refetch()}>
                Réessayer
              </button>
            </p>
          ) : (
            marks.data && (
              <p>
                {!marks.data.stamp && !marks.data.signature
                  ? "Aucun visuel configuré. L’administrateur peut les ajouter dans Configuration → Identité & marque."
                  : "Appliquer utilise les visuels actuels de l’entreprise. Le téléchargement et le partage reprennent exactement les choix enregistrés."}
              </p>
            )
          )}
          {dirty && (
            <p role="status">
              Appliquez vos choix avant de télécharger ou partager. L’aperçu
              ci-dessous présente la version enregistrée.
            </p>
          )}
        </section>
      )}
      {error && (
        <p className="payroll-no-print payroll-error" role="alert">
          {error}
        </p>
      )}
      <p className="payroll-no-print payroll-preview-hint">
        Téléchargez le PDF pour imprimer ou conserver le bulletin. Le partage
        utilise ce même document.
      </p>
      <article
        className="payslip-paper"
        aria-label={`Bulletin de ${row.agentName}, ${period}`}
      >
        <header className="payslip-company">
          {logo && (
            <img
              src={logo}
              alt={`Logo de ${company?.shortName || "l’entreprise"}`}
            />
          )}
          <div>
            <strong>
              {company?.legalName || company?.shortName || "Organisation"}
            </strong>
            <p>
              {[company?.city, company?.country].filter(Boolean).join(" · ")}
            </p>
          </div>
        </header>
        <div className="payslip-heading">
          <div>
            <p className="payslip-eyebrow">RÉMUNÉRATION</p>
            <h2>Bulletin de paie</h2>
            <p className="payslip-period">{period}</p>
          </div>
          <span className={`payroll-status is-${row.status.toLowerCase()}`}>
            {labels[row.status]}
          </span>
        </div>
        <section className="payslip-identity">
          <div>
            <small>AGENT</small>
            <h3>{row.agentName}</h3>
            <p>Matricule : {row.matricule}</p>
          </div>
          <div>
            <small>RÉFÉRENCE</small>
            <p>{row.id}</p>
            <p>
              Révision {row.revision} · {row.currency}
            </p>
          </div>
        </section>
        <div className="payslip-table-wrap">
          <table className="payslip-table">
            <thead>
              <tr>
                <th scope="col">Rubriques</th>
                <th scope="col">Gains ({row.currency})</th>
                <th scope="col">Retenues ({row.currency})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Salaire de base</th>
                <td>{amount(row.base)}</td>
                <td className="payslip-empty-cell">—</td>
              </tr>
              <tr>
                <th scope="row">Primes et indemnités</th>
                <td>{amount(row.bonus)}</td>
                <td className="payslip-empty-cell">—</td>
              </tr>
              <tr className="payslip-subtotal">
                <th scope="row">Rémunération brute</th>
                <td>{amount(row.gross)}</td>
                <td className="payslip-empty-cell">—</td>
              </tr>
              <tr>
                <th scope="row">
                  Cotisations salariales{" "}
                  <small>{row.employeeRate / 100} %</small>
                </th>
                <td className="payslip-empty-cell">—</td>
                <td>{amount(row.employeeContribution)}</td>
              </tr>
              <tr>
                <th scope="row">
                  Impôt configuré <small>{row.taxRate / 100} %</small>
                </th>
                <td className="payslip-empty-cell">—</td>
                <td>{amount(row.tax)}</td>
              </tr>
              <tr>
                <th scope="row">Autres retenues</th>
                <td className="payslip-empty-cell">—</td>
                <td>{amount(row.deductions)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="payslip-net">
          <span>Net à payer</span>
          <strong>{money(row.net)}</strong>
        </div>
        <div className="payslip-employer">
          <p>
            Cotisations patronales ({row.employerRate / 100} %){" "}
            <strong>{money(row.employerContribution)}</strong>
          </p>
          <p>
            Coût total employeur <strong>{money(row.employerCost)}</strong>
          </p>
        </div>
        <section className="payslip-notes">
          <h4>Règles appliquées</h4>
          <p>{row.rulesNote}</p>
          {row.note && (
            <>
              <h4>Observations</h4>
              <p>{row.note}</p>
            </>
          )}
          {row.approvedAt && (
            <p>
              Validé le {new Date(row.approvedAt).toLocaleDateString("fr-FR")}
            </p>
          )}
          {row.paymentReference && (
            <p>Référence du paiement : {row.paymentReference}</p>
          )}
          {row.paidAt && (
            <p>Payé le {new Date(row.paidAt).toLocaleDateString("fr-FR")}</p>
          )}
          {settings?.documents.footerText && (
            <p>{settings.documents.footerText}</p>
          )}
          <p>
            {settings?.documents.confidentialLabel ||
              "Document personnel et confidentiel."}
          </p>
        </section>
        {(row.includeStamp || row.includeSignature) &&
          ["APPROVED", "PAID"].includes(row.status) && (
            <section
              className="payslip-validation"
              aria-label="Validation de l’employeur"
            >
              <strong>Pour l’employeur</strong>
              <div className="payslip-validation-images">
                {row.includeStamp && (
                  <figure>
                    <PrivateDocumentMark
                      path={`/payroll/${row.id}/marks/stamp?revision=${row.revision}`}
                      revision={row.revision}
                      label="Cachet de l’entreprise"
                    />
                    <figcaption>Cachet</figcaption>
                  </figure>
                )}
                {row.includeSignature && (
                  <figure>
                    <PrivateDocumentMark
                      path={`/payroll/${row.id}/marks/signature?revision=${row.revision}`}
                      revision={row.revision}
                      label="Signature de l’entreprise"
                    />
                    <figcaption>Signature</figcaption>
                  </figure>
                )}
              </div>
            </section>
          )}
        <footer className="payslip-footer">
          <strong>{company?.legalName}</strong>
          <p>
            {[company?.address, company?.city, company?.country]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p>
            {[company?.phone, company?.email, company?.website]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {company?.registrationNumber && (
            <p>Immatriculation : {company.registrationNumber}</p>
          )}
        </footer>
      </article>
    </div>
  );
}
