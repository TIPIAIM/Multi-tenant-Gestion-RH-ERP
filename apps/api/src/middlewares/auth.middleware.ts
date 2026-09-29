import type { NextFunction, Request, Response } from "express";
import { AppError } from "../core/errors/app-error.js";
import { UserModel } from "../modules/users/user.model.js";
import type { UserRole } from "../modules/users/user.types.js";
import { authCookieNames, verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { hasPermission, type Permission } from "../modules/auth/permissions.js";

type AuthPayload = {
  sub: string;
  tid: string;
  sid: string;
  role: UserRole;
};

function getAccessTokenFromRequest(request: Request): string | null {
  const cookieToken = request.cookies?.[authCookieNames.access];

  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken;
  }

  const authorization = request.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return null;
}

export async function requireAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const accessToken = getAccessTokenFromRequest(request);

    if (!accessToken) {
      throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
    }

    const payload = verifyAccessToken(accessToken) as AuthPayload;

    const user = (await (UserModel as any)
      .findOne({
        _id: payload.sub,
        tenantId: payload.tid,
        isActive: true,
      })
      .select("_id role isActive")
      .lean()
      .exec()) as { _id: unknown; role?: UserRole; isActive?: boolean } | null;

    if (!user?.role) {
      throw new AppError(
        "Votre session utilisateur est invalide ou inactive.",
        401,
        "AUTH_USER_INACTIVE",
      );
    }

    /**
     * La base de données est la source de vérité du rôle.
     * Cela évite qu'un ancien cookie garde un rôle obsolète après modification du compte.
     */
    request.auth = {
      userId: payload.sub,
      tenantId: payload.tid,
      sessionId: payload.sid,
      role: user.role,
    } as any;

    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermissions(...permissions: Permission[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    try {
      const role = (request.auth as any)?.role as UserRole | undefined;

      if (!role) {
        throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
      }

      if (permissions.every((permission) => hasPermission(role, permission))) {
        next();
        return;
      }

      throw new AppError(
        "Vous ne disposez pas des droits requis pour cette action.",
        403,
        "AUTH_PERMISSION_DENIED",
      );
    } catch (error) {
      next(error);
    }
  };
}
