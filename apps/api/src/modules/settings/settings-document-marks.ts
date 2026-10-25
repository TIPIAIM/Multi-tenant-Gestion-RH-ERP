import mongoose, {
  Schema,
  Types,
  type Model,
  type InferSchemaType,
} from "mongoose";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryConfig } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import type { User } from "../users/user.types.js";
import { UserModel } from "../users/user.model.js";
import {
  assertLogoFile,
  SETTINGS_LOGO_MAX_BYTES,
} from "./settings-logo.upload.js";

const kinds = ["stamp", "signature"] as const;
export type DocumentMarkKind = (typeof kinds)[number];
const currentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, unique: true },
    revision: { type: Number, required: true, default: 0 },
    stamp: Schema.Types.ObjectId,
    signature: Schema.Types.ObjectId,
  },
  { timestamps: true },
);
const assetSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: kinds, required: true },
    publicId: { type: String, required: true, unique: true },
    state: {
      type: String,
      enum: ["PENDING", "ATTACHED", "DELETE_PENDING", "DELETING", "DELETED"],
      required: true,
    },
    nextAttemptAt: { type: Date, default: Date.now },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);
assetSchema.index({ state: 1, nextAttemptAt: 1 });
const Current: Model<InferSchemaType<typeof currentSchema>> =
  (mongoose.models.TenantDocumentMarks as
    Model<InferSchemaType<typeof currentSchema>> | undefined) ??
  mongoose.model("TenantDocumentMarks", currentSchema);
const Asset: Model<InferSchemaType<typeof assetSchema>> =
  (mongoose.models.TenantDocumentMarkAsset as
    Model<InferSchemaType<typeof assetSchema>> | undefined) ??
  mongoose.model("TenantDocumentMarkAsset", assetSchema);
let initialized: Promise<unknown> | undefined;
function init() {
  initialized ??= Promise.all([Current.init(), Asset.init()]).catch((error) => {
    initialized = undefined;
    throw error;
  });
  return initialized;
}
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
      "Le stockage Cloudinary des cachets et signatures n’est pas configuré.",
      503,
      "DOCUMENT_MARK_STORAGE_NOT_CONFIGURED",
    );
  }
}
export async function getTenantDocumentMarks(tenantId: Types.ObjectId) {
  const row = await Current.findOne({ tenantId }).lean().exec();
  return {
    revision: row?.revision ?? 0,
    stamp: Boolean(row?.stamp),
    signature: Boolean(row?.signature),
  };
}
/** Never expose the storage URL, even to the browser. Normalized images are private PNGs. */
export async function loadTenantDocumentMark(
  tenantId: Types.ObjectId,
  kind: DocumentMarkKind,
): Promise<Buffer> {
  const current = await Current.findOne({ tenantId }).lean().exec();
  const asset =
    current?.[kind] &&
    (await Asset.findOne({
      _id: current[kind],
      tenantId,
      kind,
      state: "ATTACHED",
    })
      .lean()
      .exec());
  if (!asset)
    throw new AppError(
      `Le ${kind === "stamp" ? "cachet" : "visuel de signature"} n’est pas configuré.`,
      409,
      "DOCUMENT_MARK_NOT_CONFIGURED",
    );
  configure();
  const url = cloudinary.utils.private_download_url(asset.publicId, "png", {
    resource_type: "image",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 60,
  });
  const result = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!result.ok || !result.body)
    throw new AppError(
      "Le visuel est temporairement indisponible. Réessayez avant d’éditer le bulletin.",
      502,
      "DOCUMENT_MARK_UNAVAILABLE",
    );
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of result.body) {
    bytes += chunk.byteLength;
    if (bytes > 4 * 1024 * 1024)
      throw new AppError(
        "Le visuel est trop volumineux.",
        502,
        "DOCUMENT_MARK_UNAVAILABLE",
      );
    chunks.push(Buffer.from(chunk));
  }
  const data = Buffer.concat(chunks);
  if (
    !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new AppError(
      "Le visuel n’est pas une image imprimable.",
      502,
      "DOCUMENT_MARK_UNAVAILABLE",
    );
  return data;
}
let cleaning = false;
/** Durable retry queue: replacements stay successful if Cloudinary deletion is temporarily unavailable. */
export async function processDocumentMarksCleanup() {
  if (cleaning || mongoose.connection.readyState !== 1) return;
  cleaning = true;
  try {
    await init();
    for (let i = 0; i < 20; i++) {
      const now = new Date();
      const asset = await Asset.findOneAndUpdate(
        {
          $or: [
            { state: "DELETE_PENDING", nextAttemptAt: { $lte: now } },
            { state: "DELETING", nextAttemptAt: { $lte: now } },
            {
              state: "PENDING",
              updatedAt: { $lt: new Date(Date.now() - 15 * 60_000) },
            },
          ],
        },
        {
          $set: {
            state: "DELETING",
            nextAttemptAt: new Date(Date.now() + 5 * 60_000),
          },
          $inc: { attempts: 1 },
        },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      if (!asset) break;
      try {
        const live = await Current.exists({
          tenantId: asset.tenantId,
          $or: [{ stamp: asset._id }, { signature: asset._id }],
        });
        if (live) {
          await Asset.updateOne(
            { _id: asset._id },
            { $set: { state: "ATTACHED" } },
          );
          continue;
        }
        configure();
        const result = await cloudinary.uploader.destroy(asset.publicId, {
          resource_type: "image",
          type: "authenticated",
          invalidate: true,
        });
        if (!["ok", "not found"].includes(result.result))
          throw new Error("Suppression différée");
        await Asset.updateOne(
          { _id: asset._id },
          { $set: { state: "DELETED" } },
        );
      } catch {
        await Asset.updateOne(
          { _id: asset._id },
          {
            $set: {
              state: "DELETE_PENDING",
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(3600_000, 60_000 * 2 ** Math.min(asset.attempts, 6)),
              ),
            },
          },
        );
      }
    }
  } catch (error) {
    console.error(
      "[document-marks] Nettoyage différé",
      error instanceof Error ? error.message : "Erreur",
    );
  } finally {
    cleaning = false;
  }
}
const timer = setInterval(() => {
  void processDocumentMarksCleanup();
}, 60_000);
timer.unref();

async function replace(
  tenantId: Types.ObjectId,
  kind: DocumentMarkKind,
  revision: number,
  buffer?: Buffer,
) {
  await init();
  // Existing database already uses transactions for company settings. MongoDB replica set required.
  let assetId: Types.ObjectId | undefined;
  if (buffer) {
    configure();
    const publicId = `rh-platform/tenants/${tenantId}/document-marks/${kind}/${randomUUID()}`;
    const asset = await Asset.create({
      tenantId,
      kind,
      publicId,
      state: "PENDING",
    });
    assetId = asset._id;
    try {
      await new Promise<void>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: "image",
            type: "authenticated",
            overwrite: false,
            format: "png",
            transformation: [{ width: 900, height: 400, crop: "limit" }],
            timeout: 30_000,
          },
          (error, result) =>
            error || !result
              ? reject(
                  new AppError(
                    "Enregistrement du visuel impossible.",
                    502,
                    "DOCUMENT_MARK_UPLOAD_FAILED",
                  ),
                )
              : resolve(),
        );
        Readable.from([buffer])
          .on("error", reject)
          .pipe(stream)
          .on("error", reject);
      });
    } catch (error) {
      await Asset.updateOne(
        { _id: assetId },
        { $set: { state: "DELETE_PENDING", nextAttemptAt: new Date() } },
      );
      throw error;
    }
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      let current = await Current.findOne({ tenantId }).session(session).exec();
      if (!current) {
        if (revision !== 0)
          throw new AppError(
            "Les visuels ont changé. Rechargez la configuration.",
            409,
            "DOCUMENT_MARK_CONFLICT",
          );
        const created = await Current.create([{ tenantId, revision: 0 }], {
          session,
        });
        current = created[0] ?? null;
      }
      if (!current)
        throw new AppError(
          "Configuration indisponible.",
          503,
          "DOCUMENT_MARK_UNAVAILABLE",
        );
      if (current.revision !== revision)
        throw new AppError(
          "Les visuels ont changé. Rechargez la configuration.",
          409,
          "DOCUMENT_MARK_CONFLICT",
        );
      const oldId = current[kind];
      const updated = await Current.updateOne(
        { _id: current._id, tenantId, revision },
        assetId
          ? { $set: { [kind]: assetId }, $inc: { revision: 1 } }
          : { $unset: { [kind]: 1 }, $inc: { revision: 1 } },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new AppError(
          "Configuration modifiée en parallèle.",
          409,
          "DOCUMENT_MARK_CONFLICT",
        );
      if (assetId) {
        const attached = await Asset.updateOne(
          { _id: assetId, tenantId, state: "PENDING" },
          { $set: { state: "ATTACHED" } },
          { session },
        );
        if (attached.modifiedCount !== 1)
          throw new AppError(
            "Le téléversement a expiré. Réessayez.",
            409,
            "DOCUMENT_MARK_UPLOAD_EXPIRED",
          );
      }
      if (oldId)
        await Asset.updateOne(
          { _id: oldId, tenantId },
          { $set: { state: "DELETE_PENDING", nextAttemptAt: new Date() } },
          { session },
        );
    });
  } catch (error) {
    if (assetId)
      await Asset.updateOne(
        { _id: assetId, state: "PENDING" },
        { $set: { state: "DELETE_PENDING", nextAttemptAt: new Date() } },
      );
    if ((error as { code?: number }).code === 11000)
      throw new AppError(
        "La configuration a été créée en parallèle. Rechargez les visuels.",
        409,
        "DOCUMENT_MARK_CONFLICT",
      );
    throw error;
  } finally {
    await session.endSession();
    void processDocumentMarksCleanup();
  }
  return getTenantDocumentMarks(tenantId);
}
const handle =
  (fn: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
export const tenantDocumentMarksRouter = Router();
// Mounted after requireAuth + tenantContext + origin guard in settings.routes.
tenantDocumentMarksRouter.use(
  handle(async (req, _res, next) => {
    const account = await (UserModel as Model<User>)
      .findOne({
        _id: req.auth?.userId,
        tenantId: req.tenant?._id,
        isActive: true,
      })
      .select("role")
      .lean()
      .exec();
    if (!account || !["TENANT_ADMIN", "RH_MANAGER"].includes(account.role))
      throw new AppError(
        "Accès réservé à l’administration et aux RH.",
        403,
        "DOCUMENT_MARK_FORBIDDEN",
      );
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      account.role !== "TENANT_ADMIN"
    )
      throw new AppError(
        "Seul l’administrateur configure ces visuels.",
        403,
        "DOCUMENT_MARK_FORBIDDEN",
      );
    next();
  }),
);
tenantDocumentMarksRouter.get(
  "/",
  handle(async (req, res) => {
    res
      .set("Cache-Control", "private, no-store")
      .json({
        success: true,
        data: await getTenantDocumentMarks(req.tenant!._id),
      });
  }),
);
tenantDocumentMarksRouter.get(
  "/:kind",
  handle(async (req, res) => {
    const kind = z.enum(kinds).parse(req.params.kind);
    res
      .set({
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(await loadTenantDocumentMark(req.tenant!._id, kind));
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: SETTINGS_LOGO_MAX_BYTES,
    files: 1,
    fields: 1,
    fieldSize: 100,
  },
}).single("image");
const parseUpload: RequestHandler = (req, res, next) =>
  upload(req, res, (error) =>
    next(
      error instanceof multer.MulterError
        ? new AppError(
            "Choisissez une image de 2 Mo maximum.",
            400,
            "DOCUMENT_MARK_UPLOAD_INVALID",
          )
        : error,
    ),
  );
tenantDocumentMarksRouter.post(
  "/:kind",
  parseUpload,
  handle(async (req, res) => {
    const kind = z.enum(kinds).parse(req.params.kind);
    const revision = z.coerce.number().int().min(0).parse(req.body.revision);
    if (!req.file)
      throw new AppError(
        "Choisissez une image.",
        400,
        "DOCUMENT_MARK_REQUIRED",
      );
    assertLogoFile(req.file.buffer, req.file.mimetype);
    res.json({
      success: true,
      data: await replace(req.tenant!._id, kind, revision, req.file.buffer),
    });
  }),
);
tenantDocumentMarksRouter.delete(
  "/:kind",
  handle(async (req, res) => {
    const kind = z.enum(kinds).parse(req.params.kind);
    const { revision } = z
      .object({ revision: z.number().int().min(0) })
      .strict()
      .parse(req.body);
    res.json({
      success: true,
      data: await replace(req.tenant!._id, kind, revision),
    });
  }),
);
