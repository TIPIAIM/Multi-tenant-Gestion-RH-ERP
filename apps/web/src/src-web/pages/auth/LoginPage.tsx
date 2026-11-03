import { useTenantSettings } from "../../features/settings/settings.context";
import { useNavigate } from "react-router-dom";

import {
    useState,
    type ChangeEvent,
    type FormEvent,
  } from "react";
  import { useMutation } from "@tanstack/react-query";
  import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    Eye,
    EyeOff,
    LockKeyhole,
    Mail,
    ShieldCheck,
  } from "lucide-react";
  import { getApiErrorMessage } from "../../features/auth/auth.api";
  import { useAuth } from "../../features/auth/auth.context";
  import type { LoginInput } from "../../features/auth/auth.types";
  import "./login-page.css";
import TenantSelectionBootstrap from "../../features/tenant-registration/TenantSelectionBootstrap";
  //TenantSelectionBootstrap
  export default function LoginPage() {
    const { login } = useAuth();
    const { settings } = useTenantSettings();
    const navigate = useNavigate();
    const [formData, setFormData] = useState<LoginInput>({
      email: "",
      password: "",
    });
  
    const [showPassword, setShowPassword] = useState(false);
  
    const loginMutation = useMutation({
        mutationFn: login,
        onSuccess: () => {
          navigate("/dashboard", { replace: true });
        },
      });
  
    function handleChange(
      event: ChangeEvent<HTMLInputElement>,
    ): void {
      const { name, value } = event.target;
  
      setFormData((currentValue) => ({
        ...currentValue,
        [name]: value,
      }));
    }
  
    async function handleSubmit(
      event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
      event.preventDefault();
  
      loginMutation.reset();
  
      try {
        await loginMutation.mutateAsync({
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
        });
      } catch {
        // L'erreur est affichée dans l'interface.
      }
    }
  
    const errorMessage = loginMutation.isError
      ? getApiErrorMessage(loginMutation.error)
      : null;
  
    return (
      <main className="auth-page">
        <section className="auth-layout">
          <aside className="auth-brand-panel">
            <div className="brand-panel-content">
              {settings?.branding.logoUrl && <img className="auth-tenant-logo" src={settings.branding.logoUrl} alt={`Logo de ${settings.institution.shortName}`} />}
              
  
              <div className="brand-copy">
                <p className="auth-eyebrow">
                  VOTRE ESPACE RH
                </p>
  
                <h1>
                  L’ambition au service de 
                  <span> l’excellence.</span>
                </h1>
  
                <p>
                  Gérez vos équipes, vos activités et vos documents dans un espace sécurisé.
                </p>
              </div>
  
              <div className="brand-benefits">
                <div>
                  <ShieldCheck size={19} />
                  <span>Accès sécurisé par rôle</span>
                </div>
  
                <div>
                  <CheckCircle2 size={19} />
                  <span>Suivi RH centralisé</span>
                </div>
  
                <div>
                  <ArrowRight size={19} />
                  <span>Pilotage des services en temps réel</span>
                </div>
              </div>
            </div>
  
            <div className="brand-decoration brand-decoration-one" />
            <div className="brand-decoration brand-decoration-two" />
          </aside>
  
          <section className="auth-form-panel">
            <div className="auth-form-wrapper">
              <div className="form-heading">
                <span className="form-badge">PLATEFORME-RH</span>
  
                <h2>Connexion à votre espace</h2>
  
                <p>
                  Saisissez vos identifiants professionnels pour accéder
                  à la plateforme.
                </p>
              </div>
  
              {errorMessage && (
                <div
                  className="form-feedback error"
                  role="alert"
                  aria-live="assertive"
                >
                  <AlertCircle size={19} />
                  <span>{errorMessage}</span>
                </div>
              )}
  
              <form
                className="login-form"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="form-field">
                  <label htmlFor="email">
                    Adresse email professionnelle
                  </label>
  
                  <div className="input-wrapper">
                    <Mail size={19} />
  
                    <input
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="nom@gn.com"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={loginMutation.isPending}
                      required
                    />
                  </div>
                </div>
  
                <div className="form-field">
                  <div className="password-label-row">
                    <label htmlFor="password">Mot de passe</label>
  
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        window.alert(
                          "La réinitialisation du mot de passe sera activée dans le module de gestion des comptes.",
                        );
                      }}
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
  
                  <div className="input-wrapper password-wrapper">
                    <LockKeyhole size={19} />
  
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Votre mot de passe"
                      value={formData.password}
                      onChange={handleChange}
                      disabled={loginMutation.isPending}
                      required
                    />
  
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() =>
                        setShowPassword((currentValue) => !currentValue)
                      }
                      aria-label={
                        showPassword
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={19} />
                      ) : (
                        <Eye size={19} />
                      )}
                    </button>
                  </div>
                </div>
  
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    loginMutation.isPending ||
                    !formData.email.trim() ||
                    !formData.password
                  }
                >
                  <span>
                    {loginMutation.isPending
                      ? "Connexion sécurisée..."
                      : "Se connecter"}
                  </span>
  
                  {!loginMutation.isPending && (
                    <ArrowRight size={19} />
                  )}
                </button>
                <TenantSelectionBootstrap />
              </form>
  
              <div className="auth-security-note">
                <ShieldCheck size={18} />
                <p>
                  Cet accès est réservé aux utilisateurs autorisés de votre organisation.
                </p>
              </div>
  
              <p className="auth-footer">
                {settings?.branding.appName ?? "Plateforme RH"} · Espace sécurisé
              </p>
            </div>
          </section>
       

        </section>
      </main>
    );
  }