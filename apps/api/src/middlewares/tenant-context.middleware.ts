import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "../core/errors/app-error.js";
import { TenantModel } from "../modules/tenants/tenant.model.js";

export const tenantSlugCookieName = "fades_tenant_slug";

function normalizeSlug(value: unknown): string | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized || null;
}

export const tenantContextMiddleware: RequestHandler = async (
  request,
  _response,
  next,
) => {
  try {
    /**
     * Pour une requête déjà authentifiée, le tenant du token/session
     * est la source de vérité.
     */
    const authenticatedTenantId = request.auth?.tenantId;

    if (authenticatedTenantId) {
      const tenant = await TenantModel.findOne({
        _id: authenticatedTenantId,
        status: "ACTIVE",
      }).exec();

      if (!tenant) {
        throw new AppError(
          "Le tenant associé à votre session est introuvable ou inactif.",
          401,
          "AUTH_TENANT_NOT_FOUND",
        );
      }

      request.tenant = tenant;
      next();
      return;
    }

    /**
     * Routes publiques (notamment /auth/login) :
     * 1. x-tenant-slug envoyé explicitement par le frontend ;
     * 2. cookie sélectionné ;
     * 3. tenant par défaut historique.
     */
    const headerSlug = normalizeSlug(
      request.get("x-tenant-slug"),
    );

    const cookieSlug = normalizeSlug(
      request.cookies?.[tenantSlugCookieName],
    );

    const defaultSlug = normalizeSlug(
      env.defaultTenantSlug,
    );

    const slug =
      headerSlug ??
      cookieSlug ??
      defaultSlug;

    if (!slug) {
      throw new AppError(
        "Aucun espace organisationnel n'a été sélectionné.",
        400,
        "TENANT_CONTEXT_REQUIRED",
      );
    }

    const tenant = await TenantModel.findOne({
      slug,
      status: "ACTIVE",
    }).exec();

    if (!tenant) {
      throw new AppError(
        `Tenant introuvable ou inactif : ${slug}`,
        404,
        "TENANT_NOT_FOUND",
      );
    }

    request.tenant = tenant;
    next();
  } catch (error) {
    next(error);
  }
};
