import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import type {
  SettingsActor,
  SettingsActorRole,
  SettingsSectionKey,
} from "./settings.types.js";

const acceptedRoles: SettingsActorRole[] = [
  "TENANT_ADMIN",
  "DIRECTION",
  "RH_MANAGER",
  "SERVICE_MANAGER",
  "AGENT",
];

const hrManagedSections = new Set<SettingsSectionKey>([
  "attendance",
  "leave",
  "tasks",
  "roadmaps",
  "evaluations",
  "reports",
  "documents",
  "notifications",
  "numbering",
]);

export async function resolveSettingsActor(
  tenant: TenantDocument,
  userId: string,
): Promise<SettingsActor> {
  const user = (await (UserModel as any)
    .findOne({ _id: userId, tenantId: tenant._id, isActive: true })
    .select("_id fullName role")
    .lean()
    .exec()) as { _id: Types.ObjectId; fullName?: string; role?: string } | null;

  if (!user) {
    throw new AppError("Votre session utilisateur est invalide ou inactive.", 401, "SETTINGS_ACTOR_NOT_FOUND");
  }

  const role = user.role as SettingsActorRole;
  if (!acceptedRoles.includes(role)) {
    throw new AppError("Votre rôle ne permet pas d’accéder au Centre d’administration.", 403, "SETTINGS_ROLE_FORBIDDEN");
  }

  return {
    userId: user._id,
    fullName: user.fullName?.trim() || "Utilisateur",
    role,
  };
}

export function assertCanViewSettings(actor: SettingsActor): void {
  if (["TENANT_ADMIN", "RH_MANAGER", "DIRECTION", "SERVICE_MANAGER"].includes(actor.role)) return;
  throw new AppError("La consultation de la configuration n’est pas autorisée pour ce rôle.", 403, "SETTINGS_VIEW_FORBIDDEN");
}

export function assertCanManageSettingsSection(actor: SettingsActor, section: SettingsSectionKey): void {
  if (actor.role === "TENANT_ADMIN") return;
  if (actor.role === "RH_MANAGER" && hrManagedSections.has(section)) return;
  throw new AppError("Vous ne pouvez pas modifier cette section de configuration.", 403, "SETTINGS_SECTION_MANAGE_FORBIDDEN");
}

export function assertCanPublishSettings(actor: SettingsActor): void {
  if (actor.role === "TENANT_ADMIN") return;
  throw new AppError("La publication d’une configuration est réservée à l’administrateur du tenant.", 403, "SETTINGS_PUBLISH_FORBIDDEN");
}

export function assertCanRestoreSettings(actor: SettingsActor): void {
  if (actor.role === "TENANT_ADMIN") return;
  throw new AppError("La restauration d’une version est réservée à l’administrateur du tenant.", 403, "SETTINGS_RESTORE_FORBIDDEN");
}
