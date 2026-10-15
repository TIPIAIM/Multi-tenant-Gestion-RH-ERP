import mongoose, { type Types, type ClientSession } from "mongoose";
import { TenantModel } from "../tenants/tenant.model.js";
import { SettingsLogoAssetModel } from "./settings-logo.model.js";
import { assertLogoFile } from "./settings-logo.upload.js";
import { assertManagedLogoReferences, queueObsoleteLogos, uploadManagedLogo, preserveCurrentLogosOnRestore, processSettingsLogoCleanup } from "./settings-logo.storage.js";
import { AppError } from "../../core/errors/app-error.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import {
  assertCanManageSettingsSection,
  assertCanPublishSettings,
  assertCanRestoreSettings,
  assertCanViewSettings,
} from "./settings.access.js";
import { buildDefaultTenantSettings } from "./settings.defaults.js";
import { computeSettingsImpact, buildSettingsDiff } from "./settings.impact.js";
import { TenantSettingsModel, TenantSettingsRevisionModel } from "./settings.model.js";
import { brandingSchema, settingsSectionSchemas, tenantSettingsPayloadSchema } from "./settings.schema.js";
import type {
  SettingsActor,
  SettingsMaturity,
  SettingsSectionKey,
  TenantSettingsPayload,
} from "./settings.types.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function tenantDefaultIdentity(tenant: TenantDocument): { legalName?: string; shortName?: string; acronym?: string } {
  const source = tenant as any;
  return {
    legalName: source.name ?? source.legalName,
    shortName: source.shortName ?? source.name,
    acronym: source.acronym ?? source.slug?.toUpperCase(),
  };
}

async function ensureSettingsRecord(tenant: TenantDocument) {
  const defaults = buildDefaultTenantSettings(tenantDefaultIdentity(tenant));
  defaults.branding = brandingSchema.parse({ ...defaults.branding, ...tenant.branding });
  defaults.institution.legalName = tenant.legalName || tenant.name;
  defaults.institution.shortName = tenant.name;
  defaults.institution.email = tenant.contactEmail || "contact@example.invalid";
  defaults.institution.phone = tenant.contactPhone || "À renseigner";
  defaults.institution.address = tenant.address || "À renseigner";
  let record;
  try {
    record = await TenantSettingsModel.findOneAndUpdate({ tenantId: tenant._id }, {
      $setOnInsert: { tenantId: tenant._id, active: defaults, activeVersion: 1, editRevision: 0, publishedAt: new Date(), publishedByName: "Initialisation système" },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    record = await TenantSettingsModel.findOne({ tenantId: tenant._id }).exec();
  }
  if (!record) throw new AppError("Configuration indisponible.", 503, "SETTINGS_UNAVAILABLE");
  return record;
}

function normalizePayload(value: TenantSettingsPayload): TenantSettingsPayload {
  return { ...clone(value), branding: brandingSchema.parse(value.branding) };
}

async function mutateSettings<T>(tenant: TenantDocument, expectedRevision: number | undefined,
  action: (record: Awaited<ReturnType<typeof ensureSettingsRecord>>, session: ClientSession) => Promise<T>,
): Promise<T> {
  await ensureSettingsRecord(tenant);
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      const record = await TenantSettingsModel.findOne({ tenantId: tenant._id }).session(session).exec();
      if (!record) throw new AppError("Configuration introuvable.", 404, "SETTINGS_NOT_FOUND");
      if (expectedRevision !== undefined && expectedRevision !== (record.editRevision ?? 0)) {
        throw new AppError("La configuration a changé dans un autre onglet. Actualisez avant d’enregistrer.", 409, "SETTINGS_CONFLICT");
      }
      record.active = normalizePayload(record.active);
      if (record.draft) record.draft = normalizePayload(record.draft);
      const value = await action(record, session);
      return value;
    });
    void processSettingsLogoCleanup().catch(() => { /* La file persistante sera réessayée par le worker. */ });
    return result;
  } catch (error) {
    if (/Transaction numbers|replica set|mongos/i.test(String((error as Error).message))) {
      throw new AppError("Cette opération nécessite MongoDB Atlas ou un replica set MongoDB pour garantir la sauvegarde atomique.", 503, "SETTINGS_TRANSACTIONS_REQUIRED");
    }
    throw error;
  }
}

function setDraft(record: Awaited<ReturnType<typeof ensureSettingsRecord>>, draft: TenantSettingsPayload, actor: SettingsActor) {
  record.draft = draft; record.draftBaseVersion = record.draftBaseVersion ?? record.activeVersion;
  record.draftUpdatedByUserId = actor.userId; record.draftUpdatedByName = actor.fullName; record.draftUpdatedAt = new Date();
  record.editRevision = (record.editRevision ?? 0) + 1;
}
function clearDraft(record: Awaited<ReturnType<typeof ensureSettingsRecord>>) {
  record.draft = null; record.draftBaseVersion = null; record.draftUpdatedByUserId = null;
  record.draftUpdatedByName = null; record.draftUpdatedAt = null;
}

function calculateMaturity(settings: TenantSettingsPayload): SettingsMaturity {
  const issues: string[] = [];
  const checks = [
    Boolean(settings.institution.legalName && settings.institution.email && !settings.institution.email.endsWith(".invalid") && settings.institution.phone !== "À renseigner"),
    Boolean(settings.branding.logoUrl && settings.branding.primaryColor && settings.branding.printLogoUrl),
    settings.attendance.workingDays.length > 0,
    settings.leave.types.some((type) => type.enabled),
    settings.evaluations.criteria.filter((criterion) => criterion.enabled).reduce((sum, criterion) => sum + criterion.weight, 0) === 100,
    settings.reports.monthlyEnabled || settings.reports.semiannualEnabled || settings.reports.annualEnabled,
    settings.documents.allowedMimeTypes.length > 0,
    settings.security.minimumPasswordLength >= 10,
    Object.values(settings.featureFlags).some(Boolean),
    Boolean(settings.numbering.evaluationPattern && settings.numbering.monthlyReportPattern),
  ];

  if (!checks[0]) issues.push("Compléter l’identité .");
  if (!checks[1]) issues.push("Ajouter les éléments principaux de marque.");
  if (!checks[4]) issues.push("La pondération des critères d’évaluation doit totaliser 100 %.");
  if (!checks[7]) issues.push("Renforcer la politique de mot de passe.");

  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const level = score >= 90 ? "EXCELLENT" : score >= 75 ? "GOOD" : score >= 50 ? "TO_COMPLETE" : "CRITICAL";
  return { score, level, completedSections: checks.filter(Boolean).length, totalSections: checks.length, issues };
}

function serializeRecord(record: any) {
  return {
    active: normalizePayload(record.active as TenantSettingsPayload),
    editRevision: record.editRevision ?? 0,
    draft: record.draft ? normalizePayload(record.draft as TenantSettingsPayload) : null,
    effective: normalizePayload((record.draft ?? record.active) as TenantSettingsPayload),
    hasDraft: Boolean(record.draft),
    activeVersion: record.activeVersion,
    draftBaseVersion: record.draftBaseVersion ?? null,
    draftUpdatedByName: record.draftUpdatedByName ?? null,
    draftUpdatedAt: record.draftUpdatedAt?.toISOString?.() ?? null,
    publishedByName: record.publishedByName ?? null,
    publishedAt: record.publishedAt?.toISOString?.() ?? null,
    maturity: calculateMaturity(((record.draft as TenantSettingsPayload | null | undefined) ?? record.active) as TenantSettingsPayload),
  };
}

export async function getTenantSettings(tenant: TenantDocument, actor: SettingsActor) {
  assertCanViewSettings(actor);
  const record = await ensureSettingsRecord(tenant);
  return serializeRecord(record);
}

export async function getPublicTenantSettings(tenant: TenantDocument) {
  const record = await ensureSettingsRecord(tenant);
  const active = normalizePayload(record.active as TenantSettingsPayload);
  return {
    institution: active.institution,
    branding: active.branding,
    featureFlags: active.featureFlags,
    documents: {
      confidentialLabel: active.documents.confidentialLabel,
      footerText: active.documents.footerText,
    },
    activeVersion: record.activeVersion,
  };
}

export async function saveTenantSettingsSection(input: {
  tenant: TenantDocument; actor: SettingsActor; section: SettingsSectionKey; value: unknown; expectedRevision?: number;
}) {
  assertCanManageSettingsSection(input.actor, input.section);
  const parsedSection = settingsSectionSchemas[input.section].parse(input.value);
  return mutateSettings(input.tenant, input.expectedRevision, async (record, session) => {
    const draft = clone((record.draft ?? record.active) as TenantSettingsPayload);
    (draft as any)[input.section] = parsedSection;
    tenantSettingsPayloadSchema.parse(draft);
    await assertManagedLogoReferences(String(input.tenant._id), draft.branding, session);
    setDraft(record, draft, input.actor);
    await record.save({ session });
    await queueObsoleteLogos(String(input.tenant._id), record.active, record.draft, session);
    return serializeRecord(record);
  });
}

export async function discardTenantSettingsDraft(tenant: TenantDocument, actor: SettingsActor, expectedRevision?: number) {
  assertCanPublishSettings(actor);
  return mutateSettings(tenant, expectedRevision, async (record, session) => {
    clearDraft(record); record.editRevision = (record.editRevision ?? 0) + 1;
    await record.save({ session });
    await queueObsoleteLogos(String(tenant._id), record.active, null, session);
    return serializeRecord(record);
  });
}

export async function validateTenantSettingsDraft(tenant: TenantDocument, actor: SettingsActor) {
  assertCanViewSettings(actor);
  const record = await ensureSettingsRecord(tenant);
  const candidate = (record.draft ?? record.active) as TenantSettingsPayload;
  const parsed = tenantSettingsPayloadSchema.parse(candidate);
  const impact = record.draft
    ? await computeSettingsImpact({ tenantId: tenant._id as Types.ObjectId, active: record.active as TenantSettingsPayload, draft: parsed })
    : null;
  return { valid: true, maturity: calculateMaturity(parsed), impact };
}

export async function getTenantSettingsImpact(tenant: TenantDocument, actor: SettingsActor) {
  assertCanViewSettings(actor);
  const record = await ensureSettingsRecord(tenant);
  if (!record.draft) {
    return { changedSections: [], changesCount: 0, affectedModules: [], affectedAgents: 0, affectedUsers: 0, affectedOrganizationUnits: 0, warnings: [], diff: [] };
  }
  return computeSettingsImpact({
    tenantId: tenant._id as Types.ObjectId,
    active: normalizePayload(record.active as TenantSettingsPayload),
    draft: record.draft as TenantSettingsPayload,
  });
}

async function publishRecord(record: Awaited<ReturnType<typeof ensureSettingsRecord>>, tenant: TenantDocument, actor: SettingsActor, reason: string, session: ClientSession, restoredFromVersion?: number) {
  if (!record.draft) throw new AppError("Aucune modification en brouillon n’est disponible.", 409, "SETTINGS_NO_DRAFT");
  if (record.draftBaseVersion !== record.activeVersion) throw new AppError("Le brouillon est basé sur une ancienne version. Actualisez la configuration.", 409, "SETTINGS_CONFLICT");
  const next = tenantSettingsPayloadSchema.parse(record.draft) as TenantSettingsPayload;
  const diff = buildSettingsDiff(record.active, next);
  if (!diff.length) throw new AppError("Le brouillon ne contient aucune modification effective.", 409, "SETTINGS_DRAFT_EMPTY");
  await assertManagedLogoReferences(String(tenant._id), next.branding, session);
  const now = new Date(), nextVersion = record.activeVersion + 1;
  await TenantSettingsRevisionModel.create([{
    tenantId: tenant._id, version: nextVersion, snapshot: next, reason,
    changedSections: [...new Set(diff.map((item) => item.section))],
    changeSummary: diff.slice(0, 50).map((item) => `${item.path} : valeur modifiée`),
    publishedByUserId: actor.userId, publishedByName: actor.fullName, publishedAt: now, restoredFromVersion,
  }], { session });
  record.active = next; record.activeVersion = nextVersion; record.editRevision = (record.editRevision ?? 0) + 1;
  record.publishedByUserId = actor.userId; record.publishedByName = actor.fullName; record.publishedAt = now;
  clearDraft(record); await record.save({ session });
  await TenantModel.updateOne({ _id: tenant._id }, { $set: {
    "branding.primaryColor": next.branding.primaryColor, "branding.secondaryColor": next.branding.secondaryColor,
    "branding.accentColor": next.branding.accentColor, "branding.logoUrl": next.branding.logoUrl ?? "",
  } }).session(session).exec();
  await queueObsoleteLogos(String(tenant._id), next, null, session);
  return serializeRecord(record);
}
export async function publishTenantSettings(input: { tenant: TenantDocument; actor: SettingsActor; reason: string; expectedRevision?: number }) {
  assertCanPublishSettings(input.actor);
  return mutateSettings(input.tenant, input.expectedRevision, (record, session) => publishRecord(record, input.tenant, input.actor, input.reason, session));
}

export async function listTenantSettingsRevisions(input: {
  tenant: TenantDocument;
  actor: SettingsActor;
  page: number;
  limit: number;
}) {
  assertCanViewSettings(input.actor);
  const filter = { tenantId: input.tenant._id };
  const [items, total] = await Promise.all([
    TenantSettingsRevisionModel.find(filter).sort({ version: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean().exec(),
    TenantSettingsRevisionModel.countDocuments(filter).exec(),
  ]);
  return {
    items: items.map((item: any) => ({
      id: item._id.toString(), version: item.version, reason: item.reason,
      changedSections: item.changedSections, changeSummary: item.changeSummary,
      publishedByName: item.publishedByName, publishedAt: item.publishedAt.toISOString(),
      restoredFromVersion: item.restoredFromVersion,
    })),
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) },
  };
}

export async function getTenantSettingsRevision(input: {
  tenant: TenantDocument;
  actor: SettingsActor;
  version: number;
}) {
  assertCanViewSettings(input.actor);
  const revision = await TenantSettingsRevisionModel.findOne({ tenantId: input.tenant._id, version: input.version }).lean().exec();
  if (!revision) throw new AppError("Cette version de configuration est introuvable.", 404, "SETTINGS_REVISION_NOT_FOUND");
  return revision;
}

export async function restoreTenantSettingsRevision(input: { tenant: TenantDocument; actor: SettingsActor; version: number; reason: string; expectedRevision?: number }) {
  assertCanRestoreSettings(input.actor);
  return mutateSettings(input.tenant, input.expectedRevision, async (record, session) => {
    const revision = await TenantSettingsRevisionModel.findOne({ tenantId: input.tenant._id, version: input.version }).session(session).lean().exec();
    if (!revision) throw new AppError("Cette version est introuvable.", 404, "SETTINGS_REVISION_NOT_FOUND");
    const restored = normalizePayload(revision.snapshot as TenantSettingsPayload);
    await preserveCurrentLogosOnRestore(String(input.tenant._id), restored, record.active, session);
    setDraft(record, restored, input.actor); record.draftBaseVersion = record.activeVersion;
    return publishRecord(record, input.tenant, input.actor, `${input.reason} — restauration de la version ${input.version}`, session, input.version);
  });
}

export async function exportTenantSettings(tenant: TenantDocument, actor: SettingsActor) {
  assertCanViewSettings(actor);
  const record = await ensureSettingsRecord(tenant);
  return {
    exportedAt: new Date().toISOString(),
    tenantId: String(tenant._id),
    activeVersion: record.activeVersion,
    settings: record.active,
  };
}

export async function resetTenantAppearance(input: { tenant: TenantDocument; actor: SettingsActor; expectedRevision?: number; removeLogo?: boolean; branding?: unknown }) {
  assertCanManageSettingsSection(input.actor, "branding");
  return mutateSettings(input.tenant, input.expectedRevision, async (record, session) => {
    const draft = clone((record.draft ?? record.active) as TenantSettingsPayload);
    if (input.branding) draft.branding = brandingSchema.parse(input.branding);
    if (input.removeLogo) {
      const old = draft.branding.logoUrl;
      draft.branding.logoUrl = "";
      if (draft.branding.compactLogoUrl === old) draft.branding.compactLogoUrl = "";
      if (draft.branding.printLogoUrl === old) draft.branding.printLogoUrl = "";
    } else {
      const defaults = buildDefaultTenantSettings().branding;
      const keys = ["primaryColor", "secondaryColor", "accentColor", "dangerColor", "sidebarBackgroundColor", "sidebarTextColor", "sidebarActiveColor", "pageBackgroundColor", "surfaceColor", "textColor", "mutedTextColor", "borderColor", "topbarBackgroundColor", "topbarTextColor"] as const;
      for (const key of keys) (draft.branding as any)[key] = defaults[key];
    }
    draft.branding = brandingSchema.parse(draft.branding);
    await assertManagedLogoReferences(String(input.tenant._id), draft.branding, session);
    setDraft(record, draft, input.actor); await record.save({ session });
    await queueObsoleteLogos(String(input.tenant._id), record.active, record.draft, session);
    return serializeRecord(record);
  });
}

export async function uploadTenantLogo(input: { tenant: TenantDocument; actor: SettingsActor; buffer: Buffer; mime: string; branding: unknown; expectedRevision?: number }) {
  assertCanManageSettingsSection(input.actor, "branding");
  assertLogoFile(input.buffer, input.mime);
  const branding = brandingSchema.parse(input.branding);
  const tenantId = String(input.tenant._id);
  const asset = await uploadManagedLogo(tenantId, input.buffer);
  const old = branding.logoUrl;
  branding.logoUrl = asset.url;
  if (!branding.compactLogoUrl || branding.compactLogoUrl === old) branding.compactLogoUrl = asset.url;
  if (!branding.printLogoUrl || branding.printLogoUrl === old) branding.printLogoUrl = asset.url;
  try {
    return await saveTenantSettingsSection({ tenant: input.tenant, actor: input.actor, section: "branding", value: branding, expectedRevision: input.expectedRevision });
  } catch (error) {
    await SettingsLogoAssetModel.updateOne({ _id: asset._id }, { $set: { status: "DELETE_PENDING", nextAttemptAt: new Date() } }).exec();
    throw error;
  }
}
