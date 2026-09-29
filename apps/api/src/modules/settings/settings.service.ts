import type { Types } from "mongoose";
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
import { settingsSectionSchemas, tenantSettingsPayloadSchema } from "./settings.schema.js";
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
  let record = await TenantSettingsModel.findOne({ tenantId: tenant._id }).exec();
  if (record) return record;

  const defaults = buildDefaultTenantSettings(tenantDefaultIdentity(tenant));
  record = await TenantSettingsModel.create({
    tenantId: tenant._id,
    active: defaults,
    activeVersion: 1,
    publishedAt: new Date(),
    publishedByName: "Initialisation système",
  });

  return record;
}

function calculateMaturity(settings: TenantSettingsPayload): SettingsMaturity {
  const issues: string[] = [];
  const checks = [
    Boolean(settings.institution.legalName && settings.institution.email && settings.institution.phone),
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
    active: record.active as TenantSettingsPayload,
    draft: (record.draft as TenantSettingsPayload | null | undefined) ?? null,
    effective: ((record.draft as TenantSettingsPayload | null | undefined) ?? record.active) as TenantSettingsPayload,
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
  const active = record.active as TenantSettingsPayload;
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
  tenant: TenantDocument;
  actor: SettingsActor;
  section: SettingsSectionKey;
  value: unknown;
}) {
  assertCanManageSettingsSection(input.actor, input.section);
  const parsedSection = settingsSectionSchemas[input.section].parse(input.value);
  const record = await ensureSettingsRecord(input.tenant);
  const draft = clone((record.draft ?? record.active) as TenantSettingsPayload);
  (draft as any)[input.section] = parsedSection;
  tenantSettingsPayloadSchema.parse(draft);

  record.draft = draft;
  record.draftBaseVersion = record.draftBaseVersion ?? record.activeVersion;
  record.draftUpdatedByUserId = input.actor.userId;
  record.draftUpdatedByName = input.actor.fullName;
  record.draftUpdatedAt = new Date();
  await record.save();

  return serializeRecord(record);
}

export async function discardTenantSettingsDraft(tenant: TenantDocument, actor: SettingsActor) {
  assertCanPublishSettings(actor);
  const record = await ensureSettingsRecord(tenant);
  record.draft = null;
  record.draftBaseVersion = null;
  record.draftUpdatedByUserId = null;
  record.draftUpdatedByName = null;
  record.draftUpdatedAt = null;
  await record.save();
  return serializeRecord(record);
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
    active: record.active as TenantSettingsPayload,
    draft: record.draft as TenantSettingsPayload,
  });
}

export async function publishTenantSettings(input: {
  tenant: TenantDocument;
  actor: SettingsActor;
  reason: string;
}) {
  assertCanPublishSettings(input.actor);
  const record = await ensureSettingsRecord(input.tenant);
  if (!record.draft) throw new AppError("Aucune modification en brouillon n’est disponible.", 409, "SETTINGS_NO_DRAFT");

  const active = record.active as TenantSettingsPayload;
  const next = tenantSettingsPayloadSchema.parse(record.draft) as TenantSettingsPayload;
  const diff = buildSettingsDiff(active, next);
  if (diff.length === 0) throw new AppError("Le brouillon ne contient aucune modification effective.", 409, "SETTINGS_DRAFT_EMPTY");

  const nextVersion = record.activeVersion + 1;
  const changedSections = [...new Set(diff.map((item) => item.section))];
  const changeSummary = diff.slice(0, 50).map((item) => `${item.path} : valeur modifiée`);
  const now = new Date();

  await TenantSettingsRevisionModel.create({
    tenantId: input.tenant._id,
    version: nextVersion,
    snapshot: next,
    reason: input.reason,
    changedSections,
    changeSummary,
    publishedByUserId: input.actor.userId,
    publishedByName: input.actor.fullName,
    publishedAt: now,
  });

  record.active = next;
  record.activeVersion = nextVersion;
  record.publishedByUserId = input.actor.userId;
  record.publishedByName = input.actor.fullName;
  record.publishedAt = now;
  record.draft = null;
  record.draftBaseVersion = null;
  record.draftUpdatedByUserId = null;
  record.draftUpdatedByName = null;
  record.draftUpdatedAt = null;
  await record.save();

  return serializeRecord(record);
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

export async function restoreTenantSettingsRevision(input: {
  tenant: TenantDocument;
  actor: SettingsActor;
  version: number;
  reason: string;
}) {
  assertCanRestoreSettings(input.actor);
  const revision = await TenantSettingsRevisionModel.findOne({ tenantId: input.tenant._id, version: input.version }).lean().exec();
  if (!revision) throw new AppError("Cette version de configuration est introuvable.", 404, "SETTINGS_REVISION_NOT_FOUND");

  const record = await ensureSettingsRecord(input.tenant);
  record.draft = clone(revision.snapshot as TenantSettingsPayload);
  record.draftBaseVersion = record.activeVersion;
  record.draftUpdatedByUserId = input.actor.userId;
  record.draftUpdatedByName = input.actor.fullName;
  record.draftUpdatedAt = new Date();
  await record.save();

  const published = await publishTenantSettings({ tenant: input.tenant, actor: input.actor, reason: `${input.reason} — restauration de la version ${input.version}` });
  await TenantSettingsRevisionModel.updateOne(
    { tenantId: input.tenant._id, version: published.activeVersion },
    { $set: { restoredFromVersion: input.version } },
  ).exec();
  return published;
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
