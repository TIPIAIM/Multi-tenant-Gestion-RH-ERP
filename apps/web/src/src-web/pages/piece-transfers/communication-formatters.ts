export const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
export const timeOnly = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
export const numberLabel = new Intl.NumberFormat("fr-FR");
