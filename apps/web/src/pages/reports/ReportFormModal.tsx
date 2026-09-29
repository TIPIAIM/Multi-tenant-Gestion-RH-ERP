import { useMemo, useState, type FormEvent } from "react";
import { FilePlus2, LoaderCircle, Save, X } from "lucide-react";
import type { OrganizationTreeDirection } from "../../features/organisation/organisation.types";
import type {
  GenerateManagementReportInput,
  ManagementReport,
  ManagementReportAccessScope,
  ManagementReportEditorial,
  ManagementReportScopeType,
  ManagementReportType,
  UpdateManagementReportInput,
} from "../../features/reports/report.types";
import "./report-page.css";

type Props = {
  mode: "CREATE" | "EDIT";
  role: string;
  accessScope: ManagementReportAccessScope;
  directions: OrganizationTreeDirection[];
  report?: ManagementReport | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (input: GenerateManagementReportInput | UpdateManagementReportInput) => Promise<void>;
};

const emptyEditorial: ManagementReportEditorial = {
  introduction: "",
  highlights: "",
  difficulties: "",
  actionsTaken: "",
  outlook: "",
  confidentialNote: "",
};

function normalizeEditorial(
  editorial?: ManagementReportEditorial,
): ManagementReportEditorial {
  return {
    introduction: editorial?.introduction ?? "",
    highlights: editorial?.highlights ?? "",
    difficulties: editorial?.difficulties ?? "",
    actionsTaken: editorial?.actionsTaken ?? "",
    outlook: editorial?.outlook ?? "",
    confidentialNote: editorial?.confidentialNote ?? "",
  };
}

function editorialFingerprint(
  editorial: ManagementReportEditorial,
): string {
  return JSON.stringify(normalizeEditorial(editorial));
}

export default function ReportFormModal({ mode, role, accessScope, directions, report, isSubmitting, errorMessage, onClose, onSubmit }: Props) {
  const now = new Date();
  const isGlobal = ["TENANT_ADMIN", "RH_MANAGER"].includes(role);
  const [reportType, setReportType] = useState<ManagementReportType>(report?.reportType ?? "MONTHLY");
  const [reportYear, setReportYear] = useState(String(report?.reportYear ?? now.getFullYear()));
  const [reportMonth, setReportMonth] = useState(String(report?.reportMonth ?? now.getMonth() + 1));
  const [reportSemester, setReportSemester] = useState<"1" | "2">(String(report?.reportSemester ?? (now.getMonth() < 6 ? 1 : 2)) as "1" | "2");
  const [scopeType, setScopeType] = useState<ManagementReportScopeType>(
    report?.scopeType ?? accessScope.defaultScopeType,
  );
  const [directionId, setDirectionId] = useState(
    report?.directionId ?? accessScope.directionId ?? "",
  );
  const [serviceId, setServiceId] = useState(
    report?.serviceId ?? accessScope.serviceId ?? "",
  );
  const [title, setTitle] = useState(report?.title ?? "");
  const [editorial, setEditorial] = useState<ManagementReportEditorial>(
    normalizeEditorial(report?.editorial ?? emptyEditorial),
  );
  const [clientError, setClientError] = useState<string | null>(null);

  const selectedDirection = useMemo(
    () => directions.find((item) => item.id === directionId),
    [directions, directionId],
  );

  const services =
    selectedDirection?.services.filter(
      (item) => item.status === "ACTIVE",
    ) ?? [];

  const isEdit = mode === "EDIT";

  const initialEditorialFingerprint = useMemo(
    () =>
      editorialFingerprint(
        report?.editorial ?? emptyEditorial,
      ),
    [report?.editorial],
  );

  const hasEditorialChanges =
    editorialFingerprint(editorial) !==
    initialEditorialFingerprint;

  const hasTitleChanges =
    (title.trim() || "") !==
    (report?.title?.trim() || "");

  const hasChanges =
    !isEdit ||
    hasEditorialChanges ||
    hasTitleChanges;

  const completedEditorialFields = useMemo(
    () =>
      Object.values(
        normalizeEditorial(editorial),
      ).filter((value) =>
        String(value).trim(),
      ).length,
    [editorial],
  );

  function updateEditorial(key: keyof ManagementReportEditorial, value: string): void {
    setEditorial((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setClientError(null);
    if (isEdit) {
      await onSubmit({ title: title.trim() || undefined, editorial });
      return;
    }
    if (scopeType !== "INSTITUTION" && !directionId) return setClientError("Veuillez sélectionner la Direction concernée.");
    if (scopeType === "SERVICE" && !serviceId) return setClientError("Veuillez sélectionner le Service concerné.");
    await onSubmit({
      reportType,
      reportYear: Number(reportYear),
      reportMonth: reportType === "MONTHLY" ? Number(reportMonth) : undefined,
      reportSemester: reportType === "SEMIANNUAL" ? Number(reportSemester) as 1 | 2 : undefined,
      scopeType,
      directionId: scopeType === "INSTITUTION" ? undefined : directionId,
      serviceId: scopeType === "SERVICE" ? serviceId : undefined,
      title: title.trim() || undefined,
      editorial,
    });
  }

  return (
    <div className="report-modal-layer">
      <button type="button" className="report-modal-backdrop" onClick={onClose} aria-label="Fermer" />
      <section className="report-modal" role="dialog" aria-modal="true">
        <header className="report-modal-header">
          <div><p>{isEdit ? "CONTRIBUTION DU RÉDACTEUR" : "NOUVEAU RAPPORT RH"}</p><h3>{isEdit ? "Compléter ou mettre à jour le rapport" : "Générer un rapport consolidé"}</h3></div>
          <button type="button" className="report-icon-button" onClick={onClose}><X size={20} /></button>
        </header>
        {(clientError || errorMessage) && <div className="report-error">{clientError ?? errorMessage}</div>}
        <form className="report-form" onSubmit={submit}>
          {!isEdit && (
            <section className="report-form-section">
              <h4>Période et périmètre</h4>
              <p>Les données sont consolidées et figées dans un snapshot historique au moment de la génération.</p>
              <div className="report-form-grid">
                <label className="report-field"><span>Type de rapport</span><select value={reportType} onChange={(e) => setReportType(e.target.value as ManagementReportType)}><option value="MONTHLY">Rapport mensuel</option><option value="SEMIANNUAL">Rapport semestriel</option><option value="ANNUAL">Rapport annuel</option></select></label>
                <label className="report-field"><span>Année</span><input type="number" min="2000" max="2100" value={reportYear} onChange={(e) => setReportYear(e.target.value)} /></label>
                {reportType === "MONTHLY" && <label className="report-field"><span>Mois</span><select value={reportMonth} onChange={(e) => setReportMonth(e.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(2026, index, 1))}</option>)}</select></label>}
                {reportType === "SEMIANNUAL" && <label className="report-field"><span>Semestre</span><select value={reportSemester} onChange={(e) => setReportSemester(e.target.value as "1" | "2")}><option value="1">Premier semestre</option><option value="2">Deuxième semestre</option></select></label>}
                <label className="report-field"><span>Périmètre</span><select value={scopeType} onChange={(e) => { const nextScope = e.target.value as ManagementReportScopeType; setScopeType(nextScope); setDirectionId(isGlobal ? "" : accessScope.directionId ?? ""); setServiceId(nextScope === "SERVICE" && role === "SERVICE_MANAGER" ? accessScope.serviceId ?? "" : ""); }} disabled={role === "SERVICE_MANAGER"}>
                  {isGlobal && <option value="INSTITUTION">Institution </option>}
                  {role !== "SERVICE_MANAGER" && <option value="DIRECTION">Une Direction</option>}
                  <option value="SERVICE">Un Service</option>
                </select></label>
                {scopeType !== "INSTITUTION" && <label className="report-field"><span>Direction</span><select value={directionId} onChange={(e) => { setDirectionId(e.target.value); setServiceId(""); }} disabled={!isGlobal}><option value="">Sélectionner</option>{directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                {scopeType === "SERVICE" && <label className="report-field"><span>Service</span><select value={serviceId} onChange={(e) => setServiceId(e.target.value)} disabled={!directionId || role === "SERVICE_MANAGER"}><option value="">Sélectionner</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                <label className="report-field report-field-full"><span>Intitulé personnalisé</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Laisser vide pour générer automatiquement l’intitulé" /></label>
              </div>
            </section>
          )}

          {isEdit && (
            <section className="report-form-section report-form-section-highlight">
              <div className="report-form-section-heading">
                <div>
                  <h4>Document en cours de mise à jour</h4>
                  <p>
                    Les informations déjà enregistrées sont préremplies. La
                    nouvelle sauvegarde actualise immédiatement le rapport.
                  </p>
                </div>

                <span className="report-editorial-progress">
                  {completedEditorialFields}/6 rubriques renseignées
                </span>
              </div>

              <label className="report-field">
                <span>Titre du rapport</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <div className="report-last-save">
                Dernière version enregistrée :{" "}
                <strong>
                  {report?.updatedAt
                    ? new Intl.DateTimeFormat("fr-FR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(report.updatedAt))
                    : "version initiale"}
                </strong>
              </div>
            </section>
          )}

          <section className="report-form-section">
            <div className="report-form-section-heading">
              <div>
                <h4>Contribution du rédacteur</h4>
                <p>
                  Les rubriques renseignées sont intégrées automatiquement au
                  rapport, au PDF et au document Word.
                </p>
              </div>

              {isEdit && (
                <span
                  className={`report-unsaved-badge ${
                    hasChanges ? "is-dirty" : "is-saved"
                  }`}
                >
                  {hasChanges
                    ? "Modifications non enregistrées"
                    : "À jour"}
                </span>
              )}
            </div>

            <label className="report-field report-editorial-field">
              <span>Introduction<small>{(editorial.introduction ?? "").length}/8000</small></span>
              <textarea rows={4} maxLength={8000} value={editorial.introduction ?? ""} onChange={(e) => updateEditorial("introduction", e.target.value)} placeholder="Contexte, objet du rapport et éléments introductifs..." />
            </label>

            <label className="report-field report-editorial-field">
              <span>Faits marquants et réalisations <small>{(editorial.highlights ?? "").length}/8000</small></span>
              <textarea rows={4} maxLength={8000} value={editorial.highlights ?? ""} onChange={(e) => updateEditorial("highlights", e.target.value)} placeholder="Réalisations significatives, résultats obtenus, faits majeurs..." />
            </label>

            <label className="report-field report-editorial-field">
              <span>Difficultés et contraintes <small>{(editorial.difficulties ?? "").length}/8000</small></span>
              <textarea rows={4} maxLength={8000} value={editorial.difficulties ?? ""} onChange={(e) => updateEditorial("difficulties", e.target.value)} placeholder="Contraintes rencontrées, blocages, risques ou dépendances..." />
            </label>

            <label className="report-field report-editorial-field">
              <span>Mesures prises <small>{(editorial.actionsTaken ?? "").length}/8000</small></span>
              <textarea rows={4} maxLength={8000} value={editorial.actionsTaken ?? ""} onChange={(e) => updateEditorial("actionsTaken", e.target.value)} placeholder="Actions correctives, arbitrages et mesures engagées..." />
            </label>

            <label className="report-field report-editorial-field">
              <span>Perspectives de la période suivante <small>{(editorial.outlook ?? "").length}/8000</small></span>
              <textarea rows={4} maxLength={8000} value={editorial.outlook ?? ""} onChange={(e) => updateEditorial("outlook", e.target.value)} placeholder="Priorités, objectifs, perspectives et points d'attention..." />
            </label>

            <label className="report-field report-editorial-field is-confidential">
              <span>Note confidentielle interne <small>{(editorial.confidentialNote ?? "").length}/8000</small></span>
              <textarea rows={3} maxLength={8000} value={editorial.confidentialNote ?? ""} onChange={(e) => updateEditorial("confidentialNote", e.target.value)} placeholder="Observation interne ou élément réservé aux destinataires autorisés..." />
              <em>
                Cette note est intégrée au rapport et à ses exports.
              </em>
            </label>
          </section>

          <footer className="report-modal-footer">
            <button type="button" className="report-cancel-button" onClick={onClose}>Annuler</button>
            <button type="submit" className="report-primary-button" disabled={isSubmitting || (isEdit && !hasChanges)}>{isSubmitting ? <LoaderCircle size={18} className="is-spinning" /> : isEdit ? <Save size={18} /> : <FilePlus2 size={18} />} {isEdit ? (hasChanges ? "Enregistrer les modifications" : "Aucune modification") : "Générer le rapport"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
