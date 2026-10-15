import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, RotateCcw, Trash2, Upload, X, Palette } from "lucide-react";
import type { BrandingSettings, SettingsRecordResponse } from "../../features/settings/settings.types";
import { DEFAULT_APPEARANCE, appearanceVariables, resolveAppearance, type AppearanceColorKey } from "../../features/settings/settings.appearance";
import { assertBrandingContrast } from "../../features/settings/settings.colors";
import { resetTenantSettingsAppearance, uploadTenantSettingsLogo } from "../../features/settings/settings.api";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import "./branding-settings-editor.css";

const labels: Record<AppearanceColorKey, string> = {
  primaryColor: "Actions principales", secondaryColor: "Couleur secondaire", accentColor: "Accent", dangerColor: "Alertes",
  sidebarBackgroundColor: "Fond de la sidebar", sidebarTextColor: "Texte de la sidebar", sidebarActiveColor: "Menu sélectionné",
  pageBackgroundColor: "Fond général", surfaceColor: "Cartes et formulaires", textColor: "Texte principal", mutedTextColor: "Texte secondaire", borderColor: "Bordures",
  topbarBackgroundColor: "Fond de l’en-tête", topbarTextColor: "Texte de l’en-tête",
};
const groups: Array<{ label: string; keys: AppearanceColorKey[] }> = [
  { label: "Navigation", keys: ["sidebarBackgroundColor", "sidebarTextColor", "sidebarActiveColor", "topbarBackgroundColor", "topbarTextColor"] },
  { label: "Espace de travail", keys: ["pageBackgroundColor", "surfaceColor", "textColor", "mutedTextColor", "borderColor"] },
  { label: "Actions et repères", keys: ["primaryColor", "secondaryColor", "accentColor", "dangerColor"] },
];
const presets: Array<{ name: string; colors: Partial<Record<AppearanceColorKey, string>> }> = [
  { name: "Émeraude", colors: {} },
  { name: "Bleu", colors: { primaryColor: "#2455A4", secondaryColor: "#142C52", sidebarBackgroundColor: "#142C52", sidebarActiveColor: "#2455A4", accentColor: "#5AB5DF" } },
  { name: "Prune", colors: { primaryColor: "#713E83", secondaryColor: "#31203A", sidebarBackgroundColor: "#31203A", sidebarActiveColor: "#713E83", accentColor: "#D4A0BD" } },
  { name: "Sombre", colors: { primaryColor: "#66CCA3", secondaryColor: "#173B30", sidebarBackgroundColor: "#101C28", sidebarActiveColor: "#046242", pageBackgroundColor: "#101C28", surfaceColor: "#1C2C3A", textColor: "#EDF4FA", mutedTextColor: "#B2C2D0", borderColor: "#3A5265", topbarBackgroundColor: "#1C2C3A", topbarTextColor: "#EDF4FA" } },
];
type Props = {
  branding: BrandingSettings; organizationName: string; readOnly: boolean; expectedRevision: number;
  onChange: (value: BrandingSettings) => void; onSaved: (record: SettingsRecordResponse) => void;
  onBusyChange: (busy: boolean) => void;
};
export default function BrandingSettingsEditor({ branding, organizationName, readOnly, expectedRevision, onChange, onSaved, onBusyChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"COLORS" | "LOGO" | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirm) { confirmation.current?.scrollIntoView({ block: "center", behavior: "auto" }); confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); } }, [confirm]);
  const picker = useRef<HTMLInputElement>(null);
  const colors = resolveAppearance(branding);
  const issues = assertBrandingContrast(colors);
  const invalidColors = (Object.keys(DEFAULT_APPEARANCE) as AppearanceColorKey[]).some(key => branding[key] !== undefined && !/^#[a-f\d]{6}$/i.test(branding[key] ?? ""));
  const disabled = readOnly || busy;
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function selectFile(candidate?: File) {
    if (disabled || !candidate) return;
    setError(null); setMessage(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(candidate.type) || candidate.size > 2 * 1024 * 1024 || !candidate.size) {
      setError("Choisissez un logo PNG, JPEG ou WebP de 2 Mo maximum."); return;
    }
    setFile(candidate);
  }
  async function perform(action: () => Promise<SettingsRecordResponse>, success: string) {
    setBusy(true); onBusyChange(true); setError(null); setMessage(null);
    try { const record = await action(); onSaved(record); setFile(null); setMessage(success); setConfirm(null); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(false); onBusyChange(false); }
  }
  const patch = (value: Partial<BrandingSettings>) => { setMessage(null); onChange({ ...branding, ...value }); };
  return <section className="branding-editor">
    <header className="branding-section-heading"><Palette size={22} aria-hidden="true" /><div><h3>Apparence de votre entreprise</h3><p>Prévisualisez, enregistrez le brouillon, puis publiez pour toute votre équipe.</p></div></header>
    {error && <p className="branding-feedback is-error" role="alert">{error}</p>}
    {message && <p className="branding-feedback is-success" role="status"><Check size={17} />{message}</p>}
    <label className="settings-field"><span>Nom de l’application</span><input value={branding.appName} disabled={disabled} maxLength={120} onChange={e => patch({ appName: e.target.value })} /></label>
    <section className="branding-logo-section">
      <div><h4>Logo de l’entreprise</h4><p>Le nouveau logo est enregistré dans un brouillon. L’ancien reste en ligne jusqu’à la publication.</p></div>
      <div className="branding-logo-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFile(e.dataTransfer.files[0]); }}>
        <div className="branding-logo-preview">{preview || branding.logoUrl ? <img src={preview || branding.logoUrl} alt={`Logo de ${organizationName}`} /> : <ImagePlus size={30} aria-hidden="true" />}</div>
        <div><strong>{file?.name ?? (branding.logoUrl ? "Logo enregistré" : "Ajouter votre logo")}</strong><small>PNG, JPEG ou WebP · 2 Mo maximum · transparence conservée</small>
          <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" className="ui-sr-only" aria-label="Choisir un logo" disabled={disabled} onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="branding-inline-actions">
            <button type="button" className="settings-secondary-button" disabled={disabled} onClick={() => picker.current?.click()}><ImagePlus size={17} />Choisir une image</button>
            {file && <><button type="button" className="settings-primary-button" disabled={disabled || invalidColors || Boolean(issues.length)} onClick={() => void perform(() => uploadTenantSettingsLogo(file, branding, expectedRevision), "Logo enregistré dans le brouillon. Publiez pour l’appliquer.")}>{busy ? <LoaderCircle className="is-spinning" size={17} /> : <Upload size={17} />}Enregistrer le logo</button><button type="button" className="branding-icon-button" aria-label="Annuler le choix du fichier" disabled={disabled} onClick={() => setFile(null)}><X size={18} /></button></>}
            {!file && branding.logoUrl && <button type="button" className="branding-icon-button is-danger" aria-label="Retirer le logo" title="Retirer le logo" disabled={disabled} onClick={() => setConfirm("LOGO")}><Trash2 size={18} /></button>}
          </div>
        </div>
      </div>
    </section>
    <div className="branding-preset-heading"><h4>Palettes de départ</h4><button type="button" className="settings-secondary-button" disabled={disabled} onClick={() => setConfirm("COLORS")}><RotateCcw size={17} />Couleurs par défaut</button></div>
    <div className="branding-presets">{presets.map(preset => <button type="button" key={preset.name} disabled={disabled} onClick={() => patch({ ...DEFAULT_APPEARANCE, ...preset.colors })}><span style={{ background: preset.colors.primaryColor ?? DEFAULT_APPEARANCE.primaryColor }} /><strong>{preset.name}</strong></button>)}</div>
    {groups.map(group => <fieldset className="branding-color-group" key={group.label} disabled={disabled}><legend>{group.label}</legend><div className="branding-color-grid">{group.keys.map(key => <label key={key} className="branding-color-field"><span>{labels[key]}</span><div><input type="color" value={colors[key]} aria-label={`Choisir : ${labels[key]}`} onChange={e => patch({ [key]: e.target.value.toUpperCase() })} /><input value={branding[key] ?? colors[key]} maxLength={7} spellCheck={false} aria-label={`Code hexadécimal : ${labels[key]}`} onChange={e => patch({ [key]: e.target.value.toUpperCase() })} /></div></label>)}</div></fieldset>)}
    {(issues.length > 0 || invalidColors) && <div className="branding-feedback is-error" role="alert"><strong>À ajuster avant l’enregistrement</strong>{invalidColors && <p>Les couleurs doivent utiliser le format #RRGGBB.</p>}<ul>{issues.map(issue => <li key={issue.key + issue.message}>{issue.message}</li>)}</ul></div>}
    <section className="branding-live-preview" style={appearanceVariables(branding)} aria-label="Aperçu de l’interface">
      <aside><div className="branding-demo-logo">{preview || branding.logoUrl ? <img src={preview || branding.logoUrl} alt="" /> : "RH"}</div><strong>{organizationName}</strong><span className="is-active">Tableau de bord</span><span>Équipe</span><span>Communications</span></aside>
      <div><header>{branding.appName || "Plateforme RH"}<span>AD</span></header><main><p>Aperçu du brouillon</p><h4>Votre espace de travail</h4><article><strong>Une interface à votre image</strong><p>Les couleurs s’appliqueront à tous les utilisateurs après publication.</p><span className="branding-demo-action">Action principale</span></article></main></div>
    </section>
    <div className="settings-form-grid">
      <label className="settings-field"><span>En-tête des documents</span><select disabled={disabled} value={branding.documentHeaderStyle} onChange={e => patch({ documentHeaderStyle: e.target.value as BrandingSettings["documentHeaderStyle"] })}><option value="CLASSIC">Classique</option><option value="MINIMAL">Minimal</option><option value="PREMIUM">Premium</option></select></label>
      <label className="settings-field"><span>Pied de page des documents</span><select disabled={disabled} value={branding.documentFooterStyle} onChange={e => patch({ documentFooterStyle: e.target.value as BrandingSettings["documentFooterStyle"] })}><option value="CLASSIC">Classique</option><option value="MINIMAL">Minimal</option><option value="PREMIUM">Premium</option></select></label>
      <label className="branding-checkbox"><input type="checkbox" disabled={disabled} checked={branding.whiteLabelEnabled} onChange={e => patch({ whiteLabelEnabled: e.target.checked })} />Marque blanche</label>
      <label className="branding-checkbox"><input type="checkbox" disabled={disabled} checked={branding.showVendorSignature} onChange={e => patch({ showVendorSignature: e.target.checked })} />Afficher la signature fournisseur</label>
    </div>
    <details className="branding-advanced"><summary>Éléments documentaires et identité complémentaire</summary><div className="settings-form-grid">{(["printLogoUrl", "faviconUrl", "loginBackgroundUrl", "flagUrl", "countryWordmarkUrl"] as const).map(key => <label className="settings-field" key={key}><span>{{ printLogoUrl: "Logo d’impression", faviconUrl: "Icône du navigateur", loginBackgroundUrl: "Image de connexion", flagUrl: "Drapeau", countryWordmarkUrl: "Identité du pays" }[key]}</span><input disabled={disabled} value={branding[key] ?? ""} placeholder="https://… ou /brand/…" onChange={e => patch({ [key]: e.target.value })} /></label>)}</div></details>
    {confirm && <div ref={confirmation} className="branding-confirm" role="alertdialog" aria-label={confirm === "COLORS" ? "Réinitialiser les couleurs" : "Retirer le logo"}><strong>{confirm === "COLORS" ? "Revenir aux couleurs par défaut ?" : "Retirer le logo de l’entreprise ?"}</strong><p>{confirm === "COLORS" ? "Le nom, le logo et les réglages RH sont conservés. Un brouillon sera enregistré." : "La suppression prendra effet après publication. L’ancien fichier géré par la plateforme sera supprimé automatiquement."}</p><div><button type="button" className="settings-cancel-button" disabled={busy} onClick={() => setConfirm(null)}>Annuler</button><button type="button" className="settings-primary-button" disabled={busy} onClick={() => void perform(() => resetTenantSettingsAppearance(branding, expectedRevision, confirm === "LOGO"), "Réinitialisation enregistrée dans le brouillon. Publiez pour l’appliquer.")}>{busy ? <LoaderCircle className="is-spinning" size={17} /> : <Check size={17} />}Confirmer</button></div></div>}
  </section>;
}
