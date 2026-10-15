/** Validation serveur des couples texte/fond. Les couleurs restent libres. */
export function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function assertBrandingContrast(value: {
  sidebarBackgroundColor: string; sidebarTextColor: string;
  pageBackgroundColor: string; surfaceColor: string; textColor: string;
  mutedTextColor: string; topbarBackgroundColor: string; topbarTextColor: string;
}): Array<{ key: string; message: string }> {
  const pairs: Array<[string, string, string, string]> = [
    ["sidebarTextColor", value.sidebarTextColor, value.sidebarBackgroundColor, "sidebar"],
    ["textColor", value.textColor, value.surfaceColor, "cartes"],
    ["textColor", value.textColor, value.pageBackgroundColor, "fond général"],
    ["mutedTextColor", value.mutedTextColor, value.surfaceColor, "textes secondaires"],
    ["topbarTextColor", value.topbarTextColor, value.topbarBackgroundColor, "barre supérieure"],
  ];
  return pairs.filter(([, text, background]) => contrastRatio(text, background) < 4.5)
    .map(([key, , , label]) => ({ key, message: `Le contraste de ${label} doit être au moins 4,5:1. Choisissez un texte plus clair ou plus foncé.` }));
}
