import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  Palette,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  checkTenantSlugAvailability,
  registerTenantFromInterface,
} from "../../features/tenant-registration/tenant-registration.api";
import type {
  SelfRegisterTenantInput,
  SelfRegisterTenantResult,
  TenantSlugAvailability,
} from "../../features/tenant-registration/tenant-registration.types";
import "./create-workspace-page.css";

const initialForm: SelfRegisterTenantInput = {
  organization: {
    name: "",
    legalName: "",
    slug: "",
    contactPhone: "",
    address: "",
  },
  administrator: {
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  },
  branding: {
    primaryColor: "#046242",
    secondaryColor: "#0B2536",
    accentColor: "#E9B521",
  },
  termsAccepted: false,
  website: "",
};

function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "response" in error
  ) {
    const response = (error as { response?: { data?: { message?: string; error?: { message?: string } } } }).response;
    return response?.data?.message ?? response?.data?.error?.message ?? "La création de l’espace a échoué.";
  }
  if (error instanceof Error) return error.message;
  return "La création de l’espace a échoué.";
}

function passwordChecks(password: string) {
  return [
    { label: "12 caractères minimum", valid: password.length >= 12 },
    { label: "Une majuscule et une minuscule", valid: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "Au moins un chiffre", valid: /\d/.test(password) },
    { label: "Au moins un caractère spécial", valid: /[^A-Za-z0-9]/.test(password) },
  ];
}

export default function CreateWorkspacePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SelfRegisterTenantInput>(initialForm);
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<TenantSlugAvailability | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SelfRegisterTenantResult | null>(null);

  const checks = useMemo(
    () => passwordChecks(form.administrator.password),
    [form.administrator.password],
  );

  const passwordStrong = checks.every((item) => item.valid);
  const passwordsMatch =
    form.administrator.confirmPassword.length > 0 &&
    form.administrator.password === form.administrator.confirmPassword;

  useEffect(() => {
    if (slugEdited) return;
    setForm((current) => ({
      ...current,
      organization: {
        ...current.organization,
        slug: normalizeSlug(current.organization.name),
      },
    }));
  }, [form.organization.name, slugEdited]);

  useEffect(() => {
    const slug = normalizeSlug(form.organization.slug);
    setSlugStatus(null);

    if (slug.length < 2) return;

    const timer = window.setTimeout(async () => {
      setSlugChecking(true);
      try {
        setSlugStatus(await checkTenantSlugAvailability(slug));
      } catch {
        setSlugStatus(null);
      } finally {
        setSlugChecking(false);
      }
    }, 420);

    return () => window.clearTimeout(timer);
  }, [form.organization.slug]);

  const organizationValid = Boolean(
    form.organization.name.trim().length >= 2 &&
      form.organization.legalName.trim().length >= 2 &&
      form.organization.slug.trim().length >= 2 &&
      slugStatus?.available,
  );

  const administratorValid = Boolean(
    form.administrator.fullName.trim().length >= 2 &&
      /^\S+@\S+\.\S+$/.test(form.administrator.email.trim()) &&
      passwordStrong &&
      passwordsMatch,
  );

  function updateOrganization<Key extends keyof SelfRegisterTenantInput["organization"]>(
    key: Key,
    value: SelfRegisterTenantInput["organization"][Key],
  ) {
    setForm((current) => ({
      ...current,
      organization: { ...current.organization, [key]: value },
    }));
  }

  function updateAdministrator<Key extends keyof SelfRegisterTenantInput["administrator"]>(
    key: Key,
    value: SelfRegisterTenantInput["administrator"][Key],
  ) {
    setForm((current) => ({
      ...current,
      administrator: { ...current.administrator, [key]: value },
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!organizationValid || !administratorValid || !form.termsAccepted) {
      setError("Vérifiez les informations obligatoires avant de créer votre espace.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await registerTenantFromInterface({
        ...form,
        organization: {
          ...form.organization,
          slug: normalizeSlug(form.organization.slug),
        },
      });
      setCreated(result);
    } catch (submissionError) {
      setError(getErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <main className="workspace-registration-page">
        <div className="workspace-registration-success">
          <div className="workspace-success-icon"><CheckCircle2 size={34} /></div>
          <span className="workspace-kicker">ESPACE CRÉÉ AVEC SUCCÈS</span>
          <h1>{created.tenant.name} est prêt.</h1>
          <p>
            Le compte administrateur principal a été créé et votre session sécurisée est déjà ouverte.
            Vous pouvez maintenant compléter la configuration et inviter votre équipe.
          </p>
          <div className="workspace-success-summary">
            <div><span>Espace</span><strong>{created.tenant.slug}</strong></div>
            <div><span>Administrateur</span><strong>{created.administrator.email}</strong></div>
            <div><span>Rôle initial</span><strong>Administrateur du tenant</strong></div>
          </div>
          <button
            type="button"
            className="workspace-primary-button"
            onClick={() => window.location.assign("/dashboard")}
          >
            Ouvrir mon tableau de bord <ArrowRight size={18} />
          </button>
          <small>
            La configuration premium du tenant sera initialisée lors du premier accès au Centre d’administration.
          </small>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-registration-page">
      <section className="workspace-registration-shell">
        <aside className="workspace-registration-aside">
          <div className="workspace-brand-mark">FR</div>
          <div>
            <span className="workspace-kicker">RH · MULTI-TENANT</span>
            <h1>Créez votre espace RH sécurisé.</h1>
            <p>
              Une organisation, ses données, ses règles, son identité visuelle et ses utilisateurs :
              chaque tenant reste isolé dès sa création.
            </p>
          </div>

          <div className="workspace-benefits">
            <div><ShieldCheck size={18} /><span>Isolation stricte des données par organisation</span></div>
            <div><Palette size={18} /><span>Branding et configuration personnalisables</span></div>
            <div><BadgeCheck size={18} /><span>Administrateur principal créé automatiquement</span></div>
            <div><Sparkles size={18} /><span>Prêt pour les modules RH premium</span></div>
          </div>

          <div className="workspace-preview-card">
            <span>APERÇU DE VOTRE ESPACE</span>
            <strong>{form.organization.name.trim() || "Votre organisation"}</strong>
            <small>Identifiant : {normalizeSlug(form.organization.slug) || "mon-organisation"}</small>
            <div className="workspace-preview-colors">
              <i style={{ background: form.branding?.primaryColor }} />
              <i style={{ background: form.branding?.secondaryColor }} />
              <i style={{ background: form.branding?.accentColor }} />
            </div>
          </div>
        </aside>

        <section className="workspace-registration-card">
          <header className="workspace-registration-header">
            <div>
              <span>CRÉATION D’ESPACE</span>
              <h2>{step === 1 ? "Votre organisation" : step === 2 ? "Compte administrateur" : "Vérification finale"}</h2>
            </div>
            <button type="button" className="workspace-login-link" onClick={() => navigate("/login")}>Se connecter</button>
          </header>

          <div className="workspace-stepper">
            {[1, 2, 3].map((item) => (
              <div key={item} className={item <= step ? "active" : ""}>
                <span>{item < step ? <Check size={15} /> : item}</span>
                <small>{item === 1 ? "Organisation" : item === 2 ? "Administrateur" : "Validation"}</small>
              </div>
            ))}
          </div>

          <form onSubmit={submit}>
            {step === 1 && (
              <div className="workspace-form-section">
                <div className="workspace-form-grid two-columns">
                  <label>
                    <span>Nom usuel *</span>
                    <div className="workspace-input"><Building2 size={18} /><input value={form.organization.name} onChange={(e) => updateOrganization("name", e.target.value)} placeholder="Ex. Horizon Consulting" autoFocus /></div>
                  </label>
                  <label>
                    <span>Dénomination légale *</span>
                    <div className="workspace-input"><Building2 size={18} /><input value={form.organization.legalName} onChange={(e) => updateOrganization("legalName", e.target.value)} placeholder="Ex. Horizon Consulting SARL" /></div>
                  </label>
                </div>

                <label>
                  <span>Identifiant de l’espace *</span>
                  <div className={`workspace-input workspace-slug-input ${slugStatus?.available ? "available" : slugStatus && !slugStatus.available ? "unavailable" : ""}`}>
                    <span className="workspace-slug-prefix"> rh /</span>
                    <input
                      value={form.organization.slug}
                      onChange={(e) => { setSlugEdited(true); updateOrganization("slug", normalizeSlug(e.target.value)); }}
                      placeholder="mon-organisation"
                    />
                    {slugChecking && <LoaderCircle size={17} className="is-spinning" />}
                    {!slugChecking && slugStatus?.available && <CheckCircle2 size={17} />}
                    {!slugChecking && slugStatus && !slugStatus.available && <CircleAlert size={17} />}
                  </div>
                  <small className={slugStatus?.available ? "workspace-field-success" : slugStatus && !slugStatus.available ? "workspace-field-error" : ""}>
                    {slugStatus?.available
                      ? "Cet identifiant est disponible."
                      : slugStatus?.reason === "RESERVED"
                        ? "Cet identifiant est réservé."
                        : slugStatus?.reason === "ALREADY_USED"
                          ? "Cet identifiant est déjà utilisé."
                          : "Il sera utilisé pour identifier votre organisation dans la plateforme."}
                  </small>
                </label>

                <div className="workspace-form-grid two-columns">
                  <label>
                    <span>Téléphone</span>
                    <div className="workspace-input"><Phone size={18} /><input value={form.organization.contactPhone ?? ""} onChange={(e) => updateOrganization("contactPhone", e.target.value)} placeholder="+224 ..." /></div>
                  </label>
                  <label>
                    <span>Adresse</span>
                    <div className="workspace-input"><MapPin size={18} /><input value={form.organization.address ?? ""} onChange={(e) => updateOrganization("address", e.target.value)} placeholder="Ville, quartier, pays" /></div>
                  </label>
                </div>

                <div className="workspace-branding-mini">
                  <div><Palette size={18} /><div><strong>Identité visuelle initiale</strong><span>Modifiable ensuite dans Configuration.</span></div></div>
                  <div className="workspace-color-fields">
                    <label><span>Principale</span><input type="color" value={form.branding?.primaryColor} onChange={(e) => setForm((current) => ({ ...current, branding: { ...current.branding!, primaryColor: e.target.value } }))} /></label>
                    <label><span>Secondaire</span><input type="color" value={form.branding?.secondaryColor} onChange={(e) => setForm((current) => ({ ...current, branding: { ...current.branding!, secondaryColor: e.target.value } }))} /></label>
                    <label><span>Accent</span><input type="color" value={form.branding?.accentColor} onChange={(e) => setForm((current) => ({ ...current, branding: { ...current.branding!, accentColor: e.target.value } }))} /></label>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="workspace-form-section">
                <div className="workspace-admin-note">
                  <ShieldCheck size={21} />
                  <div><strong>Compte propriétaire de l’espace</strong><span>Ce premier utilisateur recevra le rôle TENANT_ADMIN et pourra ensuite créer les autres comptes.</span></div>
                </div>

                <label>
                  <span>Nom complet *</span>
                  <div className="workspace-input"><UserRound size={18} /><input value={form.administrator.fullName} onChange={(e) => updateAdministrator("fullName", e.target.value)} placeholder="Nom et prénom" autoFocus /></div>
                </label>

                <label>
                  <span>E-mail professionnel *</span>
                  <div className="workspace-input"><Mail size={18} /><input type="email" value={form.administrator.email} onChange={(e) => updateAdministrator("email", e.target.value)} placeholder="admin@organisation.com" /></div>
                </label>

                <div className="workspace-form-grid two-columns">
                  <label>
                    <span>Mot de passe *</span>
                    <div className="workspace-input"><KeyRound size={18} /><input type={showPassword ? "text" : "password"} value={form.administrator.password} onChange={(e) => updateAdministrator("password", e.target.value)} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Afficher le mot de passe">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
                  </label>
                  <label>
                    <span>Confirmation *</span>
                    <div className={`workspace-input ${form.administrator.confirmPassword ? (passwordsMatch ? "available" : "unavailable") : ""}`}><LockKeyhole size={18} /><input type={showConfirmation ? "text" : "password"} value={form.administrator.confirmPassword} onChange={(e) => updateAdministrator("confirmPassword", e.target.value)} autoComplete="new-password" /><button type="button" onClick={() => setShowConfirmation((value) => !value)} aria-label="Afficher la confirmation">{showConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
                  </label>
                </div>

                <div className="workspace-password-checks">
                  {checks.map((item) => <span key={item.label} className={item.valid ? "valid" : ""}><Check size={14} /> {item.label}</span>)}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="workspace-form-section">
                <div className="workspace-review-card">
                  <header><Building2 size={20} /><div><strong>{form.organization.name}</strong><span>{form.organization.legalName}</span></div></header>
                  <dl>
                    <div><dt>Identifiant</dt><dd>{form.organization.slug}</dd></div>
                    <div><dt>Administrateur</dt><dd>{form.administrator.fullName}</dd></div>
                    <div><dt>E-mail</dt><dd>{form.administrator.email}</dd></div>
                    <div><dt>Rôle initial</dt><dd>TENANT_ADMIN</dd></div>
                  </dl>
                </div>

                <div className="workspace-security-card">
                  <ShieldCheck size={21} />
                  <div><strong>Isolation multi-tenant dès la création</strong><span>L’organisation et son administrateur sont liés au même tenant. Les modules existants continueront d’appliquer tenantId et les contrôles de périmètre.</span></div>
                </div>

                <label className="workspace-terms-row">
                  <input type="checkbox" checked={form.termsAccepted} onChange={(e) => setForm((current) => ({ ...current, termsAccepted: e.target.checked }))} />
                  <span>J’accepte les conditions d’utilisation et confirme être habilité à créer cet espace pour l’organisation.</span>
                </label>

                <label className="workspace-honeypot" aria-hidden="true">
                  Site web
                  <input tabIndex={-1} autoComplete="off" value={form.website ?? ""} onChange={(e) => setForm((current) => ({ ...current, website: e.target.value }))} />
                </label>
              </div>
            )}

            {error && <div className="workspace-error-banner"><CircleAlert size={18} /><span>{error}</span></div>}

            <footer className="workspace-form-actions">
              {step > 1 ? (
                <button type="button" className="workspace-secondary-button" onClick={() => { setError(null); setStep((current) => current - 1); }} disabled={submitting}><ArrowLeft size={17} /> Retour</button>
              ) : <span />}

              {step < 3 ? (
                <button
                  type="button"
                  className="workspace-primary-button"
                  disabled={step === 1 ? !organizationValid : !administratorValid}
                  onClick={() => { setError(null); setStep((current) => current + 1); }}
                >
                  Continuer <ArrowRight size={17} />
                </button>
              ) : (
                <button type="submit" className="workspace-primary-button" disabled={submitting || !form.termsAccepted}>
                  {submitting ? <><LoaderCircle size={18} className="is-spinning" /> Création sécurisée...</> : <>Créer mon espace <Sparkles size={18} /></>}
                </button>
              )}
            </footer>
          </form>
        </section>
      </section>
    </main>
  );
}
