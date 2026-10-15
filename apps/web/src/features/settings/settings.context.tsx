import { useLocation } from "react-router-dom";
import { createContext, useContext, useLayoutEffect, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/auth.context";
import { getPublicTenantSettings } from "./settings.api";
import { applyAppearance, resetAppearanceVariables } from "./settings.appearance";
import type { PublicTenantSettings } from "./settings.types";

const SettingsContext = createContext<{
  settings: PublicTenantSettings | null; isLoading: boolean; isError: boolean; refetch: () => Promise<unknown>;
}>({ settings: null, isLoading: true, isError: false, refetch: async () => undefined });
export function TenantSettingsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const location = useLocation();
  const selectedSlug = new URLSearchParams(location.search).get("tenant")?.trim().toLowerCase();
  const enabled = Boolean(user?.tenantId || selectedSlug);
  const query = useQuery({
    queryKey: ["tenant-settings", "public", user?.tenantId ?? `public:${selectedSlug ?? ""}`], queryFn: getPublicTenantSettings,
    enabled, staleTime: 30_000, retry: 1,
    refetchOnWindowFocus: true, refetchInterval: user ? 60_000 : false,
  });
  useLayoutEffect(() => {
    if (enabled && query.data) {
      applyAppearance(query.data.branding);
      document.title = query.data.branding.appName || query.data.institution.shortName || "Plateforme RH";
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (icon) icon.href = query.data.branding.faviconUrl || query.data.branding.logoUrl || "/favicon.svg";
    } else {
      resetAppearanceVariables(); document.title = "Plateforme RH";
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]'); if (icon) icon.href = "/favicon.svg";
    }
    return () => resetAppearanceVariables();
  }, [user?.tenantId, selectedSlug, enabled, query.data]);
  return <SettingsContext.Provider value={{ settings: enabled ? query.data ?? null : null, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch }}>{children}</SettingsContext.Provider>;
}
export function useTenantSettings() { return useContext(SettingsContext); }
