import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../core/errors/app-error.js";
import { TenantModel } from "../tenants/tenant.model.js";
import { changePasswordSchema, loginSchema } from "./auth.schema.js";
import {
  changeOwnPassword, getAuthenticatedUser, loginUserFromCredentials,
  logoutUserSession, refreshUserSession,
} from "./auth.service.js";
import {
  authCookieNames, clearAuthCookies, verifyAccessToken,
  verifyRefreshToken, writeAuthCookies,
} from "./auth.tokens.js";

function getTenantOrThrow(request: Request) {
  if (!request.tenant) throw new AppError("Le contexte organisationnel est introuvable.", 500, "TENANT_CONTEXT_MISSING");
  return request.tenant;
}
function readCookie(request: Request, name: string): string | null {
  const value = request.cookies?.[name];
  return typeof value === "string" && value.trim() ? value : null;
}

export async function restoreSessionController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = readCookie(request, authCookieNames.access);
    if (accessToken) {
      try {
        const payload = verifyAccessToken(accessToken);
        const tenant = await (TenantModel as any).findOne({ _id: payload.tid, status: "ACTIVE" }).exec();
        if (tenant) {
          const user = await getAuthenticatedUser({ tenant, userId: payload.sub });
          response.status(200).json({ success: true, data: {
            authenticated: true, user, tenant: { id: tenant.id, slug: tenant.slug },
          } });
          return;
        }
      } catch { /* Essayer la restauration via refresh. */ }
    }
    const refreshToken = readCookie(request, authCookieNames.refresh);
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        const tenant = await (TenantModel as any).findOne({ _id: payload.tid, status: "ACTIVE" }).exec();
        if (tenant) {
          const result = await refreshUserSession({ tenant, refreshToken, ipAddress: request.ip, userAgent: request.get("user-agent") });
          writeAuthCookies(response, result.tokens);
          response.status(200).json({ success: true, data: {
            authenticated: true, user: result.user, tenant: { id: tenant.id, slug: tenant.slug },
          } });
          return;
        }
      } catch { /* Session absente ou invalide : état anonyme. */ }
    }
    clearAuthCookies(response);
    response.status(200).json({ success: true, data: { authenticated: false, user: null, tenant: null } });
  } catch (error) { next(error); }
}

export async function loginController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const credentials = loginSchema.parse(request.body);
    const result = await loginUserFromCredentials({
      credentials, tenantSlug: request.get("x-tenant-slug"),
      ipAddress: request.ip, userAgent: request.get("user-agent"),
    });
    writeAuthCookies(response, result.tokens);
    response.status(200).json({ success: true, data: { user: result.user, tenant: result.tenant } });
  } catch (error) { next(error); }
}

export async function refreshController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);
    const refreshToken = readCookie(request, authCookieNames.refresh);
    if (!refreshToken) throw new AppError("Session de renouvellement introuvable.", 401, "AUTH_REFRESH_REQUIRED");
    const result = await refreshUserSession({ tenant, refreshToken, ipAddress: request.ip, userAgent: request.get("user-agent") });
    writeAuthCookies(response, result.tokens);
    response.status(200).json({ success: true, data: { user: result.user } });
  } catch (error) { clearAuthCookies(response); next(error); }
}

export async function getMeController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);
    if (!request.auth) throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
    const user = await getAuthenticatedUser({ tenant, userId: request.auth.userId });
    response.status(200).json({ success: true, data: { user } });
  } catch (error) { next(error); }
}

export async function changePasswordController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);
    if (!request.auth) throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
    const data = changePasswordSchema.parse(request.body);
    const result = await changeOwnPassword({ tenant, userId: request.auth.userId, data, ipAddress: request.ip, userAgent: request.get("user-agent") });
    writeAuthCookies(response, result.tokens);
    response.status(200).json({ success: true, data: { user: result.user } });
  } catch (error) { next(error); }
}

export async function logoutController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = getTenantOrThrow(request);
    const refreshToken = readCookie(request, authCookieNames.refresh);
    await logoutUserSession({ tenant, refreshToken: refreshToken ?? undefined });
    clearAuthCookies(response);
    response.status(204).send();
  } catch (error) { clearAuthCookies(response); next(error); }
}
