import { requireTrustedMutationOrigin } from "../../middlewares/mutation-origin.middleware.js";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import multer from "multer";
import { Router, type Request, type RequestHandler } from "express";
import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryConfig } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "./agent.model.js";
import {
  assertCanManageAgents,
  assertCanReadAgent,
  resolveAgentActor,
} from "./agent.access.js";
import { assertLogoFile } from "../settings/settings-logo.upload.js";
const photoSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    agentId: { type: Schema.Types.ObjectId, required: true },
    publicId: { type: String, required: true, unique: true },
    state: {
      type: String,
      enum: ["PENDING", "ATTACHED", "DELETING", "DELETED"],
      default: "PENDING",
    },
    nextAttemptAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);
photoSchema.index({ state: 1, nextAttemptAt: 1 });
export const AgentPhotoAsset: Model<InferSchemaType<typeof photoSchema>> =
  (mongoose.models.AgentPhotoAsset as
    | Model<InferSchemaType<typeof photoSchema>>
    | undefined) ??
  mongoose.model<InferSchemaType<typeof photoSchema>>(
    "AgentPhotoAsset",
    photoSchema,
  );
function configure() {
  try {
    const c = getCloudinaryConfig();
    cloudinary.config({
      cloud_name: c.cloudName,
      api_key: c.apiKey,
      api_secret: c.apiSecret,
      secure: true,
    });
  } catch {
    throw new AppError(
      "Le stockage des photos n’est pas configuré.",
      503,
      "PHOTO_STORAGE_NOT_CONFIGURED",
    );
  }
}
function photoError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /Transaction numbers are only allowed|replica set|does not support transactions/i.test(
    message,
  )
    ? new AppError(
        "Les photos nécessitent MongoDB Atlas ou un replica set pour sécuriser leur remplacement.",
        503,
        "PHOTO_TRANSACTIONS_REQUIRED",
      )
    : error;
}
const parse = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1 },
}).single("photo");
const upload: RequestHandler = (req, res, next) =>
  parse(req, res, (error) =>
    next(
      error
        ? new AppError(
            "Choisissez une image PNG, JPEG ou WebP de 2 Mo maximum.",
            400,
            "PHOTO_UPLOAD_INVALID",
          )
        : undefined,
    ),
  );
async function context(req: Request, manage = false) {
  if (!req.tenant || !req.auth)
    throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
  const id = String(req.params.id ?? "");
  if (!/^[a-f\d]{24}$/i.test(id))
    throw new AppError("Identifiant invalide.", 400, "AGENT_ID_INVALID");
  const actor = await resolveAgentActor(req.tenant, req.auth.userId);
  if (manage) assertCanManageAgents(actor);
  const agent = await (AgentModel as any)
    .findOne({ _id: id, tenantId: req.tenant._id })
    .exec();
  if (!agent) throw new AppError("Agent introuvable.", 404, "AGENT_NOT_FOUND");
  assertCanReadAgent(agent, actor);
  return { agent, actor, tenant: req.tenant };
}
const manage: RequestHandler = async (req, _res, next) => {
  try {
    await context(req, true);
    next();
  } catch (e) {
    next(photoError(e));
  }
};
export const agentPhotoRouter = Router({ mergeParams: true });
agentPhotoRouter.use(requireTrustedMutationOrigin);
agentPhotoRouter.get("/", async (req, res, next) => {
  try {
    const { agent, tenant } = await context(req);
    if (!agent.photoAssetId)
      throw new AppError("Photo absente.", 404, "PHOTO_NOT_FOUND");
    const asset = await AgentPhotoAsset.findOne({
      _id: agent.photoAssetId,
      tenantId: tenant._id,
      state: "ATTACHED",
    })
      .lean()
      .exec();
    if (!asset) throw new AppError("Photo absente.", 404, "PHOTO_NOT_FOUND");
    configure();
    const url = cloudinary.utils.private_download_url(asset.publicId, "png", {
      resource_type: "image",
      type: "private",
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    const result = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!result.ok || !result.body)
      throw new AppError(
        "Photo temporairement indisponible.",
        502,
        "PHOTO_UNAVAILABLE",
      );
    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const stream = Readable.fromWeb(result.body as any);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (e) {
    next(photoError(e));
  }
});
agentPhotoRouter.post("/", manage, upload, async (req, res, next) => {
  let asset: any;
  try {
    const { agent, tenant } = await context(req, true);
    if (!req.file)
      throw new AppError("Choisissez une photo.", 400, "PHOTO_REQUIRED");
    assertLogoFile(req.file.buffer, req.file.mimetype);
    const expected = Number(req.body.revision);
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw new AppError(
        "Version de photo invalide.",
        400,
        "PHOTO_REVISION_REQUIRED",
      );
    configure();
    asset = await AgentPhotoAsset.create({
      tenantId: tenant._id,
      agentId: agent._id,
      publicId: `rh-platform/tenants/${tenant.id}/agents/${agent.id}/${randomUUID()}`,
      nextAttemptAt: new Date(Date.now() + 15 * 60_000),
    });
    await new Promise<void>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: asset.publicId,
          resource_type: "image",
          type: "private",
          format: "png",
          overwrite: false,
          transformation: [
            { width: 512, height: 512, crop: "fill", gravity: "auto" },
          ],
          timeout: 30000,
        },
        (error, result) =>
          error || !result
            ? reject(
                new AppError(
                  "Impossible d’enregistrer la photo.",
                  502,
                  "PHOTO_STORAGE_FAILED",
                ),
              )
            : resolve(),
      );
      stream.end(req.file!.buffer);
    });
    await mongoose.connection.transaction(async (session) => {
      const filter = {
        _id: agent._id,
        tenantId: tenant._id,
        ...(expected === 0
          ? {
              $or: [
                { photoRevision: 0 },
                { photoRevision: { $exists: false } },
              ],
            }
          : { photoRevision: expected }),
      };
      const updated = await (AgentModel as any)
        .findOneAndUpdate(
          filter,
          { $set: { photoAssetId: asset._id }, $inc: { photoRevision: 1 } },
          { new: true, session },
        )
        .exec();
      if (!updated)
        throw new AppError(
          "La photo a changé. Rechargez le dossier.",
          409,
          "PHOTO_CONFLICT",
        );
      await AgentPhotoAsset.updateOne(
        { _id: asset._id, state: "PENDING" },
        { $set: { state: "ATTACHED" } },
        { session },
      ).exec();
      if (agent.photoAssetId)
        await AgentPhotoAsset.updateOne(
          { _id: agent.photoAssetId, tenantId: tenant._id },
          { $set: { state: "PENDING", nextAttemptAt: new Date() } },
          { session },
        ).exec();
    });
    res
      .status(201)
      .json({ success: true, data: { photoRevision: expected + 1 } });
    void cleanupAgentPhotos();
  } catch (e) {
    if (asset)
      await AgentPhotoAsset.updateOne(
        { _id: asset._id, state: "PENDING" },
        { $set: { nextAttemptAt: new Date() } },
      )
        .exec()
        .catch(() => undefined);
    next(photoError(e));
  }
});
agentPhotoRouter.delete("/", manage, async (req, res, next) => {
  try {
    const { agent, tenant } = await context(req, true);
    const expected = Number(req.body.revision);
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw new AppError("Version invalide.", 400, "PHOTO_REVISION_REQUIRED");
    await mongoose.connection.transaction(async (session) => {
      const updated = await (AgentModel as any)
        .findOneAndUpdate(
          {
            _id: agent._id,
            tenantId: tenant._id,
            ...(expected === 0
              ? {
                  $or: [
                    { photoRevision: 0 },
                    { photoRevision: { $exists: false } },
                  ],
                }
              : { photoRevision: expected }),
          },
          { $unset: { photoAssetId: 1 }, $inc: { photoRevision: 1 } },
          { new: true, session },
        )
        .exec();
      if (!updated)
        throw new AppError(
          "La photo a changé. Rechargez le dossier.",
          409,
          "PHOTO_CONFLICT",
        );
      if (agent.photoAssetId)
        await AgentPhotoAsset.updateOne(
          { _id: agent.photoAssetId, tenantId: tenant._id },
          { $set: { state: "PENDING", nextAttemptAt: new Date() } },
          { session },
        ).exec();
    });
    res.json({ success: true, data: { photoRevision: expected + 1 } });
    void cleanupAgentPhotos();
  } catch (e) {
    next(photoError(e));
  }
});
let cleaning = false;
export async function cleanupAgentPhotos() {
  if (cleaning) return;
  cleaning = true;
  try {
    const jobs = await AgentPhotoAsset.find({
      state: { $in: ["PENDING", "DELETING", "ATTACHED"] },
      nextAttemptAt: { $lte: new Date() },
    })
      .limit(20)
      .lean()
      .exec();
    for (const job of jobs) {
      if (
        await (AgentModel as any).exists({
          tenantId: job.tenantId,
          photoAssetId: job._id,
        })
      ) {
        await AgentPhotoAsset.updateOne(
          { _id: job._id },
          {
            $set: {
              state: "ATTACHED",
              nextAttemptAt: new Date(Date.now() + 15 * 60000),
            },
          },
        ).exec();
        continue;
      }
      const claimed = await AgentPhotoAsset.findOneAndUpdate(
        { _id: job._id, state: job.state, nextAttemptAt: job.nextAttemptAt },
        {
          $set: {
            state: "DELETING",
            nextAttemptAt: new Date(Date.now() + 120000),
          },
        },
        { new: true },
      ).exec();
      if (!claimed) continue;
      try {
        configure();
        if (
          !job.publicId.startsWith(
            `rh-platform/tenants/${job.tenantId}/agents/`,
          )
        )
          throw new Error("Invalid owned prefix");
        const result = await cloudinary.uploader.destroy(job.publicId, {
          resource_type: "image",
          type: "private",
          invalidate: true,
        });
        if (!["ok", "not found"].includes(result.result))
          throw new Error("Deletion failed");
        await AgentPhotoAsset.updateOne(
          { _id: job._id },
          { $set: { state: "DELETED" } },
        ).exec();
      } catch {
        await AgentPhotoAsset.updateOne(
          { _id: job._id },
          {
            $set: {
              state: "PENDING",
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(
                    3600000,
                    60000 * 2 ** Math.min(6, job.attempts ?? 0),
                  ),
              ),
            },
            $inc: { attempts: 1 },
          },
        ).exec();
      }
    }
  } catch {
    console.warn("[Agents] Nettoyage des photos différé.");
  } finally {
    cleaning = false;
  }
}
export function startAgentPhotoCleanup() {
  const timer = setInterval(() => void cleanupAgentPhotos(), 60000);
  timer.unref();
  void cleanupAgentPhotos();
  return () => clearInterval(timer);
}
