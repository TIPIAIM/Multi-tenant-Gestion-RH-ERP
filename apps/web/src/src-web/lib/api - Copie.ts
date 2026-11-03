import axios, { type InternalAxiosRequestConfig } from "axios";

const apiBaseUrl = String(import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1")
  .trim().replace(/\/+$/, "");
const TENANT_STORAGE_KEY = "fades_tenant_slug";

function normalizeTenantSlug(value?: string | null): string | null {
  return String(value ?? "").trim().toLowerCase() || null;
}
function getExplicitTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  return normalizeTenantSlug(new URLSearchParams(window.location.search).get("tenant"));
}
export function getSelectedTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  const querySlug = getExplicitTenantSlug();
  if (querySlug) {
    setSelectedTenantSlug(querySlug);
    return querySlug;
  }
  try { return normalizeTenantSlug(window.localStorage.getItem(TENANT_STORAGE_KEY)); }
  catch { return null; }
}
export function setSelectedTenantSlug(slug: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeTenantSlug(slug);
  try {
    if (normalized) window.localStorage.setItem(TENANT_STORAGE_KEY, normalized);
    else window.localStorage.removeItem(TENANT_STORAGE_KEY);
  } catch { /* La connexion reste possible lorsque le stockage est bloqué. */ }
}
export function clearSelectedTenantSlug(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(TENANT_STORAGE_KEY); } catch { /* Stockage indisponible. */ }
}
export const api = axios.create({
  baseURL: apiBaseUrl, withCredentials: true, timeout: 15_000,
  headers: { Accept: "application/json" },
});
function setTenantHeader(config: InternalAxiosRequestConfig, slug: string): void {
  config.headers.set("x-tenant-slug", slug);
}
api.interceptors.request.use((config) => {
  const isLoginRequest = /\/auth\/login\/?(?:\?|$)/.test(config.url ?? "");
  // Les anciennes sélections ne doivent pas limiter une connexion ordinaire.
  const tenantSlug = isLoginRequest ? getExplicitTenantSlug() : getSelectedTenantSlug();
  if (tenantSlug) setTenantHeader(config, tenantSlug);
  else config.headers.delete("x-tenant-slug");
  return config;
});
