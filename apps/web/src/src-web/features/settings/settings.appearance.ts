import type { CSSProperties } from "react";
import type { BrandingSettings } from "./settings.types";
import { contrastRatio } from "./settings.colors";
export const DEFAULT_APPEARANCE = {
  primaryColor: "#046242", secondaryColor: "#0B2536", accentColor: "#E9B521", dangerColor: "#DF3B29",
  sidebarBackgroundColor: "#0B2536", sidebarTextColor: "#D7E3E8", sidebarActiveColor: "#046242",
  pageBackgroundColor: "#F5F7FA", surfaceColor: "#FFFFFF", textColor: "#172F3B", mutedTextColor: "#526774", borderColor: "#DCE5E9",
  topbarBackgroundColor: "#FFFFFF", topbarTextColor: "#0B2536",
} as const;
export type AppearanceColorKey = keyof typeof DEFAULT_APPEARANCE;
export function resolveAppearance(branding?: Partial<BrandingSettings> | null): Record<AppearanceColorKey, string> {
  const result = {} as Record<AppearanceColorKey, string>;
  for (const key of Object.keys(DEFAULT_APPEARANCE) as AppearanceColorKey[]) {
    const value = branding?.[key]; result[key] = value && /^#[a-f\d]{6}$/i.test(value) ? value : DEFAULT_APPEARANCE[key];
  }
  return result;
}
export function readableForeground(background: string): string {
  return contrastRatio("#FFFFFF", background) >= contrastRatio("#0B1016", background) ? "#FFFFFF" : "#0B1016";
}
export function appearanceVariables(branding?: Partial<BrandingSettings> | null): CSSProperties {
  const c = resolveAppearance(branding);
  return {
    "--tenant-primary": c.primaryColor, "--tenant-secondary": c.secondaryColor,
    "--tenant-accent": c.accentColor, "--tenant-danger": c.dangerColor,
    "--tenant-sidebar-bg": c.sidebarBackgroundColor, "--tenant-sidebar-text": c.sidebarTextColor,
    "--tenant-sidebar-active": c.sidebarActiveColor, "--tenant-on-sidebar-active": readableForeground(c.sidebarActiveColor),
    "--tenant-page-bg": c.pageBackgroundColor, "--tenant-surface": c.surfaceColor,
    "--tenant-text": c.textColor, "--tenant-muted": c.mutedTextColor, "--tenant-border": c.borderColor,
    "--tenant-topbar-bg": c.topbarBackgroundColor, "--tenant-topbar-text": c.topbarTextColor,
    "--tenant-on-primary": readableForeground(c.primaryColor),
    "--tenant-link": contrastRatio(c.primaryColor, c.surfaceColor) >= 4.5 ? c.primaryColor : c.textColor,
    "--tenant-color-scheme": readableForeground(c.surfaceColor) === "#FFFFFF" ? "dark" : "light",
    "--ui-primary": c.primaryColor, "--ui-navy": c.textColor, "--ui-muted": c.mutedTextColor,
    "--ui-border": c.borderColor, "--ui-surface": c.surfaceColor, "--ui-background": c.pageBackgroundColor,
    "--ui-danger": c.dangerColor,
  } as CSSProperties;
}
export function applyAppearance(branding?: Partial<BrandingSettings> | null): void {
  if (typeof document === "undefined") return;
  for (const [key, value] of Object.entries(appearanceVariables(branding))) document.documentElement.style.setProperty(key, String(value));
}
export function resetAppearanceVariables(): void {
  if (typeof document === "undefined") return;
  for (const key of Object.keys(appearanceVariables())) document.documentElement.style.removeProperty(key);
}
