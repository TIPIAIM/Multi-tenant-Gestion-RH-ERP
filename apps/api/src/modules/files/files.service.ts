import mongoose, { Types, type ClientSession } from "mongoose";
import { createHash } from "node:crypto";
import { AppError } from "../../core/errors/app-error.js";
import { FileAudit, FileDeletion } from "./files.model.js";
import { catalog } from "./files.catalog.js";
import {
  assertRole,
  publicEntry,
  moduleLabels,
  cloudOwned,
} from "./files.rules.js";
import { destroyStorage } from "./files.storage.js";
import type { Actor, Entry, Reference } from "./files.types.js";
function guard(a: Actor) {
  try {
    assertRole(a.role);
  } catch {
    throw new AppError(
      "Cet espace est réservé au RH et à l’administrateur.",
      403,
      "FILES_FORBIDDEN",
    );
  }
}
export const signature = (e: Entry) =>
  createHash("sha256")
    .update(mongoose.mongo.BSON.EJSON.stringify(e.references))
    .digest("hex");
export type Filters = {
  search?: string;
  module?: string;
  kind?: "all" | "file" | "link";
  recent?: boolean;
};
export function filterEntries(entries: Entry[], f: Filters) {
  const search = (f.search ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return entries.filter(
    (e) =>
      (!search ||
        [e.name, e.owner, ...e.references.map((r) => r.title)]
          .join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(search)) &&
      (!f.module || e.modules.includes(f.module)) &&
      (!f.kind ||
        f.kind === "all" ||
        (f.kind === "link") === (e.storage.kind === "link")) &&
      (!f.recent || Date.parse(e.createdAt) > Date.now() - 7 * 86400000),
  );
}
export async function all(a: Actor) {
  guard(a);
  const result = await catalog(a);
  const deleted = await FileDeletion.find({ tenantId: a.tenantId })
    .select("fileKey")
    .lean()
    .exec();
  const keys = new Set(deleted.map((d) => String(d.fileKey)));
  return result.entries.filter(
    (e) => e.storage.kind === "link" || !keys.has(e.id),
  );
}
export async function get(a: Actor, id: string) {
  const item = (await all(a)).find((e) => e.id === id);
  if (!item)
    throw new AppError(
      "Ce fichier n’est plus disponible dans votre organisation.",
      404,
      "FILES_NOT_FOUND",
    );
  return item;
}
export async function list(a: Actor, f: Filters, page: number) {
  const entries = await all(a),
    filtered = filterEntries(entries, f);
  const [pending, audit] = await Promise.all([
    FileDeletion.find({ tenantId: a.tenantId, state: { $ne: "DONE" } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec(),
    FileAudit.find({ tenantId: a.tenantId })
      .sort({ createdAt: -1 })
      .limit(12)
      .lean()
      .exec(),
  ]);
  const statistics = {
    total: entries.length,
    files: 0,
    links: 0,
    bytes: 0,
    recent: 0,
  };
  const counts = new Map<string, number>();
  const recentSince = Date.now() - 7 * 86400000;
  for (const entry of entries) {
    if (entry.storage.kind === "link") statistics.links++;
    else statistics.files++;
    statistics.bytes += entry.bytes;
    if (Date.parse(entry.createdAt) > recentSince) statistics.recent++;
    for (const module of new Set(entry.modules))
      counts.set(module, (counts.get(module) ?? 0) + 1);
  }
  return {
    items: filtered.slice((page - 1) * 25, page * 25).map(publicEntry),
    pagination: {
      page,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / 25)),
    },
    statistics,
    modules: Object.entries(moduleLabels).map(([key, label]) => ({
      key,
      label,
      count: counts.get(key) ?? 0,
    })),
    pending: pending.map((p) => ({
      id: String(p._id),
      name: p.name,
      attempts: p.attempts,
    })),
    audit: audit.map((e) => ({
      id: String(e._id),
      name: e.name,
      actor: e.actorName,
      action: e.action,
      count: e.count,
      createdAt: e.createdAt,
    })),
  };
}
export async function deletionPreview(a: Actor, id: string) {
  const e = await get(a, id);
  return { ...publicEntry(e), token: signature(e) };
}
function options(session: ClientSession) {
  return { session };
}
async function detach(a: Actor, r: Reference, session: ClientSession) {
  const model = mongoose.models[r.model]!;
  const tenant = r.model === "Tenant" ? {} : { tenantId: a.tenantId };
  const filter = { _id: r.id, ...tenant, [r.path]: r.expected };
  if (r.action === "delete") {
    const result = await model.collection.deleteOne(filter, options(session));
    if (!result.deletedCount)
      throw new AppError(
        "Le fichier vient de changer. Actualisez puis réessayez.",
        409,
        "FILES_CHANGED",
      );
    return;
  }
  let change: any = {
    $unset: { [r.path]: "", ...r.extra },
    $set: { updatedAt: new Date() },
  };
  if (r.action === "pull") {
    const parent = r.path.slice(0, r.path.lastIndexOf("."));
    change = {
      $pull: { [parent]: r.expected },
      $set: { updatedAt: new Date() },
    };
  }
  if (r.action === "message") {
    const prefix = r.path.slice(0, r.path.lastIndexOf("."));
    change = {
      $set: {
        [`${prefix}.status`]: "DELETED",
        [`${prefix}.deletedAt`]: new Date(),
        [`${prefix}.deletedByUserId`]: a.userId,
        updatedAt: new Date(),
      },
    };
  }
  if (r.action === "transfer")
    change = {
      $set: {
        fileStatus: "DELETED",
        fileDeletedAt: new Date(),
        fileDeletedByUserId: a.userId,
        updatedAt: new Date(),
      },
    };
  if (r.action === "asset") {
    change = {
      $set: {
        [r.model === "SettingsLogoAsset" ? "status" : "state"]: "DELETED",
        updatedAt: new Date(),
      },
    };
    if (r.model === "AgentPhotoAsset")
      await mongoose.models.Agent!.collection.updateMany(
        { tenantId: a.tenantId, photoAssetId: r.id },
        { $unset: { photoAssetId: "" }, $inc: { photoRevision: 1 } },
        options(session),
      );
    if (r.model === "TenantDocumentMarkAsset")
      for (const kind of ["stamp", "signature"])
        await mongoose.models.TenantDocumentMarks!.collection.updateOne(
          { tenantId: a.tenantId, [kind]: r.id },
          { $unset: { [kind]: "" }, $inc: { revision: 1 } },
          options(session),
        );
  }
  if (r.model === "TenantSettings") change.$inc = { editRevision: 1 };
  const result = await model.collection.updateOne(
    filter,
    change,
    options(session),
  );
  if (!result.matchedCount)
    throw new AppError(
      "Les références du fichier viennent de changer. Actualisez puis réessayez.",
      409,
      "FILES_CHANGED",
    );
}
export async function remove(a: Actor, id: string, token: string) {
  guard(a);
  const session = await mongoose.startSession();
  let jobId = "";
  try {
    await session.withTransaction(
      async () => {
        const result = await catalog(a, session),
          entry = result.entries.find((e) => e.id === id);
        if (!entry || signature(entry) !== token)
          throw new AppError(
            "Le fichier ou ses utilisations ont changé. Ouvrez de nouveau la confirmation.",
            409,
            "FILES_CHANGED",
          );
        if (
          (entry.storage.kind === "raw" || entry.storage.kind === "image") &&
          !cloudOwned(entry.storage, String(a.tenantId), a.slug)
        )
          throw new AppError(
            "Le stockage de ce fichier doit être vérifié par le support avant suppression.",
            409,
            "FILES_STORAGE_OWNERSHIP",
          );
        if (entry.storage.kind === "local")
          for (const [name, path] of [
            ["Task", "kpis.file.storagePath"],
            ["Roadmap", "items.kpiFile.storagePath"],
          ] as const) {
            if (
              await mongoose.models[name]!.collection.findOne(
                { tenantId: { $ne: a.tenantId }, [path]: entry.storage.path },
                { session, projection: { _id: 1 } },
              )
            )
              throw new AppError(
                "Ce fichier est encore référencé par un autre espace. Sa suppression nécessite une vérification du support.",
                409,
                "FILES_SHARED_STORAGE",
              );
          }
        // Descending natural order keeps array offsets valid while removing several references.
        const refs = entry.references
          .slice()
          .sort((x, y) =>
            y.path.localeCompare(x.path, undefined, { numeric: true }),
          );
        for (const r of refs) await detach(a, r, session);
        const created = await FileDeletion.findOneAndUpdate(
          { tenantId: a.tenantId, fileKey: id },
          {
            $set: {
              name: entry.name,
              storage: entry.storage,
              slug: a.slug,
              state: "PENDING",
              attempts: 0,
              nextAttemptAt: new Date(),
              deletedAt: new Date(),
              actorId: a.userId,
              actorName: a.name,
              references: refs.length,
            },
          },
          { session, upsert: true, new: true },
        );
        jobId = String(created!._id);
        await FileAudit.create(
          [
            {
              tenantId: a.tenantId,
              actorId: a.userId,
              actorName: a.name,
              action: "DELETE",
              fileKey: id,
              name: entry.name,
              count: refs.length,
            },
          ],
          { session },
        );
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  await cleanupOne(jobId, a.tenantId);
  const job = await FileDeletion.findById(jobId).lean().exec();
  return {
    completed: job?.state === "DONE",
    message:
      job?.state === "DONE"
        ? "Le fichier et ses références ont été supprimés."
        : "Le fichier a été retiré des modules. La suppression du stockage est en attente et sera réessayée automatiquement.",
  };
}
export async function cleanupOne(id?: string, tenantId?: Types.ObjectId) {
  const now = new Date();
  const job = await FileDeletion.findOneAndUpdate(
    {
      ...(id ? { _id: id } : {}),
      ...(tenantId ? { tenantId } : {}),
      $or: [
        { state: "PENDING", nextAttemptAt: { $lte: now } },
        { state: "RUNNING", leaseUntil: { $lt: now } },
      ],
    },
    {
      $set: { state: "RUNNING", leaseUntil: new Date(Date.now() + 180000) },
      $inc: { attempts: 1 },
    },
    { new: true },
  )
    .lean()
    .exec();
  if (!job) return;
  try {
    await destroyStorage(job.storage, {
      tenantId: job.tenantId,
      slug: job.slug,
    });
    await FileDeletion.updateOne(
      { _id: job._id, state: "RUNNING", leaseUntil: job.leaseUntil },
      { $set: { state: "DONE", lastError: "" } },
    );
  } catch {
    await FileDeletion.updateOne(
      { _id: job._id, state: "RUNNING", leaseUntil: job.leaseUntil },
      {
        $set: {
          state: "PENDING",
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
          ),
          lastError: "Le stockage n’a pas confirmé la suppression.",
        },
      },
    );
  }
}
export async function retry(a: Actor, id: string) {
  guard(a);
  await FileDeletion.updateOne(
    { _id: id, tenantId: a.tenantId, state: "PENDING" },
    { $set: { nextAttemptAt: new Date() } },
  );
  await cleanupOne(id, a.tenantId);
  return { message: "La suppression en attente a été relancée." };
}
export async function audit(a: Actor, action: string, name: string, count = 1) {
  guard(a);
  await FileAudit.create({
    tenantId: a.tenantId,
    actorId: a.userId,
    actorName: a.name,
    action,
    name,
    count,
  });
}
let cleanup: Promise<void> | undefined;
export function startFileCleanup() {
  const tick = () => {
    if (cleanup) return;
    cleanup = (async () => {
      for (let i = 0; i < 10; i++) await cleanupOne();
    })()
      .catch(() => {})
      .finally(() => {
        cleanup = undefined;
      });
  };
  tick();
  const timer = setInterval(tick, 30000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await cleanup;
  };
}
