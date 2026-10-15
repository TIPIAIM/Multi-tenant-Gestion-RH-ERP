import { applyAppearance } from "./settings.appearance";
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
  if (settings) applyAppearance(settings.branding);
}
