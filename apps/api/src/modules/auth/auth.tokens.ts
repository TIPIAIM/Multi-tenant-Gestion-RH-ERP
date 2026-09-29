import { randomUUID } from "node:crypto";
import type { CookieOptions, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { userRoles } from "../users/user.types.js";
import type {
  AuthTokenPayload,
  AuthTokenType,
  AuthTokens,
} from "./auth.types.js";

export const authCookieNames = {
  access: "fades_access_token",
  refresh: "fades_refresh_token",
} as const;

function createToken(
  payload: Omit<AuthTokenPayload, "iat" | "exp" | "jti">,
  secret: string,
  expiresIn: SignOptions["expiresIn"]
): string {
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn,
    issuer: "fades-rh-api",
    audience: "fades-rh-web",
    jwtid: randomUUID(),
  });
}

export function issueAuthTokens(input: {
  userId: string;
  tenantId: string;
  sessionId: string;
  role: AuthTokenPayload["role"];
}): AuthTokens {
  const commonPayload = {
    sub: input.userId,
    tid: input.tenantId,
    sid: input.sessionId,
    role: input.role,
  };

  return {
    accessToken: createToken(
      {
        ...commonPayload,
        tokenType: "access",
      },
      env.jwtAccessSecret,
      env.jwtAccessExpiresIn
    ),

    refreshToken: createToken(
      {
        ...commonPayload,
        tokenType: "refresh",
      },
      env.jwtRefreshSecret,
      env.jwtRefreshExpiresIn
    ),
  };
}

function verifyToken(
  token: string,
  secret: string,
  expectedTokenType: AuthTokenType
): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: "fades-rh-api",
      audience: "fades-rh-web",
    });

    if (
      typeof decoded === "string" ||
      !decoded.sub ||
      !decoded.tid ||
      !decoded.sid ||
      !decoded.role ||
      !decoded.tokenType ||
      decoded.tokenType !== expectedTokenType ||
      !userRoles.includes(decoded.role as AuthTokenPayload["role"])
    ) {
      throw new Error("Token invalide.");
    }

    return decoded as AuthTokenPayload;
  } catch {
    throw new AppError(
      "Votre session est invalide ou expirée.",
      401,
      "AUTH_TOKEN_INVALID"
    );
  }
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return verifyToken(token, env.jwtAccessSecret, "access");
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return verifyToken(token, env.jwtRefreshSecret, "refresh");
}

function getBaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
  };
}

export function writeAuthCookies(response: Response, tokens: AuthTokens): void {
  response.cookie(authCookieNames.access, tokens.accessToken, {
    ...getBaseCookieOptions(),
    maxAge: env.jwtAccessCookieMaxAgeMs,
  });

  response.cookie(authCookieNames.refresh, tokens.refreshToken, {
    ...getBaseCookieOptions(),
    maxAge: env.jwtRefreshCookieMaxAgeMs,
  });
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie(authCookieNames.access, getBaseCookieOptions());

  response.clearCookie(authCookieNames.refresh, getBaseCookieOptions());
}
