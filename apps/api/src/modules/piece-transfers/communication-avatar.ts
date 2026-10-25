import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../core/errors/app-error.js";
import { getCommunicationAvatarTarget } from "./piece-transfer.service.js";
import { resolveUserAvatar, sendResolvedAvatar } from "../agents/agent-avatar.service.js";

export async function getCommunicationAvatar(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.auth || !request.tenant) throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
    const transferId = String(request.params.id ?? "");
    const target = request.query.userId;
    if (!/^[a-f\d]{24}$/i.test(transferId) || (target !== undefined &&
      (typeof target !== "string" || !/^[a-f\d]{24}$/i.test(target)))) {
      throw new AppError("Identifiant invalide.", 400, "AVATAR_ID_INVALID");
    }
    const targetUserId = await getCommunicationAvatarTarget(request.tenant,
      { userId: request.auth.userId, role: request.auth.role }, transferId, target as string | undefined);
    const resolution = targetUserId ? await resolveUserAvatar(request.tenant._id, targetUserId)
      : { reason: "GROUP" as const, link: "none" as const };
    await sendResolvedAvatar(response, resolution, request.query.diagnostic === "1");
  } catch (error) { next(error); }
}
