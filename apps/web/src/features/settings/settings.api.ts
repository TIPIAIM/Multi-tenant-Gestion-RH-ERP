import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  PublicTenantSettings,
  SettingsImpact,
  SettingsRecordResponse,
  SettingsRevisionList,
  SettingsSectionKey,
} from "./settings.types";

export async function getPublicTenantSettings(): Promise<PublicTenantSettings> {
  const response = await api.get<ApiSuccess<PublicTenantSettings>>("/settings/public");
  return response.data.data;
}

export async function getTenantSettings(): Promise<SettingsRecordResponse> {
  const response = await api.get<ApiSuccess<SettingsRecordResponse>>("/settings");
  return response.data.data;
}

export async function saveTenantSettingsSection(
  section: SettingsSectionKey,
  value: unknown,
): Promise<SettingsRecordResponse> {
  const response = await api.patch<ApiSuccess<SettingsRecordResponse>>(`/settings/draft/${section}`, { value });
  return response.data.data;
}

export async function validateTenantSettingsDraft(): Promise<{
  valid: boolean;
  maturity: SettingsRecordResponse["maturity"];
  impact: SettingsImpact | null;
}> {
  const response = await api.post<ApiSuccess<{
    valid: boolean;
    maturity: SettingsRecordResponse["maturity"];
    impact: SettingsImpact | null;
  }>>("/settings/draft/validate");
  return response.data.data;
}

export async function getTenantSettingsImpact(): Promise<SettingsImpact> {
  const response = await api.get<ApiSuccess<SettingsImpact>>("/settings/impact");
  return response.data.data;
}

export async function publishTenantSettings(reason: string): Promise<SettingsRecordResponse> {
  const response = await api.post<ApiSuccess<SettingsRecordResponse>>("/settings/publish", { reason });
  return response.data.data;
}

export async function discardTenantSettingsDraft(): Promise<SettingsRecordResponse> {
  const response = await api.post<ApiSuccess<SettingsRecordResponse>>("/settings/draft/discard");
  return response.data.data;
}

export async function getTenantSettingsHistory(page = 1, limit = 20): Promise<SettingsRevisionList> {
  const response = await api.get<ApiSuccess<SettingsRevisionList>>("/settings/history", { params: { page, limit } });
  return response.data.data;
}

export async function restoreTenantSettingsVersion(version: number, reason: string): Promise<SettingsRecordResponse> {
  const response = await api.post<ApiSuccess<SettingsRecordResponse>>(`/settings/history/${version}/restore`, { reason });
  return response.data.data;
}

export async function downloadTenantSettingsExport(): Promise<void> {
  const response = await api.get<Blob>("/settings/export.json", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "configuration-tenant.json";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
