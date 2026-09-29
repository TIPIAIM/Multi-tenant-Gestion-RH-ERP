export const reservedTenantSlugs = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "dashboard",
  "fades",
  "help",
  "login",
  "logout",
  "public",
  "register",
  "root",
  "settings",
  "signup",
  "support",
  "system",
  "tenants",
  "www",
]);

export function normalizeTenantSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

export function isTenantSlugReserved(slug: string): boolean {
  return reservedTenantSlugs.has(normalizeTenantSlug(slug));
}
