import { useTenantSettings } from "../../features/settings/settings.context";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { roleLabels } from "../../config/navigation";
import { useAuth } from "../../features/auth/auth.context";
import { getApiHealth } from "../../features/system/system.api";
import { getCurrentTenant } from "../../features/tenant/tenant.api";
import "./dashboard-home-page.css";

type MetricTone = "success" | "warning" | "neutral";

type Metric = {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: MetricTone;
};

function formatConakryDate(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Conakry",
  }).format(new Date());
}

export default function DashboardHomePage() {
  const { user } = useAuth();
  const { settings } = useTenantSettings();

  const healthQuery = useQuery({
    queryKey: ["api-health"],
    queryFn: getApiHealth,
    staleTime: 1000 * 30,
  });

  const tenantQuery = useQuery({
    queryKey: ["current-tenant"],
    queryFn: getCurrentTenant,
    staleTime: 1000 * 60 * 10,
  });

  const apiReady = healthQuery.data?.success === true;

  const databaseReady =
    healthQuery.data?.database.status === "connected";

  const metrics = useMemo<Metric[]>(
    () => [
      {
        label: "Organisation active",
        value: tenantQuery.data?.name ?? "Chargement...",
        helper: tenantQuery.data?.legalName ?? "Tenant en cours de lecture",
        icon: Building2,
        tone: tenantQuery.isError ? "warning" : "success",
      },
      {
        label: "Compte connecté",
        value: user?.fullName ?? "Utilisateur",
        helper: user ? roleLabels[user.role] : "Session en vérification",
        icon: UserRound,
        tone: "neutral",
      },
      {
        label: "API RH",
        value: healthQuery.isLoading
          ? "Vérification..."
          : apiReady
            ? "Opérationnelle"
            : "Indisponible",
        helper: healthQuery.data?.service ?? "État du serveur",
        icon: Activity,
        tone: apiReady ? "success" : "warning",
      },
      {
        label: "MongoDB Atlas",
        value: healthQuery.isLoading
          ? "Vérification..."
          : databaseReady
            ? "Connectée"
            : "À vérifier",
        helper: `État : ${
          healthQuery.data?.database.status ?? "inconnu"
        }`,
        icon: Database,
        tone: databaseReady ? "success" : "warning",
      },
    ],
    [
      apiReady,
      databaseReady,
      healthQuery.data?.database.status,
      healthQuery.data?.service,
      healthQuery.isLoading,
      tenantQuery.data?.legalName,
      tenantQuery.data?.name,
      tenantQuery.isError,
      user,
    ],
  );

  const implementationSteps = [
    {
      title: "Fondation technique",
      description:
        "Tenant , authentification, rôles, sessions et base de Données.",
      status: "Terminé",
      complete: true,
    },
    {
      title: "Noyau organisationnel",
      description:
        "Directions, services, utilisateurs et fiches agents.",
      status: "Prochaine étape",
      complete: false,
    },
    {
      title: "Pilotage RH",
      description:
        "Tâches, pointages, congés et cahiers de route.",
      status: "À planifier",
      complete: false,
    },
  ];

  const modules = [
    ["agents", "Gestion des agents"], ["tasks", "Tâches internes"], ["attendance", "Pointages"],
    ["leave", "Congés et absences"], ["roadmaps", "Feuilles de route"], ["evaluations", "Évaluations"],
    ["reports", "Rapports"], ["payroll", "Paie"],
  ].filter(([key]) => settings?.featureFlags[key as keyof typeof settings.featureFlags] === true).map(([,label]) => label);

  async function refreshDashboard(): Promise<void> {
    await Promise.all([
      healthQuery.refetch(),
      tenantQuery.refetch(),
    ]);
  }

  return (
    <section className="home-dashboard">
      <header className="home-dashboard-hero">
        <div>
          <p className="home-dashboard-eyebrow">
            {formatConakryDate()}
          </p>

          <h2>
            Bonjour, <span>{user?.fullName ?? "Utilisateur"}.</span>
          </h2>

 
        </div>

        <button
          className="dashboard-refresh-button"
          type="button"
          onClick={() => void refreshDashboard()}
          disabled={
            healthQuery.isFetching || tenantQuery.isFetching
          }
        >
          <RefreshCw
            size={18}
            className={
              healthQuery.isFetching || tenantQuery.isFetching
                ? "is-spinning"
                : ""
            }
          />
          <span>
            {healthQuery.isFetching || tenantQuery.isFetching
              ? "Actualisation..."
              : "Actualiser"}
          </span>
        </button>
      </header>

      {(healthQuery.isError || tenantQuery.isError) && (
        <div className="dashboard-system-alert">
          <ShieldCheck size={20} />
          <div>
            <strong>Vérification requise</strong>
            <p>
              Une partie des données de fondation est temporairement
              inaccessible. Vérifie que le serveur est démarré.
            </p>
          </div>
        </div>
      )}

      <section className="dashboard-metrics-grid">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <article
              key={metric.label}
              className={`dashboard-metric-card tone-${metric.tone}`}
            >
              <div className="dashboard-metric-icon">
                <Icon size={21} />
              </div>

              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <p>{metric.helper}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dashboard-home-grid">
        <article className="dashboard-panel dashboard-roadmap-panel">
          <div className="dashboard-panel-heading">
            <div>
              <p>FEUILLE DE ROUTE</p>
              <h3>Avancement de la plateforme</h3>
            </div>

            <span className="dashboard-panel-chip">MVP RH</span>
          </div>

          <div className="implementation-list">
            {implementationSteps.map((step) => (
              <div
                key={step.title}
                className={`implementation-item ${
                  step.complete ? "is-complete" : ""
                }`}
              >
                <span className="implementation-marker">
                  {step.complete ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <span />
                  )}
                </span>

                <div>
                  <div className="implementation-item-top">
                    <strong>{step.title}</strong>
                    <span>{step.status}</span>
                  </div>

                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-panel dashboard-modules-panel">
          <div className="dashboard-panel-heading">
            <div>
              <p>MODULES MÉTIER</p>
              <h3>Prochaines briques ERP</h3>
            </div>

            <Users size={22} />
          </div>

          <p className="dashboard-modules-description">
            Les modules activés pour votre organisation disposent de
            permissions, une interface responsive et des contrôles
            propres à chaque rôle.
          </p>

          <div className="dashboard-module-tags">
            {modules.map((module) => (
              <span key={module}>{module}</span>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}