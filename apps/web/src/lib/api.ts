import axios, {
  type AxiosHeaders,
  type InternalAxiosRequestConfig,
} from "axios";

const apiBaseUrl =
  String(import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1")
    .trim()
    .replace(/\/+$/, "");

const TENANT_STORAGE_KEY = "fades_tenant_slug";

function normalizeTenantSlug(value?: string | null): string | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized || null;
}

export function getSelectedTenantSlug(): string | null {
  if (typeof window === "undefined") return null;

  const querySlug = normalizeTenantSlug(
    new URLSearchParams(window.location.search).get("tenant"),
  );

  if (querySlug) {
    window.localStorage.setItem(TENANT_STORAGE_KEY, querySlug);
    return querySlug;
  }

  return normalizeTenantSlug(
    window.localStorage.getItem(TENANT_STORAGE_KEY),
  );
}

export function setSelectedTenantSlug(slug: string): void {
  if (typeof window === "undefined") return;

  const normalized = normalizeTenantSlug(slug);

  if (!normalized) {
    window.localStorage.removeItem(TENANT_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(TENANT_STORAGE_KEY, normalized);
}

export function clearSelectedTenantSlug(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TENANT_STORAGE_KEY);
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: 15_000,
  headers: {
    Accept: "application/json",
  },
});

function setTenantHeader(
  config: InternalAxiosRequestConfig,
  tenantSlug: string,
): void {
  const headers = config.headers as AxiosHeaders;

  if (typeof headers?.set === "function") {
    headers.set("x-tenant-slug", tenantSlug);
    return;
  }

  (config.headers as Record<string, string>)["x-tenant-slug"] =
    tenantSlug;
}

/**
 * IMPORTANT MULTI-TENANT
 *
 * On ne fixe plus jamais globalement :
 *
 *   "x-tenant-slug": VITE_TENANT_SLUG ?? ""
 *
 * car cela écrase le tenant nouvellement créé.
 *
 * L'ordre devient :
 * 1. ?tenant=slug dans l'URL de login ;
 * 2. slug mémorisé dans localStorage ;
 * 3. sinon aucun header : le backend utilisera son tenant par défaut
 *    uniquement pour le mode historique .
 */
api.interceptors.request.use((config) => {
  const tenantSlug = getSelectedTenantSlug();

  if (tenantSlug) {
    setTenantHeader(config, tenantSlug);
  } else if (
    config.headers &&
    typeof (config.headers as AxiosHeaders).delete === "function"
  ) {
    (config.headers as AxiosHeaders).delete("x-tenant-slug");
  }

  return config;
});
