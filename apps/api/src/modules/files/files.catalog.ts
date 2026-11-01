import mongoose, { type ClientSession } from "mongoose";
import { resolve, extname } from "node:path";
import { AppError } from "../../core/errors/app-error.js";
import { storageId, safeName } from "./files.rules.js";
import type { Actor, Entry, Reference, Storage } from "./files.types.js";
type Doc = Record<string, any>;
const specs = [
  [
    "AgentDocumentFile",
    "agents",
    "/agents",
    "title originalFileName mimeType bytes storagePublicId agentId uploadedByUserId status",
  ],
  [
    "PieceTransfer",
    "communications",
    "/piece-transfers",
    "title originalFileName mimeType bytes storagePublicId fileStatus senderNameSnapshot senderUserId",
  ],
  [
    "PieceTransferMessage",
    "communications",
    "/piece-transfers",
    "body attachment attachments senderNameSnapshot senderUserId transferId",
  ],
  ["Task", "tasks", "/tasks", "title kpis"],
  ["Roadmap", "roadmaps", "/roadmaps", "title items"],
  ["Agent", "agents", "/agents", "firstName lastName documents photoAssetId"],
  [
    "Evaluation",
    "evaluations",
    "/evaluations",
    "title agentSnapshot evidenceLinks criteria",
  ],
  [
    "TrainingEnrollment",
    "training",
    "/trainings",
    "agentName externalCertificateUrl",
  ],
  ["RecruitmentApplication", "recruitment", "/recruitment", "fullName cvUrl"],
  ["AgentPhotoAsset", "agents", "/agents", "agentId publicId state"],
  ["TenantDocumentMarkAsset", "branding", "/settings", "kind publicId state"],
  ["SettingsLogoAsset", "branding", "/settings", "publicId url status"],
  ["TenantSettings", "branding", "/settings", "active.branding draft.branding"],
  ["Tenant", "branding", "/settings", "branding.logoUrl"],
] as const;
function valueAt(doc: Doc, path: string) {
  return path.split(".").reduce<any>((v, k) => v?.[k], doc);
}
export async function catalog(a: Actor, session?: ClientSession) {
  const entries = new Map<string, Entry>();
  const models: string[] = [];
  let scanned = 0;
  const alias = new Map<string, Storage>();
  const rows = new Map<string, Doc[]>();
  for (const [name, , , fields] of specs) {
    const model = mongoose.models[name];
    if (!model)
      throw new AppError(
        "Un composant de gestion des fichiers n’est pas chargé. Contactez le support.",
        503,
        "FILES_SOURCE_MISSING",
      );
    const projection = Object.fromEntries(
      [...fields.split(" "), "createdAt", "updatedAt"].map((f) => [f, 1]),
    );
    const query =
      name === "Tenant" ? { _id: a.tenantId } : { tenantId: a.tenantId };
    const list: Doc[] = [];
    for await (const doc of model.collection.find(query, {
      session,
      projection,
    })) {
      if (++scanned > 100000)
        throw new AppError(
          "Le registre dépasse la capacité de cette installation. Contactez le support pour adapter l’indexation.",
          413,
          "FILES_CATALOG_LIMIT",
        );
      list.push(doc);
    }
    rows.set(name, list);
    models.push(name);
  }
  const agentNames = new Map(
    (rows.get("Agent") ?? []).map((d) => [
      String(d._id),
      [d.firstName, d.lastName].filter(Boolean).join(" "),
    ]),
  );
  for (const doc of rows.get("SettingsLogoAsset") ?? [])
    if (doc.url && doc.publicId)
      alias.set(doc.url, {
        kind: "image",
        id: doc.publicId,
        delivery: "upload",
        format: "png",
      });
  function add(
    model: string,
    doc: Doc,
    module: string,
    route: string,
    path: string,
    storage: Storage,
    name: string,
    mime = "application/octet-stream",
    bytes = 0,
    action: Reference["action"] = "unset",
    extra?: Record<string, unknown>,
  ) {
    const actual =
      storage.kind === "link" ? (alias.get(storage.url) ?? storage) : storage;
    const key = storageId(actual),
      now = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : "";
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        id: key,
        name: safeName(name),
        mime,
        bytes: Number(bytes) || 0,
        createdAt: now,
        owner:
          doc.senderNameSnapshot ||
          doc.fullName ||
          doc.agentName ||
          agentNames.get(String(doc.agentId)) ||
          "",
        modules: [],
        storage: actual,
        references: [],
      };
      entries.set(key, entry);
    }
    if (!entry.modules.includes(module)) entry.modules.push(module);
    entry.references.push({
      model,
      id: doc._id,
      path,
      expected: valueAt(doc, path),
      action,
      title:
        doc.title ||
        doc.fullName ||
        doc.agentName ||
        [doc.firstName, doc.lastName].filter(Boolean).join(" ") ||
        name,
      module,
      route,
      extra,
    });
  }
  function link(
    model: string,
    doc: Doc,
    module: string,
    route: string,
    path: string,
    name: string,
    action: Reference["action"] = "unset",
  ) {
    const current = valueAt(doc, path);
    const url =
      action === "pull" ? (current?.fileUrl ?? current?.url) : current;
    if (typeof url !== "string" || !url.trim()) return;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
    } catch {
      return;
    }
    add(
      model,
      doc,
      module,
      route,
      path,
      { kind: "link", url },
      name,
      "application/octet-stream",
      0,
      action,
    );
  }
  for (const [model, module, route] of specs)
    for (const doc of rows.get(model) ?? []) {
      const raw = (
        path: string,
        file: Doc,
        action: Reference["action"] = "unset",
      ) =>
        add(
          model,
          doc,
          module,
          route,
          path,
          {
            kind: "raw",
            id: file.storagePublicId,
            delivery: "private",
            format: extname(file.originalFileName ?? "").slice(1) || "bin",
          },
          file.originalFileName ?? doc.title ?? "document",
          file.mimeType,
          file.bytes,
          action,
        );
      if (model === "AgentDocumentFile" && doc.storagePublicId)
        raw("storagePublicId", doc, "delete");
      if (
        model === "PieceTransfer" &&
        doc.storagePublicId &&
        doc.fileStatus !== "DELETED"
      )
        raw("storagePublicId", doc, "transfer");
      if (model === "PieceTransferMessage") {
        if (doc.attachments?.length)
          doc.attachments.forEach((f: Doc, i: number) => {
            if (f.storagePublicId && f.status !== "DELETED")
              raw(`attachments.${i}.storagePublicId`, f, "message");
          });
        else if (
          doc.attachment?.storagePublicId &&
          doc.attachment.status !== "DELETED"
        )
          raw("attachment.storagePublicId", doc.attachment, "message");
      }
      if (model === "Task")
        for (const [i, kpi] of (doc.kpis ?? []).entries())
          if (kpi.file?.storagePath)
            add(
              model,
              doc,
              module,
              route,
              `kpis.${i}.file`,
              {
                kind: "local",
                path: kpi.file.storagePath,
                root: resolve("storage/private/task-kpis", String(a.tenantId)),
              },
              kpi.file.originalName,
              kpi.file.mimeType,
              kpi.file.size,
              "unset",
              {
                [`kpis.${i}.submittedAt`]: "",
                [`kpis.${i}.submittedByUserId`]: "",
              },
            );
      if (model === "Roadmap")
        for (const [i, item] of (doc.items ?? []).entries())
          if (item.kpiFile?.storagePath)
            add(
              model,
              doc,
              module,
              route,
              `items.${i}.kpiFile`,
              {
                kind: "local",
                path: item.kpiFile.storagePath,
                root: resolve("storage/private/roadmap-kpis"),
              },
              item.kpiFile.originalFileName,
              item.kpiFile.mimeType,
              item.kpiFile.sizeBytes,
            );
      if (model === "Agent")
        for (const [i, d] of (doc.documents ?? []).entries())
          link(
            model,
            doc,
            module,
            route,
            `documents.${i}`,
            d.title ?? "Document agent",
            "pull",
          );
      if (model === "Evaluation") {
        for (const [i, d] of (doc.evidenceLinks ?? []).entries())
          link(
            model,
            doc,
            module,
            route,
            `evidenceLinks.${i}`,
            d.title ?? "Justificatif",
            "pull",
          );
        for (const [c, criterion] of (doc.criteria ?? []).entries())
          for (const [i, d] of (criterion.evidenceLinks ?? []).entries())
            link(
              model,
              doc,
              module,
              route,
              `criteria.${c}.evidenceLinks.${i}`,
              d.title ?? "Justificatif",
              "pull",
            );
      }
      if (model === "TrainingEnrollment")
        link(
          model,
          doc,
          module,
          route,
          "externalCertificateUrl",
          `Attestation - ${doc.agentName ?? "formation"}`,
        );
      if (model === "RecruitmentApplication")
        link(
          model,
          doc,
          module,
          route,
          "cvUrl",
          `CV - ${doc.fullName ?? "candidat"}`,
        );
      if (
        [
          "AgentPhotoAsset",
          "TenantDocumentMarkAsset",
          "SettingsLogoAsset",
        ].includes(model) &&
        doc.publicId &&
        (doc.state === "ATTACHED" || doc.status === "STAGED")
      )
        add(
          model,
          doc,
          module,
          route,
          "publicId",
          {
            kind: "image",
            id: doc.publicId,
            delivery: model === "SettingsLogoAsset" ? "upload" : "private",
            format: "png",
          },
          model === "AgentPhotoAsset"
            ? `Photo - ${agentNames.get(String(doc.agentId)) || "profil"}.png`
            : model === "SettingsLogoAsset"
              ? "Logo.png"
              : `${doc.kind === "stamp" ? "Cachet" : "Signature"}.png`,
          "image/png",
          0,
          "asset",
        );
      if (model === "TenantSettings")
        for (const section of ["active", "draft"])
          for (const field of [
            "logoUrl",
            "compactLogoUrl",
            "printLogoUrl",
            "faviconUrl",
            "loginBackgroundUrl",
            "flagUrl",
            "countryWordmarkUrl",
          ])
            link(
              model,
              doc,
              module,
              route,
              `${section}.branding.${field}`,
              "Identité visuelle.png",
            );
      if (model === "Tenant")
        link(
          model,
          doc,
          module,
          route,
          "branding.logoUrl",
          "Logo organisation.png",
        );
    }
  return {
    entries: [...entries.values()].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    ),
    models,
  };
}
