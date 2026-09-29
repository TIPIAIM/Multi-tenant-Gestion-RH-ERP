import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../core/errors/app-error.js";
import { resolveSettingsActor } from "./settings.access.js";
import {
  listSettingsHistoryQuerySchema,
  publishSettingsSchema,
  saveSettingsSectionSchema,
  settingsSectionParamsSchema,
  settingsVersionParamsSchema,
} from "./settings.schema.js";
import {
  discardTenantSettingsDraft,
  exportTenantSettings,
  getPublicTenantSettings,
  getTenantSettings,
  getTenantSettingsImpact,
  getTenantSettingsRevision,
  listTenantSettingsRevisions,
  publishTenantSettings,
  restoreTenantSettingsRevision,
  saveTenantSettingsSection,
  validateTenantSettingsDraft,
} from "./settings.service.js";

function getTenantOrThrow(request: Request) {
  if (!request.tenant) throw new AppError("Le contexte tenant est introuvable.", 500, "TENANT_CONTEXT_MISSING");
  return request.tenant;
}

function getUserIdOrThrow(request: Request): string {
  if (!request.auth?.userId) throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
  return request.auth.userId;
}

async function getContext(request: Request) {
  const tenant = getTenantOrThrow(request);
  const actor = await resolveSettingsActor(tenant, getUserIdOrThrow(request));
  return { tenant, actor };
}

export async function getPublicSettingsController(request: Request, response: Response, next: NextFunction) {
  try {
    const data = await getPublicTenantSettings(getTenantOrThrow(request));
    response.status(200).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getSettingsController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    response.status(200).json({ success: true, data: await getTenantSettings(tenant, actor) });
  } catch (error) { next(error); }
}

export async function saveSettingsSectionController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    const { section } = settingsSectionParamsSchema.parse(request.params);
    const { value } = saveSettingsSectionSchema.parse(request.body);
    response.status(200).json({ success: true, data: await saveTenantSettingsSection({ tenant, actor, section, value }) });
  } catch (error) { next(error); }
}

export async function discardSettingsDraftController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    response.status(200).json({ success: true, data: await discardTenantSettingsDraft(tenant, actor) });
  } catch (error) { next(error); }
}

export async function validateSettingsDraftController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    response.status(200).json({ success: true, data: await validateTenantSettingsDraft(tenant, actor) });
  } catch (error) { next(error); }
}

export async function getSettingsImpactController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    response.status(200).json({ success: true, data: await getTenantSettingsImpact(tenant, actor) });
  } catch (error) { next(error); }
}

export async function publishSettingsController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    const { reason } = publishSettingsSchema.parse(request.body);
    response.status(200).json({ success: true, data: await publishTenantSettings({ tenant, actor, reason }) });
  } catch (error) { next(error); }
}

export async function listSettingsHistoryController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    const query = listSettingsHistoryQuerySchema.parse(request.query);
    response.status(200).json({ success: true, data: await listTenantSettingsRevisions({ tenant, actor, ...query }) });
  } catch (error) { next(error); }
}

export async function getSettingsRevisionController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    const { version } = settingsVersionParamsSchema.parse(request.params);
    response.status(200).json({ success: true, data: await getTenantSettingsRevision({ tenant, actor, version }) });
  } catch (error) { next(error); }
}

export async function restoreSettingsRevisionController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    const { version } = settingsVersionParamsSchema.parse(request.params);
    const { reason } = publishSettingsSchema.parse(request.body);
    response.status(200).json({ success: true, data: await restoreTenantSettingsRevision({ tenant, actor, version, reason }) });
  } catch (error) { next(error); }
}

export async function exportSettingsController(request: Request, response: Response, next: NextFunction) {
  try {
    const { tenant, actor } = await getContext(request);
    const payload = await exportTenantSettings(tenant, actor);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename=tenant-settings-v${payload.activeVersion}.json`);
    response.status(200).send(JSON.stringify(payload, null, 2));
  } catch (error) { next(error); }
}
