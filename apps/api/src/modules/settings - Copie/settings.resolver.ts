import { Types } from "mongoose";
import { TenantSettingsModel } from "./settings.model.js";
import type { TenantSettingsPayload } from "./settings.types.js";

export async function resolveTenantSettings(input: {
  tenantId: Types.ObjectId | string;
}): Promise<TenantSettingsPayload | null> {
  const record = await TenantSettingsModel.findOne({ tenantId: input.tenantId })
    .select("active")
    .lean()
    .exec();
  return (record?.active as TenantSettingsPayload | undefined) ?? null;
}

export async function isTenantFeatureEnabled(input: {
  tenantId: Types.ObjectId | string;
  feature: keyof TenantSettingsPayload["featureFlags"];
}): Promise<boolean> {
  const settings = await resolveTenantSettings({ tenantId: input.tenantId });
  return settings?.featureFlags[input.feature] ?? false;
}
