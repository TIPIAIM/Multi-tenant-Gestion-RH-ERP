import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import type { ClientSession } from "mongoose";
import { getCloudinaryConfig } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { SettingsLogoAssetModel } from "./settings-logo.model.js";
import { TenantSettingsModel } from "./settings.model.js";
import type { BrandingSettings, TenantSettingsPayload } from "./settings.types.js";

export const managedLogoPrefix = (tenantId: string) => `rh-platform/tenants/${tenantId}/logos/`;
function configure() {
  try { const c = getCloudinaryConfig(); cloudinary.config({ cloud_name: c.cloudName, api_key: c.apiKey, api_secret: c.apiSecret, secure: true }); }
  catch { throw new AppError("Le stockage des logos n’est pas configuré. Renseignez Cloudinary côté serveur.", 503, "SETTINGS_LOGO_STORAGE_NOT_CONFIGURED"); }
}
export function brandingImageUrls(branding?: BrandingSettings | null): string[] {
  if (!branding) return [];
  return [branding.logoUrl, branding.compactLogoUrl, branding.printLogoUrl, branding.faviconUrl, branding.loginBackgroundUrl, branding.flagUrl, branding.countryWordmarkUrl]
    .filter((url): url is string => Boolean(url));
}
function managedIdFromUrl(value: string): string | null {
  try { return decodeURIComponent(new URL(value).pathname).match(/\/(rh-platform\/tenants\/[^/]+\/logos\/[^/.]+)(?:\.[^/]+)?$/)?.[1] ?? null; }
  catch { return null; }
}
function imageReferences(branding?: BrandingSettings | null) {
  const urls = brandingImageUrls(branding).map(value => { try { const url = new URL(value); url.hash = ""; url.search = ""; return url.href; } catch { return value; } });
  const ids = urls.map(managedIdFromUrl).filter((value): value is string => Boolean(value));
  return { urls, ids };
}
function usesAsset(asset: {url: string; publicId: string}, branding?: BrandingSettings | null) {
  const refs = imageReferences(branding); return refs.urls.includes(asset.url) || refs.ids.includes(asset.publicId);
}
export async function uploadManagedLogo(tenantId: string, buffer: Buffer) {
  // Tracer l'identifiant avant l'upload permet de nettoyer même après un crash.
  configure();
  const publicId = managedLogoPrefix(tenantId) + randomUUID();
  const asset = await SettingsLogoAssetModel.create({ tenantId, publicId, status: "UPLOADING", url: "" });
  try {
    const result = await new Promise<{ url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        public_id: publicId, resource_type: "image", type: "upload", overwrite: false,
        format: "png", transformation: [{ width: 1024, height: 1024, crop: "limit" }], timeout: 30000,
      }, (error, result) => {
        if (error || !result?.secure_url || result.resource_type !== "image") {
          reject(new AppError("Impossible d’enregistrer le logo. Vérifiez le stockage Cloudinary.", 502, "SETTINGS_LOGO_STORAGE_FAILED"));
        } else resolve({ url: result.secure_url });
      });
      Readable.from([buffer]).pipe(stream);
    });
    asset.url = result.url; asset.status = "STAGED"; await asset.save();
    return asset;
  } catch (error) {
    await SettingsLogoAssetModel.updateOne({ _id: asset._id }, { $set: { status: "DELETE_PENDING", nextAttemptAt: new Date() } }).exec();
    throw error;
  }
}
export async function assertManagedLogoReferences(tenantId: string, branding: BrandingSettings, session: ClientSession): Promise<void> {
  const { urls, ids } = imageReferences(branding);
  const references = { $or: [{ url: { $in: urls } }, { publicId: { $in: ids } }] };
  const foreign = await SettingsLogoAssetModel.findOne({ tenantId: { $ne: tenantId }, ...references }).session(session).lean().exec();
  if (foreign) throw new AppError("Ce logo appartient à une autre entreprise.", 403, "SETTINGS_LOGO_TENANT_MISMATCH");
  const invalid = await SettingsLogoAssetModel.findOne({ tenantId, ...references, status: { $in: ["DELETE_PENDING", "DELETING", "DELETED"] } }).session(session).lean().exec();
  if (invalid) throw new AppError("Ce logo n’est plus disponible. Téléversez-le de nouveau.", 409, "SETTINGS_LOGO_REUPLOAD_REQUIRED");
  // Toucher les ressources référencées dans la transaction empêche un nettoyeur
  // concurrent de supprimer une image pendant sa publication.
  await SettingsLogoAssetModel.updateMany({ tenantId, ...references, status: "STAGED" }, { $set: { nextAttemptAt: new Date(Date.now() + 3600000) } }).session(session).exec();
}
export async function queueObsoleteLogos(tenantId: string, active: TenantSettingsPayload, draft: TenantSettingsPayload | null | undefined, session: ClientSession): Promise<void> {
  const keep = [...imageReferences(active.branding).urls, ...imageReferences(draft?.branding).urls];
  const ids = [...imageReferences(active.branding).ids, ...imageReferences(draft?.branding).ids];
  await SettingsLogoAssetModel.updateMany({ tenantId, status: "STAGED", url: { $nin: keep }, publicId: { $nin: ids } }, {
    $set: { status: "DELETE_PENDING", nextAttemptAt: new Date(), leaseUntil: null },
  }).session(session).exec();
}
export async function preserveCurrentLogosOnRestore(tenantId: string, historical: TenantSettingsPayload, current: TenantSettingsPayload, session: ClientSession) {
  // Un fichier supprimé n'est jamais ressuscité par une ancienne version.
  const refs = imageReferences(historical.branding);
  const deleted = await SettingsLogoAssetModel.find({ tenantId, $or: [{ url: { $in: refs.urls } }, { publicId: { $in: refs.ids } }], status: { $in: ["DELETED", "DELETING", "DELETE_PENDING"] } }).session(session).lean().exec();
  const deletedUrls = new Set(deleted.map((asset) => asset.url));
  const deletedIds = new Set(deleted.map(asset => asset.publicId));
  const fields = ["logoUrl", "compactLogoUrl", "printLogoUrl", "faviconUrl", "loginBackgroundUrl", "flagUrl", "countryWordmarkUrl"] as const;
  for (const key of fields) if (deletedUrls.has(historical.branding[key] ?? "") || deletedIds.has(managedIdFromUrl(historical.branding[key] ?? "") ?? "")) historical.branding[key] = current.branding[key] ?? "";
}

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
export async function processSettingsLogoCleanup(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    for (let count = 0; count < 20; count++) {
      const now = new Date();
      const candidate = await SettingsLogoAssetModel.findOne({ $or: [
        { status: "DELETE_PENDING", nextAttemptAt: { $lte: now } },
        { status: "DELETING", leaseUntil: { $lt: now } },
        { status: { $in: ["UPLOADING", "STAGED"] }, createdAt: { $lt: staleBefore }, nextAttemptAt: { $lte: now } },
      ] }).sort({ nextAttemptAt: 1 }).exec();
      if (!candidate) break;
      const current = await TenantSettingsModel.findOne({ tenantId: candidate.tenantId }).lean().exec();
      const inUse = usesAsset(candidate, current?.active.branding) || usesAsset(candidate, current?.draft?.branding);
      if (inUse && candidate.url) {
        await SettingsLogoAssetModel.updateOne({ _id: candidate._id, updatedAt: candidate.updatedAt }, { $set: { nextAttemptAt: new Date(Date.now() + 3600000) } }).exec();
        continue;
      }
      const asset = await SettingsLogoAssetModel.findOneAndUpdate({ _id: candidate._id, status: candidate.status, updatedAt: candidate.updatedAt, nextAttemptAt: candidate.nextAttemptAt },
        { $set: { status: "DELETING", leaseUntil: new Date(Date.now() + 120000) } }, { new: true }).exec();
      if (!asset) continue;
      try {
        const record = await TenantSettingsModel.findOne({ tenantId: asset.tenantId }).lean().exec();
        const used = usesAsset(asset, record?.active.branding) || usesAsset(asset, record?.draft?.branding);
        if (used && asset.url) {
          await SettingsLogoAssetModel.updateOne({ _id: asset._id, status: "DELETING" }, { $set: { status: "STAGED", leaseUntil: null, nextAttemptAt: new Date(Date.now() + 3600000) } }).exec();
          continue;
        }
        if (!asset.publicId.startsWith(managedLogoPrefix(String(asset.tenantId)))) throw new Error("Unowned asset");
        configure();
        const result = await cloudinary.uploader.destroy(asset.publicId, { resource_type: "image", type: "upload", invalidate: true });
        if (!["ok", "not found"].includes(String(result.result))) throw new Error("Delete rejected");
        await SettingsLogoAssetModel.updateOne({ _id: asset._id, status: "DELETING" }, { $set: { status: "DELETED", leaseUntil: null } }).exec();
      } catch {
        const attempts = asset.attempts + 1;
        await SettingsLogoAssetModel.updateOne({ _id: asset._id, status: "DELETING" }, { $set: { status: "DELETE_PENDING", attempts, leaseUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6))) } }).exec();
      }
    }
  } finally { running = false; }
}
export function startSettingsLogoCleanupWorker(): () => Promise<void> {
  const run = () => { void processSettingsLogoCleanup().catch(() => console.warn("[RH] Le nettoyage des logos sera réessayé.")); };
  run(); timer = setInterval(run, 60000); timer.unref();
  return async () => { if (timer) clearInterval(timer); timer = undefined; };
}
