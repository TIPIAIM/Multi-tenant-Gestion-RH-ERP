import NumberingPatternEditor from "./NumberingPatternEditor";
import {featureLabels,documentFormats} from "../../features/settings/settings.presentation";
import BrandingSettingsEditor from "./BrandingSettingsEditor";
import { Plus, Trash2 } from "lucide-react";
import {isValidElement,type ReactNode} from "react";
import type {
  SettingsSectionKey,
  TenantSettingsPayload,
  SettingsRecordResponse,
} from "../../features/settings/settings.types";

const dayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function Field({ label, hint, children, full = false }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  if(!isValidElement(children)||typeof children.type!=="string"||!["input","textarea","select"].includes(children.type))return <div className={`settings-field${full?" settings-field-full":""}`} role="group" aria-label={label}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</div>;
  return (
    <label className={`settings-field${full ? " settings-field-full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Switch({ checked, onChange, label, description, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <button className={`settings-switch-row${checked ? " is-on" : ""}`} type="button" role="switch" title={description??label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="settings-switch"><i /></span>
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    </button>
  );
}

function StringListEditor({ values, onChange, placeholder, disabled=false }: { values: string[]; onChange: (values: string[]) => void; placeholder: string; disabled?: boolean }) {
  return (
    <div className="settings-list-editor">
      {values.map((value, index) => (
        <div key={index}>
          <input disabled={disabled} aria-label={`${placeholder} ${index+1}`} value={value} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
          <button type="button" disabled={disabled} title="Retirer cet élément" aria-label="Retirer cet élément" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" className="settings-add-row" disabled={disabled} onClick={() => onChange([...values, placeholder])}><Plus size={16} /> Ajouter</button>
    </div>
  );
}

type Props = {
  section: SettingsSectionKey;
  settings: TenantSettingsPayload;
  readOnly: boolean;
  onChange: (settings: TenantSettingsPayload) => void;
  expectedRevision: number;
  onBrandingSaved: (record: SettingsRecordResponse) => void;
  onAppearanceBusy: (busy: boolean) => void;
};

export default function SettingsSectionEditor({ section, settings, readOnly, onChange, expectedRevision, onBrandingSaved, onAppearanceBusy }: Props) {
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
    return <BrandingSettingsEditor branding={settings.branding} organizationName={settings.institution.shortName}
      readOnly={readOnly} expectedRevision={expectedRevision}
      onChange={branding => updateSection("branding", branding)} onSaved={onBrandingSaved} onBusyChange={onAppearanceBusy} />;
  }

  if (section === "organization") {
    const value = settings.organization;
    const patch = (next: Partial<typeof value>) => updateSection("organization", { ...value, ...next });
    return <SectionShell title="Gouvernance organisationnelle" description="Définissez les niveaux d’héritage, les responsabilités et les exceptions locales.">
      <div className="settings-switch-grid">
        <Switch disabled={disabled} checked={value.multiSiteEnabled} onChange={(multiSiteEnabled) => patch({ multiSiteEnabled })} label="Organisation multi-sites" />
        <Switch disabled={disabled} checked={value.allowDirectionOverrides} onChange={(allowDirectionOverrides) => patch({ allowDirectionOverrides })} label="Exceptions par Direction" />
        <Switch disabled={disabled} checked={value.allowServiceOverrides} onChange={(allowServiceOverrides) => patch({ allowServiceOverrides })} label="Exceptions par Service" />
        <Switch disabled={disabled} checked={value.requireManagerForDirection} onChange={(requireManagerForDirection) => patch({ requireManagerForDirection })} label="Responsable obligatoire par Direction" />
        <Switch disabled={disabled} checked={value.requireManagerForService} onChange={(requireManagerForService) => patch({ requireManagerForService })} label="Responsable obligatoire par Service" />
        <Switch disabled={disabled} checked={value.allowInterimManagers} onChange={(allowInterimManagers) => patch({ allowInterimManagers })} label="Intérim et délégation" />
      </div>
    </SectionShell>;
  }

  if (section === "attendance") {
    const value = settings.attendance;
    const patch = (next: Partial<typeof value>) => updateSection("attendance", { ...value, ...next });
    return <SectionShell title="Règles de pointage" description="Ces paramètres alimentent le pointage, les indicateurs d’assiduité, les évaluations et les rapports.">
      <div className="settings-form-grid">
        <Field label="Heure locale"><select disabled={disabled} value={value.timezone} onChange={e=>patch({timezone:e.target.value})}><option value="Africa/Conakry">Conakry</option><option value="Africa/Dakar">Dakar</option><option value="Europe/Paris">Paris</option><option value="UTC">Heure universelle</option>{!["Africa/Conakry","Africa/Dakar","Europe/Paris","UTC"].includes(value.timezone)&&<option value={value.timezone}>Fuseau actuellement enregistré</option>}</select></Field>
        <Field label="Heure normale d’arrivée"><input disabled={disabled} type="time" value={value.checkInTime} onChange={(e) => patch({ checkInTime: e.target.value })} /></Field>
        <Field label="Heure normale de départ"><input disabled={disabled} type="time" value={value.checkOutTime} onChange={(e) => patch({ checkOutTime: e.target.value })} /></Field>
        <Field label="Tolérance de retard (minutes)"><input disabled={disabled} type="number" min="0" value={value.lateToleranceMinutes} onChange={(e) => patch({ lateToleranceMinutes: Number(e.target.value) })} /></Field>
        <Field label="Tolérance départ anticipé"><input disabled={disabled} type="number" min="0" value={value.earlyDepartureToleranceMinutes} onChange={(e) => patch({ earlyDepartureToleranceMinutes: Number(e.target.value) })} /></Field>
        <Field label="Durée journalière minimale"><input disabled={disabled} type="number" min="60" value={value.minimumDailyMinutes} onChange={(e) => patch({ minimumDailyMinutes: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-weekdays">{dayLabels.map((label, day) => <button disabled={disabled} className={value.workingDays.includes(day) ? "is-active" : ""} type="button" key={day} onClick={() => patch({ workingDays: value.workingDays.includes(day) ? value.workingDays.filter((item) => item !== day) : [...value.workingDays, day].sort() })}>{label.slice(0, 3)}</button>)}</div>
      <div className="settings-switch-grid">
        <Switch disabled={disabled} checked={value.overtimeEnabled} onChange={(overtimeEnabled) => patch({ overtimeEnabled })} label="Heures supplémentaires" />
        <Switch disabled={disabled} checked={value.allowManualAttendance} onChange={(allowManualAttendance) => patch({ allowManualAttendance })} label="Pointage manuel RH/Admin" />
        <Switch disabled={disabled} checked={value.allowAgentCorrectionRequest} onChange={(allowAgentCorrectionRequest) => patch({ allowAgentCorrectionRequest })} label="Demande de correction par l’Agent" />
        <Switch disabled={disabled} checked={value.requireCorrectionReason} onChange={(requireCorrectionReason) => patch({ requireCorrectionReason })} label="Motif obligatoire pour toute correction" />
      </div>
    </SectionShell>;
  }

  if (section === "leave") {
    const value = settings.leave;
    const patch = (next: Partial<typeof value>) => updateSection("leave", { ...value, ...next });
    return <SectionShell title="Politique de congés" description="Retrouvez les règles de congés et les paramètres complémentaires."><div className="settings-policy-note"><strong>Congé annuel : règles en vigueur</strong><p>2,5 jours après chaque mois complet de service, soit 30 jours sur douze mois. Le reliquat reste disponible sans expiration ; le solde ne peut pas devenir négatif. La décision finale appartient à l’administrateur après les validations prévues.</p></div>
      <div className="settings-form-grid">
        <Field label="Préavis minimal (jours)"><input disabled={disabled} type="number" min="0" value={value.minimumNoticeDays} onChange={(e) => patch({ minimumNoticeDays: Number(e.target.value) })} /></Field>
        <Field label="Justificatif à partir de"><input disabled={disabled} type="number" min="0" value={value.supportingDocumentAfterDays} onChange={(e) => patch({ supportingDocumentAfterDays: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch disabled={disabled} checked={value.managerApprovalRequired} onChange={(managerApprovalRequired) => patch({ managerApprovalRequired })} label="Validation hiérarchique" />
        <Switch disabled={disabled} checked={value.hrApprovalRequired} onChange={(hrApprovalRequired) => patch({ hrApprovalRequired })} label="Validation RH" description="La décision finale de congé reste réservée à l’administrateur." />
        <Switch disabled={disabled} checked={value.requireReplacement} onChange={(requireReplacement) => patch({ requireReplacement })} label="Remplaçant obligatoire" />
      </div>
      <div className="settings-table-editor">
        <div className="settings-table-header"><strong>Types de congé</strong><span>{value.types.filter((item) => item.enabled).length} actif(s)</span></div>
        {value.types.map((item, index) => <div className="settings-leave-type-row" key={item.code}>
          <input disabled={disabled} value={item.label} onChange={(e) => patch({ types: value.types.map((current, currentIndex) => currentIndex === index ? { ...current, label: e.target.value } : current) })} />
          <input disabled={disabled} type="number" min="0" value={item.annualEntitlementDays} onChange={(e) => patch({ types: value.types.map((current, currentIndex) => currentIndex === index ? { ...current, annualEntitlementDays: Number(e.target.value) } : current) })} />
          <Switch disabled={disabled} checked={item.enabled} onChange={(enabled) => patch({ types: value.types.map((current, currentIndex) => currentIndex === index ? { ...current, enabled } : current) })} label="Actif" />
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
        <Switch disabled={disabled} checked={value.requireCompletionEvidence} onChange={(requireCompletionEvidence) => patch({ requireCompletionEvidence })} label="Preuve de réalisation obligatoire" />
        <Switch disabled={disabled} checked={value.requireManagerClosure} onChange={(requireManagerClosure) => patch({ requireManagerClosure })} label="Clôture validée par le responsable" />
        <Switch disabled={disabled} checked={value.allowAgentReassignment} onChange={(allowAgentReassignment) => patch({ allowAgentReassignment })} label="Réaffectation par l’Agent" />
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
        <Switch disabled={disabled} checked={value.requireSmartObjectives} onChange={(requireSmartObjectives) => patch({ requireSmartObjectives })} label="Objectifs SMART obligatoires" />
        <Switch disabled={disabled} checked={value.requireKpiEvidence} onChange={(requireKpiEvidence) => patch({ requireKpiEvidence })} label="Preuves KPI obligatoires" />
        <Switch disabled={disabled} checked={value.quarterlyReviewEnabled} onChange={(quarterlyReviewEnabled) => patch({ quarterlyReviewEnabled })} label="Revues trimestrielles" />
        <Switch disabled={disabled} checked={value.managerApprovalRequired} onChange={(managerApprovalRequired) => patch({ managerApprovalRequired })} label="Validation hiérarchique" />
        <Switch disabled={disabled} checked={value.hrApprovalRequired} onChange={(hrApprovalRequired) => patch({ hrApprovalRequired })} label="Validation RH" />
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
        <Switch disabled={disabled} checked={value.selfReviewEnabled} onChange={(selfReviewEnabled) => patch({ selfReviewEnabled })} label="Auto-évaluation" />
        <Switch disabled={disabled} checked={value.managerReviewEnabled} onChange={(managerReviewEnabled) => patch({ managerReviewEnabled })} label="Appréciation hiérarchique" />
        <Switch disabled={disabled} checked={value.hrValidationRequired} onChange={(hrValidationRequired) => patch({ hrValidationRequired })} label="Validation RH obligatoire" />
        <Switch disabled={disabled} checked={value.agentCanViewFinalResult} onChange={(agentCanViewFinalResult) => patch({ agentCanViewFinalResult })} label="Résultat final visible par l’Agent" />
      </div>
      <div className={`settings-weight-summary${totalWeight === 100 ? " is-valid" : " is-invalid"}`}><strong>Pondération active : {totalWeight} %</strong><span>{totalWeight === 100 ? "La grille est publiable." : "La grille doit totaliser exactement 100 %."}</span></div>
      <div className="settings-criteria-editor">
        {value.criteria.map((criterion, index) => <article key={criterion.key}>
          <div><input disabled={disabled} value={criterion.label} onChange={(e) => patch({ criteria: value.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item) })} /><textarea disabled={disabled} rows={2} value={criterion.description} onChange={(e) => patch({ criteria: value.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, description: e.target.value } : item) })} /></div>
          <div><input disabled={disabled} type="number" min="0" max="100" value={criterion.weight} onChange={(e) => patch({ criteria: value.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, weight: Number(e.target.value) } : item) })} /><Switch disabled={disabled} checked={criterion.enabled} onChange={(enabled) => patch({ criteria: value.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, enabled } : item) })} label="Actif" /></div>
        </article>)}
      </div>
      <Field label="Signataires" full><StringListEditor disabled={disabled} values={value.signatories} onChange={(signatories) => patch({ signatories })} placeholder="Nouveau signataire" /></Field>
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
        <Switch disabled={disabled} checked={value.monthlyEnabled} onChange={(monthlyEnabled) => patch({ monthlyEnabled })} label="Rapport mensuel" />
        <Switch disabled={disabled} checked={value.semiannualEnabled} onChange={(semiannualEnabled) => patch({ semiannualEnabled })} label="Rapport semestriel" />
        <Switch disabled={disabled} checked={value.annualEnabled} onChange={(annualEnabled) => patch({ annualEnabled })} label="Rapport annuel" />
        <Switch disabled={disabled} checked={value.includeUnitComparison} onChange={(includeUnitComparison) => patch({ includeUnitComparison })} label="Comparaison des unités" />
        <Switch disabled={disabled} checked={value.includeExecutiveSummary} onChange={(includeExecutiveSummary) => patch({ includeExecutiveSummary })} label="Synthèse exécutive" />
        <Switch disabled={disabled} checked={value.includeMethodologyWarnings} onChange={(includeMethodologyWarnings) => patch({ includeMethodologyWarnings })} label="Réserves méthodologiques" />
        <Switch disabled={disabled} checked={value.requireDirectionValidation} onChange={(requireDirectionValidation) => patch({ requireDirectionValidation })} label="Validation Direction" />
        <Switch disabled={disabled} checked={value.requireHrValidation} onChange={(requireHrValidation) => patch({ requireHrValidation })} label="Validation RH" />
      </div>
      <div className="settings-form-grid">
        <Field label="Destinataires par défaut" full><StringListEditor disabled={disabled} values={value.defaultRecipients} onChange={(defaultRecipients) => patch({ defaultRecipients })} placeholder="Nouveau destinataire" /></Field>
        <Field label="Signataires" full><StringListEditor disabled={disabled} values={value.signatories} onChange={(signatories) => patch({ signatories })} placeholder="Nouveau signataire" /></Field>
      </div>
    </SectionShell>;
  }

  if(section==="training"){
   const value=settings.training;const patch=(next:Partial<typeof value>)=>updateSection("training",{...value,...next});
   return <SectionShell title="Formations externes" description="Préparez les valeurs proposées à la création des formations. Les offres déjà enregistrées restent inchangées.">
    <div className="settings-form-grid"><Field label="Places proposées par défaut"><input disabled={disabled} type="number" min={1} max={10000} value={value.defaultCapacity} onChange={e=>patch({defaultCapacity:Number(e.target.value)})}/></Field><Field label="Durée proposée (heures)"><input disabled={disabled} type="number" min={.5} max={2000} step={.5} value={value.defaultDurationHours} onChange={e=>patch({defaultDurationHours:Number(e.target.value)})}/></Field><Field label="Devise du budget"><select disabled={disabled} value={value.defaultCurrency} onChange={e=>patch({defaultCurrency:e.target.value as typeof value.defaultCurrency})}><option value="GNF">Franc guinéen</option><option value="EUR">Euro</option><option value="USD">Dollar américain</option></select></Field><Field label="Délai du bilan au poste (jours)" hint="Calculé à la clôture, à partir de la fin de la formation."><input disabled={disabled} type="number" min={1} max={365} value={value.impactReviewDelayDays} onChange={e=>patch({impactReviewDelayDays:Number(e.target.value)})}/></Field></div>
    <div className="settings-policy-note"><strong>Le parcours de formation</strong><p>Les agents demandent à participer. Les RH et l’administrateur acceptent les demandes ; leur inscription personnelle est directe. La confirmation de l’organisme est enregistrée séparément.</p></div>
   </SectionShell>;
  }
  if(section==="recruitment"){
   const value=settings.recruitment;const patch=(next:Partial<typeof value>)=>updateSection("recruitment",{...value,...next});
   return <SectionShell title="Recrutement" description="Choisissez les valeurs proposées pour les nouvelles offres et le contrôle avant proposition d’embauche.">
    <div className="settings-form-grid"><Field label="Nombre de postes proposé"><input disabled={disabled} type="number" min={1} max={1000} value={value.defaultPositions} onChange={e=>patch({defaultPositions:Number(e.target.value)})}/></Field><Field label="Contrat proposé"><select disabled={disabled} value={value.defaultContract} onChange={e=>patch({defaultContract:e.target.value as typeof value.defaultContract})}><option value="CDI">Durée indéterminée</option><option value="CDD">Durée déterminée</option><option value="INTERNSHIP">Stage</option><option value="CONSULTING">Prestation / consultant</option></select></Field><Field label="Délai de candidature proposé (jours)"><input disabled={disabled} type="number" min={1} max={365} value={value.defaultApplicationDeadlineDays} onChange={e=>patch({defaultApplicationDeadlineDays:Number(e.target.value)})}/></Field></div>
    <Switch disabled={disabled} checked={value.interviewReportRequired} onChange={interviewReportRequired=>patch({interviewReportRequired})} label="Exiger un compte rendu avant la proposition" description="Désactivé par défaut : l’entretien et son compte rendu restent facultatifs."/>
    <div className="settings-policy-note"><strong>Décision finale</strong><p>Les RH suivent les candidatures et proposent l’embauche. L’administrateur valide la décision finale. Les dossiers des candidats restent confidentiels.</p></div>
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
        <Field label="Formats de fichiers autorisés" full><div className="settings-format-choices">{documentFormats.map(format=><label key={format.value}><input type="checkbox" disabled={disabled} checked={value.allowedMimeTypes.includes(format.value)} onChange={e=>patch({allowedMimeTypes:e.target.checked?[...value.allowedMimeTypes,format.value]:value.allowedMimeTypes.filter(v=>v!==format.value)})}/>{format.label}</label>)}{value.allowedMimeTypes.some(v=>!documentFormats.some(f=>f.value===v))&&<small>Les autres formats déjà configurés sont conservés.</small>}</div></Field>
      </div>
      <Switch disabled={disabled} checked={value.watermarkEnabled} onChange={(watermarkEnabled) => patch({ watermarkEnabled })} label="Filigrane sur les documents sensibles" />
    </SectionShell>;
  }

  if (section === "notifications") {
    const value = settings.notifications;
    const patch = (next: Partial<typeof value>) => updateSection("notifications", { ...value, ...next });
    return <SectionShell title="Notifications et automatisations" description="Activez les canaux et les rappels de votre organisation.">
      <div className="settings-switch-grid">
        <Switch disabled={disabled} checked={value.enabled} onChange={(enabled) => patch({ enabled })} label="Moteur de notifications" />
        <Switch disabled={disabled} checked={value.inAppEnabled} onChange={(inAppEnabled) => patch({ inAppEnabled })} label="Notifications internes" />
        <Switch disabled={disabled} checked={value.trainingPopupEnabled} onChange={trainingPopupEnabled=>patch({trainingPopupEnabled})} label="Alertes de formation" description="Offres, inscriptions, besoins exprimés et réponses."/>
        <Switch disabled={disabled} checked={value.recruitmentPopupEnabled} onChange={recruitmentPopupEnabled=>patch({recruitmentPopupEnabled})} label="Alertes de recrutement" description="Offres, candidatures, entretiens et décisions pour les personnes habilitées."/>
        <Switch disabled={disabled} checked={value.emailEnabled} onChange={(emailEnabled) => patch({ emailEnabled })} label="Email" />
        <Switch disabled={disabled} checked={value.smsEnabled} onChange={(smsEnabled) => patch({ smsEnabled })} label="SMS" />
        <Switch disabled={disabled} checked={value.whatsappEnabled} onChange={(whatsappEnabled) => patch({ whatsappEnabled })} label="WhatsApp Business" />
        <Switch disabled={disabled} checked={value.taskReminderEnabled} onChange={(taskReminderEnabled) => patch({ taskReminderEnabled })} label="Rappels de tâches" />
        <Switch disabled={disabled} checked={value.overdueEscalationEnabled} onChange={(overdueEscalationEnabled) => patch({ overdueEscalationEnabled })} label="Escalade des retards" />
        <Switch disabled={disabled} checked={value.leavePendingReminderEnabled} onChange={(leavePendingReminderEnabled) => patch({ leavePendingReminderEnabled })} label="Congés en attente" />
        <Switch disabled={disabled} checked={value.attendanceMissingReminderEnabled} onChange={(attendanceMissingReminderEnabled) => patch({ attendanceMissingReminderEnabled })} label="Pointage manquant" />
      </div>
      <div className="settings-form-grid"><Field label="Rappel préparation rapport (jours)"><input disabled={disabled} type="number" value={value.reportPreparationReminderDays} onChange={(e) => patch({ reportPreparationReminderDays: Number(e.target.value) })} /></Field></div>
    </SectionShell>;
  }

  if (section === "security") {
    const value = settings.security;
    const patch = (next: Partial<typeof value>) => updateSection("security", { ...value, ...next });
    return <SectionShell title="Sécurité des accès" description="Ces paramètres sont sensibles et doivent être publiés par l’administrateur de votre organisation.">
      <div className="settings-form-grid">
        <Field label="Durée de session (minutes)"><input disabled={disabled} type="number" value={value.sessionDurationMinutes} onChange={(e) => patch({ sessionDurationMinutes: Number(e.target.value) })} /></Field>
        <Field label="Tentatives maximales"><input disabled={disabled} type="number" value={value.maxLoginAttempts} onChange={(e) => patch({ maxLoginAttempts: Number(e.target.value) })} /></Field>
        <Field label="Durée de blocage (minutes)"><input disabled={disabled} type="number" value={value.lockoutMinutes} onChange={(e) => patch({ lockoutMinutes: Number(e.target.value) })} /></Field>
        <Field label="Longueur minimale"><input disabled={disabled} type="number" value={value.minimumPasswordLength} onChange={(e) => patch({ minimumPasswordLength: Number(e.target.value) })} /></Field>
        <Field label="Expiration mot de passe (jours)"><input disabled={disabled} type="number" value={value.passwordExpiryDays} onChange={(e) => patch({ passwordExpiryDays: Number(e.target.value) })} /></Field>
      </div>
      <div className="settings-switch-grid">
        <Switch disabled={disabled} checked={value.requireUppercase} onChange={(requireUppercase) => patch({ requireUppercase })} label="Majuscule obligatoire" />
        <Switch disabled={disabled} checked={value.requireLowercase} onChange={(requireLowercase) => patch({ requireLowercase })} label="Minuscule obligatoire" />
        <Switch disabled={disabled} checked={value.requireNumber} onChange={(requireNumber) => patch({ requireNumber })} label="Chiffre obligatoire" />
        <Switch disabled={disabled} checked={value.requireSymbol} onChange={(requireSymbol) => patch({ requireSymbol })} label="Symbole obligatoire" />
        <Switch disabled={disabled} checked={value.requireRecentPasswordForSensitiveActions} onChange={(requireRecentPasswordForSensitiveActions) => patch({ requireRecentPasswordForSensitiveActions })} label="Mot de passe récent pour actions sensibles" />
        <Switch disabled={disabled} checked={value.revokeSessionsOnPasswordChange} onChange={(revokeSessionsOnPasswordChange) => patch({ revokeSessionsOnPasswordChange })} label="Révoquer les sessions après changement" />
      </div>
    </SectionShell>;
  }

  if (section === "numbering") {
    const value=settings.numbering;const patch=(next:Partial<typeof value>)=>updateSection("numbering",{...value,...next});
    return <SectionShell title="Références et numéros" description="Choisissez les éléments de vos références. L’exemple se met à jour à chaque modification.">
    {([["evaluationPattern","Évaluations"],["monthlyReportPattern","Rapports mensuels"],["semiannualReportPattern","Rapports semestriels"],["annualReportPattern","Rapports annuels"],["agentPattern","Matricules des agents"]] as const).map(([key,label])=><NumberingPatternEditor key={key} label={label} value={value[key]} acronym={settings.institution.acronym} disabled={disabled} onChange={pattern=>patch({[key]:pattern})}/>)}
    <Switch disabled={disabled} checked={value.resetSequenceEachYear} onChange={resetSequenceEachYear=>patch({resetSequenceEachYear})} label="Recommencer la numérotation chaque année"/>
    </SectionShell>;
  }

  if (section === "featureFlags") {
    const value = settings.featureFlags;
    const patch = (next: Partial<typeof value>) => updateSection("featureFlags", { ...value, ...next });
    const labels=featureLabels;
    return <SectionShell title="Modules de votre organisation" description="Enregistrez puis publiez pour appliquer les accès et la navigation. Une désactivation conserve toutes les données. Les autres sessions se synchronisent automatiquement. La désactivation de Formation et Recrutement bloque aussi leurs accès après publication.">
      <div className="settings-feature-grid">{(Object.keys(value) as Array<keyof typeof value>).map((key) => <Switch key={key} checked={value[key]} disabled={disabled} onChange={(enabled) => patch({ [key]: enabled })} label={labels[key]} description={value[key] ? "Disponible après publication" : "Désactivé après publication"} />)}</div>
    </SectionShell>;
  }

  return null;
}

function SectionShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="settings-editor-section"><header><div><p>PARAMÈTRES DE VOTRE ORGANISATION</p><h3>{title}</h3><span>{description}</span></div></header><div className="settings-editor-content">{children}</div></section>;
}
