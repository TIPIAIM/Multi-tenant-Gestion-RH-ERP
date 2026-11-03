import mongoose, { Types } from "mongoose";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import { AppError } from "../../core/errors/app-error.js";
import { FileExport, FileDeletion } from "./files.model.js";
import { openStorage } from "./files.storage.js";
import { moduleLabels, safeName } from "./files.rules.js";
import { all, filterEntries, audit, type Filters } from "./files.service.js";
import type { Actor, Entry } from "./files.types.js";
import {
  shouldFlushVolume,
  largeDownloadMessage,
  VOLUME_TARGET,
} from "./files.download-policy.js";
const running = new Set<Promise<void>>();
export function exportBucket() {
  if (!mongoose.connection.db)
    throw new AppError(
      "La base est indisponible.",
      503,
      "FILES_DB_UNAVAILABLE",
    );
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "rhFileExports",
  });
}
const csv = (v: unknown) =>
  `"${String(v ?? "")
    .replace(/^\s*[=+@\-]/, "'$&")
    .replace(/"/g, '""')}"`;
export function exportName(entry: Entry) {
  const folder = moduleLabels[entry.modules[0] ?? ""] ?? "Documents";
  return `${folder}/${safeName(entry.name)}`;
}
async function stage(a: Actor, entry: Entry, path: string) {
  // Re-resolve the current tenant catalog before opening; a deletion must win over an old export selection.
  if (
    entry.storage.kind !== "link" &&
    (await FileDeletion.exists({ tenantId: a.tenantId, fileKey: entry.id }))
  )
    throw new Error("FILE_REMOVED");
  let exists = false;
  for (const ref of entry.references) {
    const found = await mongoose.models[ref.model]!.collection.findOne(
      {
        _id: ref.id,
        ...(ref.model === "Tenant" ? {} : { tenantId: a.tenantId }),
        [ref.path]: ref.expected,
      },
      { projection: { _id: 1 } },
    );
    if (found) {
      exists = true;
      break;
    }
  }
  if (!exists) throw new Error("FILE_REMOVED");
  const stream = await openStorage(entry.storage, a);
  await pipeline(stream, createWriteStream(path, { flags: "wx", mode: 0o600 }));
  return (await stat(path)).size;
}

async function pack(
  folder: string,
  items: { path: string; entry: Entry }[],
  report: string,
  volume: number,
) {
  const output = join(folder, `volume-${volume}.zip`),
    zip = archiver("zip", { zlib: { level: 3 }, forceZip64: true });
  const target = createWriteStream(output, { flags: "wx", mode: 0o600 });
  const done = pipeline(zip, target);
  void done.catch(() => {});
  const names = new Set<string>();
  for (const item of items) {
    let name = exportName(item.entry),
      counter = 2;
    const original = name,
      extension = extname(name);
    while (names.has(name)) {
      name = `${original.slice(0, original.length - extension.length)} (${counter++})${extension}`;
    }
    names.add(name);
    const entryData: archiver.ZipEntryData = {
      name,
      store:
        /^(image\/(jpeg|png|webp|gif)|audio\/|video\/|application\/(zip|x-7z-compressed|gzip))/.test(
          item.entry.mime,
        ),
    };
    zip.file(item.path, entryData);
  }
  zip.append("Nom;Module;Résultat\r\n" + report, { name: "BILAN.csv" });
  zip.append(
    "Export des fichiers . Les liens externes nécessitant une connexion ne peuvent pas être téléchargés automatiquement. Le bilan indique les fichiers inclus et les indisponibilités. Les volumes doivent tous être conservés. Les signatures, photos et logos ne portent pas tous une taille connue dans les données sources.\n",
    { name: "LIRE-MOI.txt" },
  );
  try {
    await zip.finalize();
    await done;
  } catch (error) {
    zip.abort();
    await done.catch(() => {});
    throw error;
  }
  return output;
}
export async function startExport(a: Actor, filters: Filters, ids?: string[]) {
  const selectedIds = ids ? new Set(ids) : null;
  const entries = filterEntries(await all(a), filters).filter(
    (e) => !selectedIds || selectedIds.has(e.id),
  );
  if (ids && entries.length !== new Set(ids).size)
    throw new AppError(
      "La sélection a changé. Actualisez la liste avant de télécharger.",
      409,
      "FILES_SELECTION_CHANGED",
    );
  if (!entries.length)
    throw new AppError(
      "Aucun fichier ne correspond à cette sélection.",
      400,
      "FILES_EMPTY_EXPORT",
    );
  const estimatedBytes = entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.bytes || 0),
    0,
  );
  const unknownSizes = entries.filter((entry) => !entry.bytes).length;
  let job: any;
  try {
    job = await FileExport.create({
      tenantId: a.tenantId,
      actorId: a.userId,
      actorName: a.name,
      status: "RUNNING",
      total: entries.length,
      heartbeatAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new AppError(
        "Un téléchargement groupé est déjà en préparation pour votre organisation.",
        409,
        "FILES_EXPORT_RUNNING",
      );
    throw error;
  }
  const task = build(a, String(job._id), entries);
  running.add(task);
  void task.then(
    () => running.delete(task),
    () => running.delete(task),
  );
  return {
    id: String(job._id),
    message: largeDownloadMessage(estimatedBytes, unknownSizes),
    estimatedBytes,
    unknownSizes,
  };
}
async function build(a: Actor, id: string, entries: Entry[]) {
  let folder = "",
    processed = 0,
    downloaded = 0,
    failed = 0,
    volume = 1,
    bytes = 0,
    lastProgressAt = 0,
    totalBytes = 0;
  let pending: { path: string; entry: Entry }[] = [];
  const report: string[] = [];
  const heartbeat = setInterval(() => {
    void FileExport.updateOne(
      { _id: id, status: "RUNNING" },
      { $set: { heartbeatAt: new Date() } },
    ).catch(() => {});
  }, 10000);
  heartbeat.unref();
  try {
    folder = await mkdtemp(join(tmpdir(), "rh-file-export-"));
    const flush = async () => {
      const archive = await pack(folder, pending, report.join("\r\n"), volume),
        fileId = new Types.ObjectId();
      try {
        await pipeline(
          createReadStream(archive),
          exportBucket().openUploadStreamWithId(
            fileId,
            `fichiers-volume-${volume}.zip`,
            { metadata: { tenantId: a.tenantId, exportId: id } },
          ),
        );
        const size = (await stat(archive)).size;
        await FileExport.updateOne(
          { _id: id },
          {
            $push: {
              parts: {
                id: String(fileId),
                name: `fichiers-volume-${volume}.zip`,
                bytes: size,
                keys: pending.map((p) => p.entry.id),
              },
            },
            $set: { heartbeatAt: new Date() },
          },
        );
      } catch (e) {
        await exportBucket()
          .delete(fileId)
          .catch(() => {});
        throw e;
      }
      for (const item of pending) await rm(item.path, { force: true });
      await rm(archive, { force: true });
      pending = [];
      bytes = 0;
      volume++;
    };
    for (const entry of entries) {
      const target = join(folder, `source-${processed}`);
      let size = 0;
      let staged = false;
      try {
        size = await stage(a, entry, target);
        staged = true;
      } catch (error) {
        if (
          ["ENOSPC", "EDQUOT"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
        await rm(target, { force: true });
        failed++;
        report.push(
          [
            entry.name,
            moduleLabels[entry.modules[0] ?? ""],
            "Indisponible : accès externe requis, fichier absent ou transfert interrompu ; réessayez le téléchargement individuel",
          ]
            .map(csv)
            .join(";"),
        );
      }
      if (staged) {
        if (pending.length && shouldFlushVolume(bytes, pending.length, size))
          await flush();
        pending.push({ path: target, entry });
        bytes += size;
        totalBytes += size;
        downloaded++;
        report.push(
          [
            entry.name,
            moduleLabels[entry.modules[0] ?? ""],
            "Inclus dans le volume " + volume,
          ]
            .map(csv)
            .join(";"),
        );
      }
      processed++;
      if (Date.now() - lastProgressAt >= 500 || processed === entries.length) {
        await FileExport.updateOne(
          { _id: id },
          { $set: { processed, downloaded, failed, heartbeatAt: new Date() } },
        );
        lastProgressAt = Date.now();
      }
    }
    // Final volume contains the complete report, including failures and all previous volumes.
    await flush();
    await FileExport.updateOne(
      { _id: id },
      {
        $set: {
          status: "COMPLETED",
          processed,
          downloaded,
          failed,
          message: `${downloaded} fichier(s) inclus, ${failed} indisponible(s). Le bilan complet est dans le dernier volume. Téléchargez les volumes un par un et ouvrez chaque ZIP séparément.`,
          expiresAt: new Date(Date.now() + 86400000),
        },
      },
    );
    if (totalBytes > VOLUME_TARGET)
      await FileExport.updateOne(
        { _id: id },
        {
          $set: {
            message: `${downloaded} fichier(s) inclus, ${failed} indisponible(s). ${largeDownloadMessage(totalBytes)} Le bilan complet est dans le dernier volume.`,
          },
        },
      );
    await audit(
      a,
      "EXPORT",
      `${downloaded} fichier(s) inclus ; ${failed} indisponible(s)`,
      downloaded,
    );
  } catch (error) {
    await FileExport.updateOne(
      { _id: id },
      {
        $set: {
          status: "FAILED",
          message: ["ENOSPC", "EDQUOT"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
            ? "Espace de préparation insuffisant sur le serveur. Téléchargez les gros fichiers individuellement ou sélectionnez un lot plus petit ; contactez le responsable technique si le problème persiste."
            : "La préparation a été interrompue. Réessayez avec un lot plus petit ou téléchargez les gros fichiers individuellement.",
          processed,
          downloaded,
          failed,
        },
      },
    ).catch(() => {});
  } finally {
    clearInterval(heartbeat);
    if (folder)
      await rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}
export async function listExports(a: Actor) {
  await allRole(a);
  const jobs = await FileExport.find({
    tenantId: a.tenantId,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean()
    .exec();
  return jobs.map((j) => ({
    id: String(j._id),
    status: j.status,
    total: j.total,
    processed: j.processed,
    downloaded: j.downloaded,
    failed: j.failed,
    message: j.message,
    expiresAt: j.expiresAt,
    parts: (j.parts ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      bytes: p.bytes,
    })),
  }));
}
async function allRole(a: Actor) {
  if (!["TENANT_ADMIN", "RH_MANAGER"].includes(a.role))
    throw new AppError(
      "Accès réservé au RH et à l’administrateur.",
      403,
      "FILES_FORBIDDEN",
    );
}
export async function openExport(a: Actor, id: string, partId: string) {
  await allRole(a);
  const job = await FileExport.findOne({
    _id: id,
    tenantId: a.tenantId,
    status: "COMPLETED",
    expiresAt: { $gt: new Date() },
  })
    .lean()
    .exec();
  const part = job?.parts?.find((p: any) => p.id === partId);
  if (!part)
    throw new AppError(
      "Ce téléchargement a expiré ou n’est pas prêt. Préparez une nouvelle copie.",
      404,
      "FILES_EXPORT_NOT_FOUND",
    );
  if (
    await FileDeletion.exists({
      tenantId: a.tenantId,
      fileKey: { $in: part.keys },
      deletedAt: { $gte: job!.createdAt },
    })
  )
    throw new AppError(
      "Un fichier de cette copie a été supprimé depuis sa préparation. Préparez un nouveau téléchargement.",
      409,
      "FILES_EXPORT_STALE",
    );
  await audit(a, "DOWNLOAD_EXPORT", part.name, part.keys.length);
  return {
    stream: exportBucket().openDownloadStream(new Types.ObjectId(partId)),
    name: part.name,
    bytes: part.bytes,
  };
}
export async function cleanExports() {
  await FileExport.updateMany(
    { status: "RUNNING", heartbeatAt: { $lt: new Date(Date.now() - 180000) } },
    {
      $set: {
        status: "FAILED",
        message:
          "La préparation a été interrompue par le serveur. Vous pouvez la relancer.",
      },
    },
  );
  const expired = await FileExport.find({ expiresAt: { $lt: new Date() } })
    .limit(10)
    .lean()
    .exec();
  for (const job of expired) {
    for (const part of job.parts ?? [])
      try {
        await exportBucket().delete(new Types.ObjectId(part.id));
      } catch (e) {
        if (
          await exportBucket()
            .find({ _id: new Types.ObjectId(part.id) })
            .hasNext()
        )
          throw e;
      }
    await FileExport.deleteOne({ _id: job._id });
  }
}
export async function drainFileExports() {
  await Promise.allSettled([...running]);
}
