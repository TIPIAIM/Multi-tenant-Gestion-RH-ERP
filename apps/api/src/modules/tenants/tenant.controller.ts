import type {
  NextFunction,
  Request,
  Response,
} from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { loginUser } from "../auth/auth.service.js";
import { writeAuthCookies } from "../auth/auth.tokens.js";
import {
  selectTenantSchema,
  selfRegisterTenantSchema,
  tenantAvailabilityParamsSchema,
  tenantSlugParamsSchema,
} from "./tenant.schema.js";
import {
  checkTenantSlugAvailability,
  getPublicTenantBySlug,
  registerTenantFromInterface,
} from "./tenant.service.js";
import { TenantModel } from "./tenant.model.js";

export const tenantSlugCookieName = "fades_tenant_slug";

function writeTenantSlugCookie(response: Response, slug: string): void {
  response.cookie(tenantSlugCookieName, slug, {
    httpOnly: false,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
}

export async function getCurrentTenantController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!request.tenant) {
      throw new AppError(
        "Le contexte organisationnel est introuvable.",
        500,
        "TENANT_CONTEXT_MISSING",
      );
    }

    response.status(200).json({
      success: true,
      data: {
        id: request.tenant.id,
        name: request.tenant.name,
        legalName: request.tenant.legalName,
        slug: request.tenant.slug,
        status: request.tenant.status,
        branding: request.tenant.branding,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getPublicTenantController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = tenantSlugParamsSchema.parse(request.params);
    const tenant = await getPublicTenantBySlug(slug);

    response.status(200).json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

export async function checkTenantSlugAvailabilityController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = tenantAvailabilityParamsSchema.parse(request.params);
    response.status(200).json({
      success: true,
      data: await checkTenantSlugAvailability(slug),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Création du tenant + premier TENANT_ADMIN + ouverture immédiate de session.
 * Le mot de passe n'est jamais renvoyé au frontend.
 */
export async function registerTenantController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = selfRegisterTenantSchema.parse(request.body);
    const result = await registerTenantFromInterface(input);

    const tenant = await (TenantModel as any)
      .findOne({
        _id: result.tenant.id,
        slug: result.tenant.slug,
        status: "ACTIVE",
      })
      .exec();

    if (!tenant) {
      throw new AppError(
        "L'espace créé n'a pas pu être rouvert pour l'authentification.",
        500,
        "TENANT_REGISTRATION_AUTH_TENANT_NOT_FOUND",
      );
    }

    const authResult = await loginUser({
      tenant,
      credentials: {
        email: input.administrator.email,
        // IMPORTANT : ne jamais trim() le mot de passe.
        password: input.administrator.password,
      },
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
    });

    writeTenantSlugCookie(response, result.tenant.slug);
    writeAuthCookies(response, authResult.tokens);

    response.status(201).json({
      success: true,
      data: {
        ...result,
        authentication: {
          authenticated: true,
          user: authResult.user,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function selectTenantController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = selectTenantSchema.parse(request.body);
    const tenant = await getPublicTenantBySlug(slug);

    writeTenantSlugCookie(response, tenant.slug);

    response.status(200).json({
      success: true,
      data: {
        tenant,
        selected: true,
      },
    });
  } catch (error) {
    next(error);
  }
}
