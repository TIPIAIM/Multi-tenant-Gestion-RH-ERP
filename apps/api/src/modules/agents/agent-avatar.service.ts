import type { Response } from "express";
import { Readable } from "node:stream";
import type { Types } from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryConfig } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { UserModel } from "../users/user.model.js";
import { AgentModel } from "./agent.model.js";
import { AgentPhotoAsset } from "./agent-photo.js";

export type AvatarResolution = {
  reason: "AVAILABLE" | "ACCOUNT_MISSING" | "NO_AGENT_LINK" | "BROKEN_AGENT_LINK" | "AMBIGUOUS_AGENT_LINK" | "CONFLICTING_AGENT_LINK" | "NO_AGENT_PHOTO" | "PHOTO_ASSET_MISSING" | "GROUP";
  link: "explicit" | "inverse" | "email" | "none";
  publicId?: string;
};

/** Display only: never changes account links or grants access to HR data. */
export async function resolveUserAvatar(tenantId: Types.ObjectId, userId: string): Promise<AvatarResolution> {
  const user = await UserModel.findOne({ _id: userId, tenantId, isActive: true })
    .select("_id agentId email").exec();
  if (!user) return { reason: "ACCOUNT_MISSING", link: "none" };
  let link: AvatarResolution["link"] = user.agentId ? "explicit" : "inverse";
  let candidates = await AgentModel.find({ tenantId,
    ...(user.agentId ? { _id: user.agentId } : { userId: user._id }),
  }).select("_id userId photoAssetId").limit(2).exec();
  if (!candidates.length && !user.agentId && user.email?.trim()) {
    const email = user.email.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    candidates = await AgentModel.find({ tenantId, employmentStatus: "ACTIVE", email: new RegExp(`^${email}$`, "i") })
      .select("_id userId photoAssetId").limit(2).exec();
    link = "email";
  }
  if (candidates.length > 1) return { reason: "AMBIGUOUS_AGENT_LINK", link };
  const agent = candidates[0];
  if (!agent) return { reason: user.agentId ? "BROKEN_AGENT_LINK" : "NO_AGENT_LINK", link };
  if (link === "email" && agent.userId && agent.userId.toString() !== user._id.toString()) {
    return { reason: "CONFLICTING_AGENT_LINK", link };
  }
  if (!agent.photoAssetId) return { reason: "NO_AGENT_PHOTO", link };
  const asset = await AgentPhotoAsset.findOne({ _id: agent.photoAssetId, tenantId,
    agentId: agent._id, state: "ATTACHED" }).lean().exec();
  return asset ? { reason: "AVAILABLE", link, publicId: asset.publicId }
    : { reason: "PHOTO_ASSET_MISSING", link };
}

export async function sendResolvedAvatar(response: Response, resolution: AvatarResolution, diagnostic: boolean): Promise<void> {
  response.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (diagnostic) {
    response.json({ success: true, data: { available: resolution.reason === "AVAILABLE",
      reason: resolution.reason, link: resolution.link, version: "avatars-unified-1" } });
    return;
  }
  if (!resolution.publicId || resolution.reason !== "AVAILABLE") { response.status(204).end(); return; }
  try {
    const config = getCloudinaryConfig();
    cloudinary.config({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret, secure: true });
  } catch { throw new AppError("Le stockage des photos n’est pas configuré.", 503, "PHOTO_STORAGE_NOT_CONFIGURED"); }
  const url = cloudinary.utils.private_download_url(resolution.publicId, "png", {
    resource_type: "image", type: "private", expires_at: Math.floor(Date.now() / 1000) + 60,
  });
  const result = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!result.ok || !result.body) throw new AppError("La photo n’a pas pu être récupérée depuis le stockage.", 502, "PHOTO_STORAGE_UNAVAILABLE");
  response.set("Content-Type", "image/png");
  const stream = Readable.fromWeb(result.body as Parameters<typeof Readable.fromWeb>[0]);
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
}
