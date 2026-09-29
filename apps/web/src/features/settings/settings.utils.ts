import type {
  SettingsSectionKey,
  TenantSettingsPayload,
} from "./settings.types";

export const settingsSectionLabels: Record<SettingsSectionKey, string> = {
  institution: "Institution",
  branding: "Identité & marque",
  organization: "Organisation",
  attendance: "Pointage",
  leave: "Congés",
  tasks: "Tâches",
  roadmaps: "Feuilles de route",
  evaluations: "Évaluations",
  reports: "Rapports",
  documents: "Documents",
  notifications: "Notifications",
  security: "Sécurité",
  numbering: "Numérotation",
  featureFlags: "Fonctionnalités",
};

export function cloneSettings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isSameSettingsValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function getEnabledModules(settings: TenantSettingsPayload): string[] {
  return Object.entries(settings.featureFlags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}

export function applyBrandingVariables(settings?: TenantSettingsPayload | null): void {
  if (!settings || typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--tenant-primary", settings.branding.primaryColor);
  root.style.setProperty("--tenant-secondary", settings.branding.secondaryColor);
  root.style.setProperty("--tenant-accent", settings.branding.accentColor);
  root.style.setProperty("--tenant-danger", settings.branding.dangerColor);
  document.title = settings.branding.appName || settings.institution.shortName;

  if (settings.branding.faviconUrl) {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = settings.branding.faviconUrl;
  }
}
