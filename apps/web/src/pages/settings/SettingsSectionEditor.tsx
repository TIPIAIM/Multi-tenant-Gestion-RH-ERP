import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type {
  SettingsSectionKey,
  TenantSettingsPayload,
} from "../../features/settings/settings.types";

const dayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function Field({ label, hint, children, full = false }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`settings-field${full ? " settings-field-full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return (
    <button className={`settings-switch-row${checked ? " is-on" : ""}`} type="button" onClick={() => onChange(!checked)}>
      <span className="settings-switch"><i /></span>
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    </button>
  );
}

function StringListEditor({ values, onChange, placeholder }: { values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  return (
    <div className="settings-list-editor">
      {values.map((value, index) => (
        <div key={`${value}-${index}`}>
          <input value={value} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
          <button type="button" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" className="settings-add-row" onClick={() => onChange([...values, placeholder])}><Plus size={16} /> Ajouter</button>
    </div>
  );
}

type Props = {
  section: SettingsSectionKey;
  settings: TenantSettingsPayload;
  readOnly: boolean;
  onChange: (settings: TenantSettingsPayload) => void;
};

export default function SettingsSectionEditor({ section, settings, readOnly, onChange }: Props) {
  function updateSection<K extends SettingsSectionKey>(key: K, value: TenantSettingsPayload[K]) {
    onChange({ ...settings, [key]: value });
  }

  const disabled = readOnly;

  if (section === "institution") {
    const value = settings.institution;
    const patch = (next: Partial<typeof value>) => updateSection("institution", { ...value, ...next });
    return <SectionShell title="Identité " description="Ces informations alimentent la plateforme, les rapports, les évaluations et les documents officiels.">
      <div className="settings-form-grid">
        <Field label="Dénomination officielle" full><input disabled={disabled} value={value.legalName} onChange={(e) => patch({ legalName: e.target.value })} /></Field>
        <Field label="Nom court"><input disabled={disabled} value={value.shortName} onChange={(e) => patch({ shortName: e.target.value })} /></Field>
        <Field label="Sigle"><input disabled={disabled} value={value.acronym} onChange={(e) => patch({ acronym: e.target.value })} /></Field>
        <Field label="Autorité de tutelle" full><input disabled={disabled} value={value.supervisoryAuthority ?? ""} onChange={(e) => patch({ supervisoryAuthority: e.target.value })} /></Field>
        <Field label="Pays"><input disabled={disabled} value={value.country} onChange={(e) => patch({ country: e.target.value })} /></Field>
        <Field label="Devise"><input disabled={disabled} value={value.motto} onChange={(e) => patch({ motto: e.target.value })} /></Field>
        <Field label="Adresse" full><textarea disabled={disabled} rows={3} value={value.address} onChange={(e) => patch({ address: e.target.value })} /></Field>
        <Field label="Ville"><input disabled={disabled} value={value.city} onChange={(e) => patch({ city: e.target.value })} /></Field>
        <Field label="Téléphone"><input disabled={disabled} value={value.phone} onChange={(e) => patch({ phone: e.target.value })} /></Field>
        <Field label="Email"><input disabled={disabled} type="email" value={value.email} onChange={(e) => patch({ email: e.target.value })} /></Field>
        <Field label="Site web"><input disabled={disabled} value={value.website ?? ""} onChange={(e) => patch({ website: e.target.value })} /></Field>
        <Field label="Directeur général"><input disabled={disabled} value={value.directorGeneralName ?? ""} onChange={(e) => patch({ directorGeneralName: e.target.value })} /></Field>
        <Field label="Responsable RH"><input disabled={disabled} value={value.hrManagerName ?? ""} onChange={(e) => patch({ hrManagerName: e.target.value })} /></Field>
      </div>
    </SectionShell>;
  }

  if (section === "branding") {
    const value = settings.branding;
    const patch = (next: Partial<typeof value>) => updateSection("branding", { ...value, ...next });
    return <SectionShell title="Identité visuelle et marque blanche" description="Personnalisez l’interface, la connexion et les documents du tenant.">
      <div className="settings-form-grid">
        <Field label="Nom affiché de l’application"><input disabled={disabled} value={value.appName} onChange={(e) => patch({ appName: e.target.value })} /></Field>
        <Field label="Style d’en-tête documentaire"><select disabled={disabled} value={value.documentHeaderStyle} onChange={(e) => patch({ documentHeaderStyle: e.target.value as typeof value.documentHeaderStyle })}><option value="CLASSIC">Classique</option><option value="MINIMAL">Minimal</option><option value="PREMIUM">Premium</option></select></Field>
        {(["primaryColor", "secondaryColor", "accentColor", "dangerColor"] as const).map((key) => <Field key={key} label={{ primaryColor: "Couleur principale", secondaryColor: "Couleur secondaire", accentColor: "Couleur d’accent", dangerColor: "Couleur d’alerte" }[key]}><div className="settings-color-input"><input disabled={disabled} type="color" value={value[key]} onChange={(e) => patch({ [key]: e.target.value })} /><input disabled={disabled} value={value[key]} onChange={(e) => patch({ [key]: e.target.value })} /></div></Field>)}
        <Field label="Logo principal" full><input disabled={disabled} value={value.logoUrl ?? ""} onChange={(e) => patch({ logoUrl: e.target.value })} placeholder="/brand/logo.png ou URL" /></Field>
        <Field label="Logo d’impression" full><input disabled={disabled} value={value.printLogoUrl ?? ""} onChange={(e) => patch({ printLogoUrl: e.target.value })} /></Field>
        <Field label="Drapeau"><input disabled={disabled} value={value.flagUrl ?? ""} onChange={(e) => patch({ flagUrl: e.target.value })} /></Field>
        <Field label="Identité visuelle pays"><input disabled={disabled} value={value.countryWordmarkUrl ?? ""} onChange={(e) => patch({ countryWordmarkUrl: e.target.value })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch checked={value.whiteLabelEnabled} onChange={(whiteLabelEnabled) => patch({ whiteLabelEnabled })} label="Mode marque blanche" description="Masque l’identité éditeur lorsque le plan commercial le permet." />
        <Switch checked={value.showVendorSignature} onChange={(showVendorSignature) => patch({ showVendorSignature })} label="Signature éditeur" description="Affiche la mention de la plateforme dans les zones prévues." />
      </div>
    </SectionShell>;
  }

  if (section === "organization") {
    const value = settings.organization;
    const patch = (next: Partial<typeof value>) => updateSection("organization", { ...value, ...next });
    return <SectionShell title="Gouvernance organisationnelle" description="Définissez les niveaux d’héritage, les responsabilités et les exceptions locales.">
      <div className="settings-switch-grid">
        <Switch checked={value.multiSiteEnabled} onChange={(multiSiteEnabled) => patch({ multiSiteEnabled })} label="Organisation multi-sites" />
        <Switch checked={value.allowDirectionOverrides} onChange={(allowDirectionOverrides) => patch({ allowDirectionOverrides })} label="Exceptions par Direction" />
        <Switch checked={value.allowServiceOverrides} onChange={(allowServiceOverrides) => patch({ allowServiceOverrides })} label="Exceptions par Service" />
        <Switch checked={value.requireManagerForDirection} onChange={(requireManagerForDirection) => patch({ requireManagerForDirection })} label="Responsable obligatoire par Direction" />
        <Switch checked={value.requireManagerForService} onChange={(requireManagerForService) => patch({ requireManagerForService })} label="Responsable obligatoire par Service" />
        <Switch checked={value.allowInterimManagers} onChange={(allowInterimManagers) => patch({ allowInterimManagers })} label="Intérim et délégation" />
      </div>
    </SectionShell>;
  }

  if (section === "attendance") {
    const value = settings.attendance;
    const patch = (next: Partial<typeof value>) => updateSection("attendance", { ...value, ...next });
    return <SectionShell title="Règles de pointage" description="Ces paramètres alimentent le pointage, les indicateurs d’assiduité, les évaluations et les rapports.">
      <div className="settings-form-grid">
        <Field label="Fuseau horaire"><input disabled={disabled} value={value.timezone} onChange={(e) => patch({ timezone: e.target.value })} /></Field>
        <Field label="Heure normale d’arrivée"><input disabled={disabled} type="time" value={value.checkInTime} onChange={(e) => patch({ checkInTime: e.target.value })} /></Field>
        <Field label="Heure normale de départ"><input disabled={disabled} type="time" value={value.checkOutTime} onChange={(e) => patch({ checkOutTime: e.target.value })} /></Field>
        <Field label="Tolérance de retard (minutes)"><input disabled={disabled} type="number" min="0" value={value.lateToleranceMinutes} onChange={(e) => patch({ lateToleranceMinutes: Number(e.target.value) })} /></Field>
        <Field label="Tolérance départ anticipé"><input disabled={disabled} type="number" min="0" value={value.earlyDepartureToleranceMinutes} onChange={(e) => patch({ earlyDepartureToleranceMinutes: Number(e.target.value) })} /></Field>
        <Field label="Durée journalière minimale"><input disabled={disabled} type="number" min="60" value={value.minimumDailyMinutes} onChange={(e) => patch({ minimumDailyMinutes: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-weekdays">{dayLabels.map((label, day) => <button disabled={disabled} className={value.workingDays.includes(day) ? "is-active" : ""} type="button" key={day} onClick={() => patch({ workingDays: value.workingDays.includes(day) ? value.workingDays.filter((item) => item !== day) : [...value.workingDays, day].sort() })}>{label.slice(0, 3)}</button>)}</div>
      <div className="settings-switch-grid">
        <Switch checked={value.overtimeEnabled} onChange={(overtimeEnabled) => patch({ overtimeEnabled })} label="Heures supplémentaires" />
        <Switch checked={value.allowManualAttendance} onChange={(allowManualAttendance) => patch({ allowManualAttendance })} label="Pointage manuel RH/Admin" />
        <Switch checked={value.allowAgentCorrectionRequest} onChange={(allowAgentCorrectionRequest) => patch({ allowAgentCorrectionRequest })} label="Demande de correction par l’Agent" />
        <Switch checked={value.requireCorrectionReason} onChange={(requireCorrectionReason) => patch({ requireCorrectionReason })} label="Motif obligatoire pour toute correction" />
      </div>
    </SectionShell>;
  }

  if (section === "leave") {
    const value = settings.leave;
    const patch = (next: Partial<typeof value>) => updateSection("leave", { ...value, ...next });
    return <SectionShell title="Politique de congés" description="Configurez les droits, validations, justificatifs et catégories disponibles.">
      <div className="settings-form-grid">
        <Field label="Droit annuel par défaut"><input disabled={disabled} type="number" min="0" value={value.annualEntitlementDays} onChange={(e) => patch({ annualEntitlementDays: Number(e.target.value) })} /></Field>
        <Field label="Plafond de report"><input disabled={disabled} type="number" min="0" value={value.carryOverLimitDays} onChange={(e) => patch({ carryOverLimitDays: Number(e.target.value) })} /></Field>
        <Field label="Préavis minimal (jours)"><input disabled={disabled} type="number" min="0" value={value.minimumNoticeDays} onChange={(e) => patch({ minimumNoticeDays: Number(e.target.value) })} /></Field>
        <Field label="Justificatif à partir de"><input disabled={disabled} type="number" min="0" value={value.supportingDocumentAfterDays} onChange={(e) => patch({ supportingDocumentAfterDays: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch checked={value.carryOverEnabled} onChange={(carryOverEnabled) => patch({ carryOverEnabled })} label="Report du reliquat" />
        <Switch checked={value.allowNegativeBalance} onChange={(allowNegativeBalance) => patch({ allowNegativeBalance })} label="Solde négatif autorisé" />
        <Switch checked={value.managerApprovalRequired} onChange={(managerApprovalRequired) => patch({ managerApprovalRequired })} label="Validation hiérarchique" />
        <Switch checked={value.hrApprovalRequired} onChange={(hrApprovalRequired) => patch({ hrApprovalRequired })} label="Décision RH finale" />
        <Switch checked={value.requireReplacement} onChange={(requireReplacement) => patch({ requireReplacement })} label="Remplaçant obligatoire" />
      </div>
      <div className="settings-table-editor">
        <div className="settings-table-header"><strong>Types de congé</strong><span>{value.types.filter((item) => item.enabled).length} actif(s)</span></div>
        {value.types.map((item, index) => <div className="settings-leave-type-row" key={item.code}>
          <input disabled={disabled} value={item.label} onChange={(e) => patch({ types: value.types.map((current, currentIndex) => currentIndex === index ? { ...current, label: e.target.value } : current) })} />
          <input disabled={disabled} type="number" min="0" value={item.annualEntitlementDays} onChange={(e) => patch({ types: value.types.map((current, currentIndex) => currentIndex === index ? { ...current, annualEntitlementDays: Number(e.target.value) } : current) })} />
          <Switch checked={item.enabled} onChange={(enabled) => patch({ types: value.types.map((current, currentIndex) => currentIndex === index ? { ...current, enabled } : current) })} label="Actif" />
        </div>)}
      </div>
    </SectionShell>;
  }

  if (section === "tasks") {
    const value = settings.tasks;
    const patch = (next: Partial<typeof value>) => updateSection("tasks", { ...value, ...next });
    return <SectionShell title="Règles des tâches" description="Définissez les échéances, rappels, escalades et preuves de clôture.">
      <div className="settings-form-grid">
        <Field label="Délai par défaut (jours)"><input disabled={disabled} type="number" value={value.defaultDueDays} onChange={(e) => patch({ defaultDueDays: Number(e.target.value) })} /></Field>
        <Field label="Rappel avant échéance (heures)"><input disabled={disabled} type="number" value={value.reminderHoursBeforeDue} onChange={(e) => patch({ reminderHoursBeforeDue: Number(e.target.value) })} /></Field>
        <Field label="Escalade après retard (heures)"><input disabled={disabled} type="number" value={value.escalationHoursAfterDue} onChange={(e) => patch({ escalationHoursAfterDue: Number(e.target.value) })} /></Field>
        <Field label="Archivage après (jours)"><input disabled={disabled} type="number" value={value.archiveAfterDays} onChange={(e) => patch({ archiveAfterDays: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch checked={value.requireCompletionEvidence} onChange={(requireCompletionEvidence) => patch({ requireCompletionEvidence })} label="Preuve de réalisation obligatoire" />
        <Switch checked={value.requireManagerClosure} onChange={(requireManagerClosure) => patch({ requireManagerClosure })} label="Clôture validée par le responsable" />
        <Switch checked={value.allowAgentReassignment} onChange={(allowAgentReassignment) => patch({ allowAgentReassignment })} label="Réaffectation par l’Agent" />
      </div>
    </SectionShell>;
  }

  if (section === "roadmaps") {
    const value = settings.roadmaps;
    const patch = (next: Partial<typeof value>) => updateSection("roadmaps", { ...value, ...next });
    return <SectionShell title="Feuilles de route" description="Cadrez la planification annuelle individuelle et ses contrôles.">
      <div className="settings-form-grid">
        <Field label="Mois de démarrage"><input disabled={disabled} type="number" min="1" max="12" value={value.planningYearStartMonth} onChange={(e) => patch({ planningYearStartMonth: Number(e.target.value) })} /></Field>
        <Field label="Nombre maximal d’objectifs"><input disabled={disabled} type="number" min="1" value={value.maxObjectives} onChange={(e) => patch({ maxObjectives: Number(e.target.value) })} /></Field>
        <Field label="Poids total attendu"><input disabled={disabled} type="number" min="1" max="100" value={value.totalWeightRequired} onChange={(e) => patch({ totalWeightRequired: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch checked={value.requireSmartObjectives} onChange={(requireSmartObjectives) => patch({ requireSmartObjectives })} label="Objectifs SMART obligatoires" />
        <Switch checked={value.requireKpiEvidence} onChange={(requireKpiEvidence) => patch({ requireKpiEvidence })} label="Preuves KPI obligatoires" />
        <Switch checked={value.quarterlyReviewEnabled} onChange={(quarterlyReviewEnabled) => patch({ quarterlyReviewEnabled })} label="Revues trimestrielles" />
        <Switch checked={value.managerApprovalRequired} onChange={(managerApprovalRequired) => patch({ managerApprovalRequired })} label="Validation hiérarchique" />
        <Switch checked={value.hrApprovalRequired} onChange={(hrApprovalRequired) => patch({ hrApprovalRequired })} label="Validation RH" />
      </div>
    </SectionShell>;
  }

  if (section === "evaluations") {
    const value = settings.evaluations;
    const patch = (next: Partial<typeof value>) => updateSection("evaluations", { ...value, ...next });
    const totalWeight = value.criteria.filter((item) => item.enabled).reduce((sum, item) => sum + item.weight, 0);
    return <SectionShell title="Moteur d’évaluation" description="Configurez le cycle, les seuils, la visibilité et la grille de notation.">
      <div className="settings-form-grid">
        <Field label="Périodicité"><select disabled={disabled} value={value.frequency} onChange={(e) => patch({ frequency: e.target.value as typeof value.frequency })}><option value="ANNUAL">Annuelle</option><option value="SEMIANNUAL">Semestrielle</option><option value="QUARTERLY">Trimestrielle</option></select></Field>
        <Field label="Seuil Excellent"><input disabled={disabled} type="number" value={value.excellentThreshold} onChange={(e) => patch({ excellentThreshold: Number(e.target.value) })} /></Field>
        <Field label="Seuil Très bon"><input disabled={disabled} type="number" value={value.veryGoodThreshold} onChange={(e) => patch({ veryGoodThreshold: Number(e.target.value) })} /></Field>
        <Field label="Seuil Satisfaisant"><input disabled={disabled} type="number" value={value.satisfactoryThreshold} onChange={(e) => patch({ satisfactoryThreshold: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch checked={value.selfReviewEnabled} onChange={(selfReviewEnabled) => patch({ selfReviewEnabled })} label="Auto-évaluation" />
        <Switch checked={value.managerReviewEnabled} onChange={(managerReviewEnabled) => patch({ managerReviewEnabled })} label="Appréciation hiérarchique" />
        <Switch checked={value.hrValidationRequired} onChange={(hrValidationRequired) => patch({ hrValidationRequired })} label="Validation RH obligatoire" />
        <Switch checked={value.agentCanViewFinalResult} onChange={(agentCanViewFinalResult) => patch({ agentCanViewFinalResult })} label="Résultat final visible par l’Agent" />
      </div>
      <div className={`settings-weight-summary${totalWeight === 100 ? " is-valid" : " is-invalid"}`}><strong>Pondération active : {totalWeight} %</strong><span>{totalWeight === 100 ? "La grille est publiable." : "La grille doit totaliser exactement 100 %."}</span></div>
      <div className="settings-criteria-editor">
        {value.criteria.map((criterion, index) => <article key={criterion.key}>
          <div><input disabled={disabled} value={criterion.label} onChange={(e) => patch({ criteria: value.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item) })} /><textarea disabled={disabled} rows={2} value={criterion.description} onChange={(e) => patch({ criteria: value.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, description: e.target.value } : item) })} /></div>
          <div><input disabled={disabled} type="number" min="0" max="100" value={criterion.weight} onChange={(e) => patch({ criteria: value.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, weight: Number(e.target.value) } : item) })} /><Switch checked={criterion.enabled} onChange={(enabled) => patch({ criteria: value.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, enabled } : item) })} label="Actif" /></div>
        </article>)}
      </div>
      <Field label="Signataires" full><StringListEditor values={value.signatories} onChange={(signatories) => patch({ signatories })} placeholder="Nouveau signataire" /></Field>
    </SectionShell>;
  }

  if (section === "reports") {
    const value = settings.reports;
    const patch = (next: Partial<typeof value>) => updateSection("reports", { ...value, ...next });
    return <SectionShell title="Rapports " description="Pilotez la fréquence, le contenu, la validation et les destinataires.">
      <div className="settings-form-grid">
        <Field label="Jour de clôture mensuelle"><input disabled={disabled} type="number" min="1" max="28" value={value.monthlyClosingDay} onChange={(e) => patch({ monthlyClosingDay: Number(e.target.value) })} /></Field>
        <Field label="Fin du premier semestre"><input disabled={disabled} type="number" min="1" max="12" value={value.firstSemesterEndMonth} onChange={(e) => patch({ firstSemesterEndMonth: Number(e.target.value) })} /></Field>
        <Field label="Mois de clôture annuelle"><input disabled={disabled} type="number" min="1" max="12" value={value.annualClosingMonth} onChange={(e) => patch({ annualClosingMonth: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch checked={value.monthlyEnabled} onChange={(monthlyEnabled) => patch({ monthlyEnabled })} label="Rapport mensuel" />
        <Switch checked={value.semiannualEnabled} onChange={(semiannualEnabled) => patch({ semiannualEnabled })} label="Rapport semestriel" />
        <Switch checked={value.annualEnabled} onChange={(annualEnabled) => patch({ annualEnabled })} label="Rapport annuel" />
        <Switch checked={value.includeUnitComparison} onChange={(includeUnitComparison) => patch({ includeUnitComparison })} label="Comparaison des unités" />
        <Switch checked={value.includeExecutiveSummary} onChange={(includeExecutiveSummary) => patch({ includeExecutiveSummary })} label="Synthèse exécutive" />
        <Switch checked={value.includeMethodologyWarnings} onChange={(includeMethodologyWarnings) => patch({ includeMethodologyWarnings })} label="Réserves méthodologiques" />
        <Switch checked={value.requireDirectionValidation} onChange={(requireDirectionValidation) => patch({ requireDirectionValidation })} label="Validation Direction" />
        <Switch checked={value.requireHrValidation} onChange={(requireHrValidation) => patch({ requireHrValidation })} label="Validation RH" />
      </div>
      <div className="settings-form-grid">
        <Field label="Destinataires par défaut" full><StringListEditor values={value.defaultRecipients} onChange={(defaultRecipients) => patch({ defaultRecipients })} placeholder="Nouveau destinataire" /></Field>
        <Field label="Signataires" full><StringListEditor values={value.signatories} onChange={(signatories) => patch({ signatories })} placeholder="Nouveau signataire" /></Field>
      </div>
    </SectionShell>;
  }

  if (section === "documents") {
    const value = settings.documents;
    const patch = (next: Partial<typeof value>) => updateSection("documents", { ...value, ...next });
    return <SectionShell title="Documents et conservation" description="Définissez les limites, formats, mentions et règles de conservation.">
      <div className="settings-form-grid">
        <Field label="Taille maximale (Mo)"><input disabled={disabled} type="number" value={value.maximumFileSizeMb} onChange={(e) => patch({ maximumFileSizeMb: Number(e.target.value) })} /></Field>
        <Field label="Durée de conservation (années)"><input disabled={disabled} type="number" value={value.retentionYears} onChange={(e) => patch({ retentionYears: Number(e.target.value) })} /></Field>
        <Field label="Mention confidentielle" full><textarea disabled={disabled} rows={3} value={value.confidentialLabel} onChange={(e) => patch({ confidentialLabel: e.target.value })} /></Field>
        <Field label="Texte de pied de page" full><textarea disabled={disabled} rows={3} value={value.footerText} onChange={(e) => patch({ footerText: e.target.value })} /></Field>
        <Field label="Types MIME autorisés" full><StringListEditor values={value.allowedMimeTypes} onChange={(allowedMimeTypes) => patch({ allowedMimeTypes })} placeholder="application/pdf" /></Field>
      </div>
      <Switch checked={value.watermarkEnabled} onChange={(watermarkEnabled) => patch({ watermarkEnabled })} label="Filigrane sur les documents sensibles" />
    </SectionShell>;
  }

  if (section === "notifications") {
    const value = settings.notifications;
    const patch = (next: Partial<typeof value>) => updateSection("notifications", { ...value, ...next });
    return <SectionShell title="Notifications et automatisations" description="Activez les canaux et les rappels opérationnels du tenant.">
      <div className="settings-switch-grid">
        <Switch checked={value.enabled} onChange={(enabled) => patch({ enabled })} label="Moteur de notifications" />
        <Switch checked={value.inAppEnabled} onChange={(inAppEnabled) => patch({ inAppEnabled })} label="Notifications internes" />
        <Switch checked={value.emailEnabled} onChange={(emailEnabled) => patch({ emailEnabled })} label="Email" />
        <Switch checked={value.smsEnabled} onChange={(smsEnabled) => patch({ smsEnabled })} label="SMS" />
        <Switch checked={value.whatsappEnabled} onChange={(whatsappEnabled) => patch({ whatsappEnabled })} label="WhatsApp Business" />
        <Switch checked={value.taskReminderEnabled} onChange={(taskReminderEnabled) => patch({ taskReminderEnabled })} label="Rappels de tâches" />
        <Switch checked={value.overdueEscalationEnabled} onChange={(overdueEscalationEnabled) => patch({ overdueEscalationEnabled })} label="Escalade des retards" />
        <Switch checked={value.leavePendingReminderEnabled} onChange={(leavePendingReminderEnabled) => patch({ leavePendingReminderEnabled })} label="Congés en attente" />
        <Switch checked={value.attendanceMissingReminderEnabled} onChange={(attendanceMissingReminderEnabled) => patch({ attendanceMissingReminderEnabled })} label="Pointage manquant" />
      </div>
      <div className="settings-form-grid"><Field label="Rappel préparation rapport (jours)"><input disabled={disabled} type="number" value={value.reportPreparationReminderDays} onChange={(e) => patch({ reportPreparationReminderDays: Number(e.target.value) })} /></Field></div>
    </SectionShell>;
  }

  if (section === "security") {
    const value = settings.security;
    const patch = (next: Partial<typeof value>) => updateSection("security", { ...value, ...next });
    return <SectionShell title="Sécurité du tenant" description="Ces paramètres sont sensibles et doivent être publiés par l’administrateur du tenant.">
      <div className="settings-form-grid">
        <Field label="Durée de session (minutes)"><input disabled={disabled} type="number" value={value.sessionDurationMinutes} onChange={(e) => patch({ sessionDurationMinutes: Number(e.target.value) })} /></Field>
        <Field label="Tentatives maximales"><input disabled={disabled} type="number" value={value.maxLoginAttempts} onChange={(e) => patch({ maxLoginAttempts: Number(e.target.value) })} /></Field>
        <Field label="Durée de blocage (minutes)"><input disabled={disabled} type="number" value={value.lockoutMinutes} onChange={(e) => patch({ lockoutMinutes: Number(e.target.value) })} /></Field>
        <Field label="Longueur minimale"><input disabled={disabled} type="number" value={value.minimumPasswordLength} onChange={(e) => patch({ minimumPasswordLength: Number(e.target.value) })} /></Field>
        <Field label="Expiration mot de passe (jours)"><input disabled={disabled} type="number" value={value.passwordExpiryDays} onChange={(e) => patch({ passwordExpiryDays: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch checked={value.requireUppercase} onChange={(requireUppercase) => patch({ requireUppercase })} label="Majuscule obligatoire" />
        <Switch checked={value.requireLowercase} onChange={(requireLowercase) => patch({ requireLowercase })} label="Minuscule obligatoire" />
        <Switch checked={value.requireNumber} onChange={(requireNumber) => patch({ requireNumber })} label="Chiffre obligatoire" />
        <Switch checked={value.requireSymbol} onChange={(requireSymbol) => patch({ requireSymbol })} label="Symbole obligatoire" />
        <Switch checked={value.requireRecentPasswordForSensitiveActions} onChange={(requireRecentPasswordForSensitiveActions) => patch({ requireRecentPasswordForSensitiveActions })} label="Mot de passe récent pour actions sensibles" />
        <Switch checked={value.revokeSessionsOnPasswordChange} onChange={(revokeSessionsOnPasswordChange) => patch({ revokeSessionsOnPasswordChange })} label="Révoquer les sessions après changement" />
      </div>
    </SectionShell>;
  }

  if (section === "numbering") {
    const value = settings.numbering;
    const patch = (next: Partial<typeof value>) => updateSection("numbering", { ...value, ...next });
    return <SectionShell title="Numérotation documentaire" description="Utilisez {TENANT}, {YEAR} et {SEQ:n} pour générer des références homogènes.">
      <div className="settings-form-grid">
        <Field label="Évaluations" full><input disabled={disabled} value={value.evaluationPattern} onChange={(e) => patch({ evaluationPattern: e.target.value })} /></Field>
        <Field label="Rapports mensuels" full><input disabled={disabled} value={value.monthlyReportPattern} onChange={(e) => patch({ monthlyReportPattern: e.target.value })} /></Field>
        <Field label="Rapports semestriels" full><input disabled={disabled} value={value.semiannualReportPattern} onChange={(e) => patch({ semiannualReportPattern: e.target.value })} /></Field>
        <Field label="Rapports annuels" full><input disabled={disabled} value={value.annualReportPattern} onChange={(e) => patch({ annualReportPattern: e.target.value })} /></Field>
        <Field label="Matricules Agents" full><input disabled={disabled} value={value.agentPattern} onChange={(e) => patch({ agentPattern: e.target.value })} /></Field>
      </div>
      <Switch checked={value.resetSequenceEachYear} onChange={(resetSequenceEachYear) => patch({ resetSequenceEachYear })} label="Réinitialiser les séquences chaque année" />
    </SectionShell>;
  }

  if (section === "featureFlags") {
    const value = settings.featureFlags;
    const patch = (next: Partial<typeof value>) => updateSection("featureFlags", { ...value, ...next });
    const labels: Record<keyof typeof value, string> = { agents: "Agents", attendance: "Pointage", leave: "Congés", tasks: "Tâches", roadmaps: "Feuilles de route", evaluations: "Évaluations", reports: "Rapports", documents: "Documents RH", payroll: "Paie", recruitment: "Recrutement", training: "Formation" };
    return <SectionShell title="Fonctionnalités du tenant" description="Activez les modules inclus dans l’offre commerciale. Une désactivation ne supprime aucune donnée.">
      <div className="settings-feature-grid">{(Object.keys(value) as Array<keyof typeof value>).map((key) => <Switch key={key} checked={value[key]} onChange={(enabled) => patch({ [key]: enabled })} label={labels[key]} description={value[key] ? "Module disponible" : "Module masqué"} />)}</div>
    </SectionShell>;
  }

  return null;
}

function SectionShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="settings-editor-section"><header><div><p>CONFIGURATION DU PROPRIETAIRE "LE TENANT"</p><h3>{title}</h3><span>{description}</span></div></header><div className="settings-editor-content">{children}</div></section>;
}
