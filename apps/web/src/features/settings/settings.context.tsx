import { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPublicTenantSettings } from "./settings.api";
import type { PublicTenantSettings } from "./settings.types";

const SettingsContext = createContext<{
  settings: PublicTenantSettings | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}>({ settings: null, isLoading: true, refetch: async () => undefined });

export function TenantSettingsProvider({ children }: PropsWithChildren) {
  const query = useQuery({
    queryKey: ["tenant-settings", "public"],
    queryFn: getPublicTenantSettings,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    const settings = query.data;
    if (!settings || typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--tenant-primary", settings.branding.primaryColor);
    root.style.setProperty("--tenant-secondary", settings.branding.secondaryColor);
    root.style.setProperty("--tenant-accent", settings.branding.accentColor);
    root.style.setProperty("--tenant-danger", settings.branding.dangerColor);
    document.title = (settings.branding.appName || settings.institution.shortName)
      .replace(/\bfades(?:-rh)?\b/gi, "Plateforme RH");
  }, [query.data]);

  return (
    <SettingsContext.Provider value={{
      settings: query.data ?? null,
      isLoading: query.isLoading,
      refetch: query.refetch,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useTenantSettings() {
  return useContext(SettingsContext);
}
