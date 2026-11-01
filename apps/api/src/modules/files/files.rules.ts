import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute, basename } from "node:path";
import type { Storage, Entry, PublicEntry } from "./files.types.js";
export const moduleLabels: Record<string, string> = {
  communications: "Communications",
  agents: "Documents agents",
  tasks: "Tâches",
  roadmaps: "Feuilles de route",
  evaluations: "Évaluations",
  training: "Formations",
  recruitment: "Recrutement",
  branding: "Identité et signatures",
};
export function assertRole(role: string) {
  if (!["TENANT_ADMIN", "RH_MANAGER"].includes(role))
    throw new Error("FILES_FORBIDDEN");
}
export function storageId(storage: Storage) {
  const identity =
    storage.kind === "link"
      ? [storage.kind, storage.url]
      : storage.kind === "local"
        ? [storage.kind, resolve(storage.path)]
        : [storage.kind, storage.delivery, storage.id];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}
export function safeName(name: string) {
  return (
    basename(name.replace(/\\/g, "/"))
      .normalize("NFC")
      .replace(/[\x00-\x1f\x7f<>:"|?*]/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 170) || "document"
  );
}
export function isWithin(root: string, path: string) {
  const rel = relative(resolve(root), resolve(path));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
export function publicEntry(e: Entry): PublicEntry {
  const { storage, references, ...value } = e;
  return {
    ...value,
    kind: storage.kind === "link" ? "link" : "file",
    uses: references.length,
    locations: references.map((r) => ({
      module: r.module,
      title: r.title,
      route: r.route,
    })),
  };
}
export function cloudOwned(storage: Storage, tenantId: string, slug: string) {
  if (storage.kind !== "raw" && storage.kind !== "image") return false;
  return (
    storage.id.startsWith(`fades-rh/${slug}/`) ||
    storage.id.startsWith(`rh-platform/tenants/${tenantId}/`)
  );
}
