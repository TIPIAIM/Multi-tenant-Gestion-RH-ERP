 import { buildDefaultTenantSettings } from "./settings.defaults.js";
import type { TenantSettingsPayload } from "./settings.types.js";

/** Complète les paramètres sans modifier les choix déjà enregistrés. */
export function normalizeTenantSettings(
  value: TenantSettingsPayload,
  fallback?: TenantSettingsPayload,
): TenantSettingsPayload {
  const defaults = buildDefaultTenantSettings();

  const notifications = Object.assign(
    {},
    defaults.notifications,
    {
      trainingPopupEnabled:
        fallback?.notifications.trainingPopupEnabled ??
        defaults.notifications.trainingPopupEnabled,

      recruitmentPopupEnabled:
        fallback?.notifications.recruitmentPopupEnabled ??
        defaults.notifications.recruitmentPopupEnabled,
    },
    value.notifications,
  );

  return {
    ...value,

    training: {
      ...defaults.training,
      ...fallback?.training,
      ...value.training,
    },

    recruitment: {
      ...defaults.recruitment,
      ...fallback?.recruitment,
      ...value.recruitment,
    },

    notifications,

    featureFlags: {
      ...defaults.featureFlags,
      ...value.featureFlags,
    },
  };
}