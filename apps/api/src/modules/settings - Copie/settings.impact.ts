import type { Types } from "mongoose";
import { AgentModel } from "../agents/agent.model.js";
import { OrganizationUnitModel } from "../organisation/organization.model.js";
import { UserModel } from "../users/user.model.js";
import type {
  SettingsDiffItem,
  SettingsImpact,
  SettingsSectionKey,
  TenantSettingsPayload,
} from "./settings.types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function sectionFromPath(path: string): SettingsSectionKey {
  return path.split(".")[0] as SettingsSectionKey;
}

export function buildSettingsDiff(
  previous: TenantSettingsPayload,
  next: TenantSettingsPayload,
): SettingsDiffItem[] {
  const diff: SettingsDiffItem[] = [];

  function walk(before: unknown, after: unknown, path: string): void {
    if (sameValue(before, after)) return;
    if (isPlainObject(before) && isPlainObject(after)) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      keys.forEach((key) => walk(before[key], after[key], path ? `${path}.${key}` : key));
      return;
    }
    diff.push({
      path,
      section: sectionFromPath(path),
      previousValue: before,
      nextValue: after,
    });
  }

  walk(previous, next, "");
  return diff.filter((item) => item.path);
}

const moduleMap: Record<SettingsSectionKey, string[]> = {
  institution: ["Documents officiels", "Évaluations", "Rapports", "Emails"],
  branding: ["Interface", "Connexion", "Documents officiels", "Emails"],
  organization: ["Organisation", "Agents", "Périmètres hiérarchiques"],
  attendance: ["Pointage", "Évaluations", "Rapports"],
  leave: ["Congés", "Évaluations", "Rapports"],
  tasks: ["Tâches", "Évaluations", "Rapports", "Notifications"],
  roadmaps: ["Feuilles de route", "Évaluations", "Rapports"],
  evaluations: ["Évaluations", "Rapports"],
  reports: ["Rapports", "Notifications"],
  documents: ["Documents RH", "Pièces justificatives"],
  notifications: ["Notifications", "Emails"],
  security: ["Authentification", "Sessions", "Gestion des utilisateurs"],
  numbering: ["Agents", "Évaluations", "Rapports"],
  featureFlags: ["Navigation", "API", "Modules actifs"],
};

export async function computeSettingsImpact(input: {
  tenantId: Types.ObjectId;
  active: TenantSettingsPayload;
  draft: TenantSettingsPayload;
}): Promise<SettingsImpact> {
  const diff = buildSettingsDiff(input.active, input.draft);
  const changedSections = [...new Set(diff.map((item) => item.section))];
  const affectedModules = [...new Set(changedSections.flatMap((section) => moduleMap[section]))];

  const [affectedAgents, affectedUsers, affectedOrganizationUnits] = await Promise.all([
    (AgentModel as any).countDocuments({ tenantId: input.tenantId, employmentStatus: "ACTIVE" }).exec(),
    (UserModel as any).countDocuments({ tenantId: input.tenantId, isActive: true }).exec(),
    (OrganizationUnitModel as any).countDocuments({ tenantId: input.tenantId, status: "ACTIVE" }).exec(),
  ]);

  const warnings: string[] = [];
  if (changedSections.includes("attendance")) warnings.push("Les nouveaux horaires n’altèrent pas les snapshots historiques déjà validés, sauf recalcul explicite.");
  if (changedSections.includes("leave")) warnings.push("Vérifiez la cohérence des soldes de congés existants avant publication.");
  if (changedSections.includes("evaluations")) warnings.push("Les critères et pondérations s’appliqueront aux nouvelles évaluations ou aux recalculs futurs.");
  if (changedSections.includes("featureFlags")) warnings.push("La désactivation d’un module masque ses écrans sans supprimer les données existantes.");
  if (changedSections.includes("security")) warnings.push("Une modification de sécurité peut affecter les sessions actives et les règles de connexion.");

  return {
    changedSections,
    changesCount: diff.length,
    affectedModules,
    affectedAgents,
    affectedUsers,
    affectedOrganizationUnits,
    warnings,
    diff: diff.slice(0, 250),
  };
}
