import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../core/errors/app-error.js";
import { resolveUserAvatar, sendResolvedAvatar } from "../agents/agent-avatar.service.js";

export async function getOwnAvatar(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.auth || !request.tenant) throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
    const resolution = await resolveUserAvatar(request.tenant._id, request.auth.userId);
    if (resolution.reason === "ACCOUNT_MISSING") throw new AppError("Compte indisponible.", 401, "AUTH_USER_UNAVAILABLE");
    await sendResolvedAvatar(response, resolution, request.query.diagnostic === "1");
  } catch (error) { next(error); }
}
