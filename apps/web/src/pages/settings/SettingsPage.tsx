const settingsDateFormatter=new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
import SettingsDialog from "./SettingsDialog";
import {GraduationCap,BriefcaseBusiness} from "lucide-react";
const TenantDocumentMarksPanel=lazy(()=>import("../../features/settings/DocumentMarks"));
import {
  resolveAppearance,
  DEFAULT_APPEARANCE,
  type AppearanceColorKey,
} from "../../features/settings/settings.appearance";
import { assertBrandingContrast } from "../../features/settings/settings.colors";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  Activity,
  BadgeCheck,
  BellRing,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Download,
  FileCog,
  FileText,
  Fingerprint,
  Flag,
  Gauge,
  History,
  Layers3,
  ListChecks,
  LoaderCircle,
  MapPinned,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../features/auth/auth.context";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import {
  discardTenantSettingsDraft,
  downloadTenantSettingsExport,
  getTenantSettings,
  getTenantSettingsHistory,
  publishTenantSettings,
  restoreTenantSettingsVersion,
  saveTenantSettingsSection,
  validateTenantSettingsDraft,
} from "../../features/settings/settings.api";
import type {
  SettingsImpact,
  SettingsRecordResponse,
  SettingsSectionKey,
  TenantSettingsPayload,
} from "../../features/settings/settings.types";
import {
  cloneSettings,
  isSameSettingsValue,
  settingsSectionLabels,
} from "../../features/settings/settings.utils";
const SettingsHistoryDrawer=lazy(()=>import("./SettingsHistoryDrawer"));
import SettingsPreviewPanel from "./SettingsPreviewPanel";
const SettingsPublishModal=lazy(()=>import("./SettingsPublishModal"));
import SettingsSectionEditor from "./SettingsSectionEditor";
import "./settings-page.css";
 
const sectionIcons: Record<SettingsSectionKey, typeof Building2> = {
  institution: Building2,
  branding: Paintbrush,
  organization: MapPinned,
  attendance: Fingerprint,
  leave: CalendarDays,
  tasks: ListChecks,
  roadmaps: Flag,
  evaluations: ClipboardCheck,
  reports: FileText,
  training: GraduationCap,
  recruitment: BriefcaseBusiness,
  documents: FileCog,
  notifications: BellRing,
  security: ShieldCheck,
  numbering: Layers3,
  featureFlags: Settings2,
};

const sectionDescriptions: Record<SettingsSectionKey, string> = {
  institution: "Identité officielle, coordonnées et responsables",
  branding: "Logo, couleurs, documents et marque blanche",
  organization: "Héritage, Directions, Services et délégations",
  attendance: "Horaires, jours ouvrables et corrections",
  leave: "Droits, validations et justificatifs",
  tasks: "Échéances, rappels et preuves",
  roadmaps: "Planification annuelle et KPI",
  evaluations: "Critères, pondérations et workflow",
  reports: "Fréquences, validation et destinataires",
  training: "Offres externes, inscriptions et suivi",
  recruitment: "Offres, candidatures et décision finale",
  documents: "Formats, conservation et confidentialité",
  notifications: "Canaux, rappels et escalades",
  security: "Sessions, accès et mots de passe",
  numbering: "Références et séquences documentaires",
  featureFlags: "Accès aux modules de votre organisation",
};

const allSections = Object.keys(settingsSectionLabels) as SettingsSectionKey[];

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return settingsDateFormatter.format(new Date(value));
}

function maturityLabel(level?: string): string {
  if (level === "EXCELLENT") return "Excellente";
  if (level === "GOOD") return "Bonne";
  if (level === "TO_COMPLETE") return "À compléter";
  return "Critique";
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] =
    useState<SettingsSectionKey>("institution");
  const [search, setSearch] = useState("");
  const [notice,setNotice]=useState("");
  const [workingSettings, setWorkingSettings] =
    useState<TenantSettingsPayload | null>(null);
  const [baselineSettings, setBaselineSettings] =
    useState<TenantSettingsPayload | null>(null);
  const baselineRef = useRef<TenantSettingsPayload | null>(null);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage,setHistoryPage]=useState(1);
  const [discardOpen,setDiscardOpen]=useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [restoreVersion, setRestoreVersion] = useState<number | null>(null);
  const [impact, setImpact] = useState<SettingsImpact | null>(null);

  const role = user?.role ?? "";
  const canPublish = role === "TENANT_ADMIN";
  const canManageAll = role === "TENANT_ADMIN";
  const rhManagedSections = new Set<SettingsSectionKey>([
    "attendance",
    "leave",
    "tasks",
    "roadmaps",
    "evaluations",
    "reports",
    "training",
    "recruitment",
    "documents",
    "notifications",
    "numbering",
  ]);
  const canManageCurrent =
    canManageAll ||
    (role === "RH_MANAGER" && rhManagedSections.has(activeSection));

  const adminKey = [
    "tenant-settings",
    "admin",
    user?.tenantId,
    user?.id,
    user?.role,
  ] as const;
  const settingsQuery = useQuery({
    queryKey: adminKey,
    queryFn: getTenantSettings,
    staleTime: 30_000,
  });

  const historyQuery = useQuery({
    queryKey: [
      "tenant-settings",
      "history", historyPage,
      user?.tenantId,
      user?.id,
      user?.role,
    ],
    queryFn: () => getTenantSettingsHistory(historyPage, 20),
    enabled: historyOpen,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const previous = baselineRef.current;
    const latest = cloneSettings(settingsQuery.data.effective);
    setWorkingSettings((current) => {
      if (!current || !previous) return latest;
      const merged = cloneSettings(latest);
      for (const key of allSections)
        if (!isSameSettingsValue(current[key], previous[key]))
          (merged as any)[key] = current[key];
      return merged;
    });
    baselineRef.current = latest;
    setBaselineSettings(latest);
  }, [settingsQuery.data]);
  const anyLocalDirty = useMemo(
    () =>
      Boolean(
        workingSettings &&
        baselineSettings &&
        allSections.some(
          (key) =>
            !isSameSettingsValue(workingSettings[key], baselineSettings[key]),
        ),
      ),
    [workingSettings, baselineSettings],
  );
  useEffect(()=>{if(!anyLocalDirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[anyLocalDirty]);
  function acceptBrandingRecord(data: SettingsRecordResponse) {
    setWorkingSettings((current) =>
      current
        ? { ...current, branding: cloneSettings(data.effective.branding) }
        : cloneSettings(data.effective),
    );
    queryClient.setQueryData(adminKey, data);
  }

  const currentSectionDirty = useMemo(() => {
    if (!workingSettings || !baselineSettings) return false;
    return !isSameSettingsValue(
      workingSettings[activeSection],
      baselineSettings[activeSection],
    );
  }, [workingSettings, baselineSettings, activeSection]);

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allSections;
    return allSections.filter((section) =>
      `${settingsSectionLabels[section]} ${sectionDescriptions[section]}`
        .toLowerCase()
        .includes(query),
    );
  }, [search]);

  async function refreshAll(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] }),
      queryClient.invalidateQueries({
        queryKey: ["tenant-settings", "public"],
      }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workingSettings) throw new Error("Configuration indisponible.");
      return saveTenantSettingsSection(
        activeSection,
        workingSettings[activeSection],
        settingsQuery.data?.editRevision,
      );
    },
    onSuccess: (data) => {
      setNotice("Brouillon enregistré. Publiez pour appliquer les modifications.");
      setWorkingSettings((current) =>
        current
          ? {
              ...current,
              [activeSection]: cloneSettings(data.effective[activeSection]),
            }
          : cloneSettings(data.effective),
      );
      queryClient.setQueryData(adminKey, data);
    },
  });

  const validateMutation = useMutation({
    mutationFn: validateTenantSettingsDraft,
    onSuccess: (data) => {
      setImpact(data.impact);
      if (data.impact) setPublishOpen(true);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (reason: string) =>
      publishTenantSettings(reason, settingsQuery.data?.editRevision),
    onSuccess: async () => {
      setNotice("Les nouveaux paramètres sont publiés.");
      setPublishOpen(false);
      setImpact(null);
      await refreshAll();
    },
  });

  const discardMutation = useMutation({
    mutationFn: () =>
      discardTenantSettingsDraft(settingsQuery.data?.editRevision),
    onSuccess: async (data) => {
      setDiscardOpen(false);
      baselineRef.current = cloneSettings(data.effective);
      setWorkingSettings(cloneSettings(data.effective));
      setBaselineSettings(cloneSettings(data.effective));
      queryClient.setQueryData(adminKey, data);
      await refreshAll();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ version, reason }: { version: number; reason: string }) =>
      restoreTenantSettingsVersion(
        version,
        reason,
        settingsQuery.data?.editRevision,
      ),
    onSuccess: async () => {
      setRestoreVersion(null);
      setHistoryOpen(false);
      await refreshAll();
    },
  });

  const exportMutation = useMutation({
    mutationFn: downloadTenantSettingsExport,
  });

  const errorMessage = settingsQuery.isError
    ? getApiErrorMessage(settingsQuery.error)
    : saveMutation.isError
      ? getApiErrorMessage(saveMutation.error)
      : validateMutation.isError
        ? getApiErrorMessage(validateMutation.error)
        : publishMutation.isError
          ? getApiErrorMessage(publishMutation.error)
          : discardMutation.isError
            ? getApiErrorMessage(discardMutation.error)
            : restoreMutation.isError
              ? getApiErrorMessage(restoreMutation.error)
              : exportMutation.isError
                ? getApiErrorMessage(exportMutation.error)
                : null;

  const appearanceInvalid = workingSettings
    ? assertBrandingContrast(resolveAppearance(workingSettings.branding))
        .length > 0 ||
      (Object.keys(DEFAULT_APPEARANCE) as AppearanceColorKey[]).some(
        (key) =>
          workingSettings.branding[key] !== undefined &&
          !/^#[a-f\d]{6}$/i.test(workingSettings.branding[key] ?? ""),
      )
    : false;
  const operationBusy =
    validateMutation.isPending ||
    appearanceBusy ||
    saveMutation.isPending ||
    publishMutation.isPending ||
    discardMutation.isPending ||
    restoreMutation.isPending;
  if (settingsQuery.isError && !settingsQuery.data) {
    return (
      <section className="settings-error" role="alert">
        <strong>Configuration indisponible</strong>
        <p>{getApiErrorMessage(settingsQuery.error)}</p>
        <button
          type="button"
          className="settings-secondary-button"
          onClick={() => void settingsQuery.refetch()}
        >
          Réessayer
        </button>
      </section>
    );
  }
  if (settingsQuery.isLoading || !workingSettings || !baselineSettings) {
    return (
      <div className="settings-page-loader">
        <LoaderCircle className="is-spinning" />
        <strong>Chargement des paramètres…</strong>
      </div>
    );
  }

  const record = settingsQuery.data;
  const activeModules = Object.values(workingSettings.featureFlags).filter(
    Boolean,
  ).length;
  const totalModules = Object.keys(workingSettings.featureFlags).length;

  return (
    <section className="settings-page">
      <header className="settings-hero">
        <div>
          <p>PARAMÈTRES DE L’ORGANISATION</p>
          <h2>
            Paramètres <span>& préférences.</span>
          </h2>
          <div className="settings-hero-description">
            Pilotez l’identité, les règles RH, les documents, la sécurité et les
            modules de votre organisation.
          </div>
        </div>
        <div className="settings-hero-actions">
          <button
            className="settings-hero-button"
            type="button"
            disabled={operationBusy || settingsQuery.isFetching}
            onClick={() => void refreshAll()}
            data-ui-action="compact"
            aria-label="Actualiser"
            title="Actualiser"
          >
            <RefreshCw size={16} />
            <span className="ui-action-label"> Actualiser</span>
          </button>
          <button
            className="settings-hero-button"
            type="button"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            data-ui-action="compact"
            aria-label="Exporter"
            title="Exporter"
          >
            <Download size={16} />
            <span className="ui-action-label"> Exporter</span>
          </button>
          <button
            className="settings-hero-button"
            type="button"
            onClick={() => {setHistoryPage(1);setHistoryOpen(true);}}
            data-ui-action="compact"
            aria-label="Historique"
            title="Historique"
          >
            <History size={16} />
            <span className="ui-action-label"> Historique</span>
          </button>
        </div>
      </header>

      {notice&&<p className="settings-feedback" role="status">{notice}</p>}
      {errorMessage && (
        <div className="settings-error" role="alert">
          <Activity size={19} />
          <div>
            <strong>Une opération est indisponible.</strong>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      <section className="settings-overview-grid">
        <article className="settings-overview-card maturity">
          <div
            className="settings-ring"
            style={
              {
                "--progress": `${record?.maturity.score ?? 0}%`,
              } as CSSProperties
            }
          >
            <strong>{record?.maturity.score ?? 0}</strong>
            <span>/100</span>
          </div>
          <div>
            <span>Maturité de configuration</span>
            <strong>{maturityLabel(record?.maturity.level)}</strong>
            <p>
              {record?.maturity.completedSections}/
              {record?.maturity.totalSections} contrôles satisfaits
            </p>
          </div>
        </article>
        <article className="settings-overview-card">
          <Gauge />
          <div>
            <span>Version active</span>
            <strong>v{record?.activeVersion}</strong>
            <p>Publiée le {formatDate(record?.publishedAt)}</p>
          </div>
        </article>
        <article className="settings-overview-card">
          <Sparkles />
          <div>
            <span>Brouillon</span>
            <strong>
              {record?.hasDraft ? "Modifications en cours" : "Aucun brouillon"}
            </strong>
            <p>
              {record?.hasDraft
                ? `${record.draftUpdatedByName ?? "Utilisateur"} · ${formatDate(record.draftUpdatedAt)}`
                : "Configuration synchronisée"}
            </p>
          </div>
        </article>
        <article className="settings-overview-card">
          <BadgeCheck />
          <div>
            <span>{record?.hasDraft||anyLocalDirty?"Modules préparés":"Modules actifs"}</span>
            <strong>
              {activeModules}/{totalModules} actives
            </strong>
            <p>{record?.hasDraft||anyLocalDirty?"Appliqués après publication":"Modules disponibles dans votre espace"}</p>
          </div>
        </article>
      </section>

      {record?.maturity.issues.length ? (
        <section className="settings-recommendations">
          <header>
            <Sparkles size={16} />
            <div>
              <strong>Recommandations de mise en production</strong>
              <span>
                Actions proposées pour améliorer la configuration de votre organisation.
              </span>
            </div>
          </header>
          <div>
            {record.maturity.issues.map((issue) => (
              <button
                key={issue}
                type="button"
                onClick={() =>
                  setActiveSection(
                    issue.includes("pondération")
                      ? "evaluations"
                      : issue.includes("marque")
                        ? "branding"
                        : issue.includes("mot de passe")
                          ? "security"
                          : "institution",
                  )
                }
              >
                {issue}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="settings-workspace">
        <aside className="settings-sidebar">
          <div className="settings-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Rechercher une rubrique de paramètres"
              placeholder="Rechercher un paramètre…"
            />
          </div>
          <nav aria-label="Rubriques des paramètres">
            {filteredSections.map((section) => {
              const Icon = sectionIcons[section];
              const isDirty = !isSameSettingsValue(
                workingSettings[section],
                baselineSettings[section],
              );
              return (
                <button
                  key={section}
                  type="button"
                  className={activeSection === section ? "is-active" : ""}
                  aria-current={activeSection===section?"page":undefined}
                  disabled={operationBusy}
                  onClick={() => setActiveSection(section)}
                >
                  <Icon size={16} />
                  <span>
                    <strong>{settingsSectionLabels[section]}</strong>
                    <small>{sectionDescriptions[section]}</small>
                  </span>
                  {isDirty && <i />}
                </button>
              );
            })}
          </nav>
        </aside>

        <main
          className={`settings-editor-shell${!canManageCurrent ? " is-read-only" : ""}`}
        >
          {!canManageCurrent && (
            <div className="settings-read-only">
              <ShieldCheck size={16} />
              <span>
                Consultation uniquement pour votre rôle sur cette section.
              </span>
            </div>
          )}
          <SettingsSectionEditor
            section={activeSection}
            settings={workingSettings}
            readOnly={!canManageCurrent || operationBusy}
            onChange={setWorkingSettings}
            expectedRevision={record?.editRevision ?? 0}
            onBrandingSaved={acceptBrandingRecord}
            onAppearanceBusy={setAppearanceBusy}
          />
          {activeSection === "branding" && <Suspense fallback={<p role="status">Chargement des cachets et signatures…</p>}><TenantDocumentMarksPanel /></Suspense>}
        </main>

        <SettingsPreviewPanel
          settings={workingSettings}
          section={activeSection}
        />
      </div>

      {(anyLocalDirty || record?.hasDraft) && (
        <div className="settings-save-bar">
          <div>
            <span>
              {currentSectionDirty
                ? "Modifications locales non enregistrées"
                : "Brouillon enregistré"}
            </span>
            <strong>{settingsSectionLabels[activeSection]}</strong>
          </div>
          <div className="settings-save-actions">
            {currentSectionDirty && (
              <button
                className="settings-cancel-button"
                type="button"
                onClick={() =>
                  setWorkingSettings({
                    ...workingSettings,
                    [activeSection]: cloneSettings(
                      baselineSettings[activeSection],
                    ),
                  })
                }
                disabled={operationBusy}
              >
                <RotateCcw size={16} /> Annuler
              </button>
            )}
            {canManageCurrent && currentSectionDirty && (
              <button
                className="settings-secondary-button"
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={
                  operationBusy ||
                  (activeSection === "branding" && appearanceInvalid)
                }
              >
                {saveMutation.isPending ? (
                  <LoaderCircle size={16} className="is-spinning" />
                ) : (
                  <Save size={16} />
                )}{" "}
                Enregistrer le brouillon
              </button>
            )}
            {canPublish && record?.hasDraft && !anyLocalDirty && (
              <button
                className="settings-primary-button"
                type="button"
                onClick={() => validateMutation.mutate()}
                disabled={operationBusy || validateMutation.isPending}
              >
                {validateMutation.isPending ? (
                  <LoaderCircle size={16} className="is-spinning" />
                ) : (
                  <Send size={16} />
                )}{" "}
                Contrôler et publier
              </button>
            )}
            {canPublish && record?.hasDraft && !anyLocalDirty && (
              <button
                className="settings-danger-link"
                type="button"
                onClick={() => setDiscardOpen(true)}
                disabled={operationBusy}
              >
                Abandonner le brouillon
              </button>
            )}
          </div>
        </div>
      )}

      {historyOpen && <Suspense fallback={<p role="status">Chargement…</p>}><SettingsHistoryDrawer
        open={historyOpen}
        revisions={historyQuery.data?.items ?? []}
        isLoading={historyQuery.isLoading}
        canRestore={canPublish}
        isRestoring={restoreMutation.isPending}
        pagination={historyQuery.data?.pagination}
        onPage={setHistoryPage}
        error={historyQuery.isError?getApiErrorMessage(historyQuery.error):null}
        onClose={() => setHistoryOpen(false)}
        onRestore={(version) => setRestoreVersion(version)}
      /></Suspense>}

      {publishOpen && <Suspense fallback={<p role="status">Chargement…</p>}><SettingsPublishModal
        open={publishOpen}
        error={publishMutation.isError?getApiErrorMessage(publishMutation.error):null}
        impact={impact}
        isSubmitting={publishMutation.isPending}
        onClose={() => setPublishOpen(false)}
        onPublish={async (reason) => {
          await publishMutation.mutateAsync(reason);
        }}
      /></Suspense>}

      {restoreVersion!==null&&<SettingsDialog title={`Restaurer la version ${restoreVersion}`} eyebrow="RESTAURATION" busy={restoreMutation.isPending} onClose={()=>setRestoreVersion(null)}>
       <p>Cette action publie une nouvelle version et conserve l’historique. Les anciens logos supprimés ne sont pas recréés ; le logo actuel est conservé.</p>
       {restoreMutation.isError&&<p className="settings-error" role="alert">{getApiErrorMessage(restoreMutation.error)}</p>}
       <footer><button type="button" className="settings-cancel-button" disabled={restoreMutation.isPending} onClick={()=>setRestoreVersion(null)}>Annuler</button><button type="button" className="settings-primary-button" disabled={restoreMutation.isPending} onClick={()=>restoreMutation.mutate({version:restoreVersion,reason:`Restauration de la version ${restoreVersion}`})}>{restoreMutation.isPending?<LoaderCircle size={16} className="is-spinning"/>:<RotateCcw size={16}/>}Restaurer</button></footer>
      </SettingsDialog>}
      {discardOpen&&<SettingsDialog title="Abandonner le brouillon ?" busy={discardMutation.isPending} onClose={()=>setDiscardOpen(false)}><p>Les modifications enregistrées dans ce brouillon seront retirées. La configuration publiée restera en place.</p>{discardMutation.isError&&<p className="settings-error" role="alert">{getApiErrorMessage(discardMutation.error)}</p>}<footer><button type="button" className="settings-cancel-button" disabled={discardMutation.isPending} onClick={()=>setDiscardOpen(false)}>Conserver le brouillon</button><button type="button" className="settings-secondary-button" disabled={discardMutation.isPending} onClick={()=>discardMutation.mutate()}>Abandonner le brouillon</button></footer></SettingsDialog>}

    </section>
  );
}
