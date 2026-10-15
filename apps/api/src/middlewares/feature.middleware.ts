import type { RequestHandler } from "express";
import { AppError } from "../core/errors/app-error.js";
import { resolveTenantSettings } from "../modules/settings/settings.resolver.js";
import { buildDefaultTenantSettings } from "../modules/settings/settings.defaults.js";
import type { FeatureFlagSettings } from "../modules/settings/settings.types.js";
export function requireTenantFeature(
  feature: keyof FeatureFlagSettings,
): RequestHandler {
  return async (request, _response, next) => {
    try {
      if (!request.tenant)
        throw new AppError("Organisation introuvable.", 401, "TENANT_REQUIRED");
      const settings = await resolveTenantSettings({
        tenantId: request.tenant._id,
      });
      if (
        !(
          settings?.featureFlags[feature] ??
          buildDefaultTenantSettings().featureFlags[feature]
        )
      ) {
        throw new AppError(
          "Ce module est désactivé pour votre organisation.",
          403,
          "MODULE_DISABLED",
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
