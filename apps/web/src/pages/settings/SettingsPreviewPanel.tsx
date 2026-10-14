import { Clock3, FileText, MonitorSmartphone, ShieldCheck } from "lucide-react";
import type { SettingsSectionKey, TenantSettingsPayload } from "../../features/settings/settings.types";

export default function SettingsPreviewPanel({ settings, section }: { settings: TenantSettingsPayload; section: SettingsSectionKey }) {
  const { institution, branding } = settings;
  return (
    <aside className="settings-preview-panel">
      <header><span>APERÇU EN TEMPS RÉEL</span><strong>{branding.appName.replace(/\bfades(?:-rh)?\b/gi, "Plateforme RH")}</strong></header>
      <div className="settings-preview-brand" style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}>
        {branding.logoUrl ? <img src={branding.logoUrl} alt="Logo" /> : <div className="settings-preview-logo">{institution.acronym.replace(/\bfades(?:-rh)?\b/gi, "RH")}</div>}
        <div><span>{institution.supervisoryAuthority}</span><strong>{institution.shortName.replace(/\bfades(?:-rh)?\b/gi, "Organisation")}</strong><small>{institution.motto}</small></div>
      </div>
      {(section === "institution" || section === "branding" || section === "documents" || section === "reports" || section === "evaluations") && (
        <article className="settings-document-preview">
          <div className="settings-document-head"><span>{institution.supervisoryAuthority}</span><b>{institution.country}</b></div>
          <strong>{institution.legalName}</strong>
          <h4>DOCUMENT</h4>
          <p>La configuration publiée sera utilisée par les évaluations, rapports et documents générés.</p>
          <footer>{institution.address} · {institution.phone}<br />{institution.email}</footer>
        </article>
      )}
      {section === "attendance" && <article className="settings-rule-preview"><Clock3 /><div><span>Simulation du pointage</span><strong>Arrivée normale : {settings.attendance.checkInTime}</strong><p>Retard après {settings.attendance.lateToleranceMinutes} minute(s) de tolérance.</p></div></article>}
      {section === "security" && <article className="settings-rule-preview"><ShieldCheck /><div><span>Niveau de sécurité</span><strong>Mot de passe : {settings.security.minimumPasswordLength} caractères minimum</strong><p>{settings.security.maxLoginAttempts} tentative(s), blocage {settings.security.lockoutMinutes} min.</p></div></article>}
      {section === "featureFlags" && <article className="settings-modules-preview"><MonitorSmartphone /><strong>Modules actifs</strong><div>{Object.entries(settings.featureFlags).map(([key, enabled]) => <span className={enabled ? "is-on" : ""} key={key}>{key}</span>)}</div></article>}
      <div className="settings-preview-note"><FileText size={16} /> Les snapshots historiques déjà validés ne sont pas modifiés automatiquement.</div>
    </aside>
  );
}
