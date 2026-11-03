import type { Model } from "mongoose";
import type { User } from "../users/user.types.js";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import { requireTrustedMutationOrigin } from "../../middlewares/mutation-origin.middleware.js";
import { UserModel } from "../users/user.model.js";
import { AppError } from "../../core/errors/app-error.js";
import { safeName, moduleLabels } from "./files.rules.js";
import { openStorage } from "./files.storage.js";
import * as service from "./files.service.js";
import * as exports from "./files.export.js";
import type { Actor } from "./files.types.js";
export const filesRouter = Router();
const actors = new WeakMap<Request, Actor>();
filesRouter.use(
  requireAuth,
  tenantContextMiddleware,
  requireTrustedMutationOrigin,
);
filesRouter.use((r, s, n) => {
  void (async () => {
    if (!r.auth || !r.tenant)
      throw new AppError(
        "Authentification requise.",
        401,
        "FILES_AUTH_REQUIRED",
      );
    const user = await (UserModel as Model<User>)
      .findOne({ _id: r.auth.userId, tenantId: r.tenant._id, isActive: true })
      .select("_id role fullName")
      .lean()
      .exec();
    if (!user || !["TENANT_ADMIN", "RH_MANAGER"].includes(user.role))
      throw new AppError(
        "Cet espace est réservé au RH et à l’administrateur.",
        403,
        "FILES_FORBIDDEN",
      );
    actors.set(r, {
      tenantId: r.tenant._id,
      slug: r.tenant.slug,
      userId: user._id,
      name: user.fullName,
      role: user.role,
    });
    s.setHeader("Cache-Control", "no-store");
    s.setHeader("X-Content-Type-Options", "nosniff");
    n();
  })().catch(n);
});
const key = z.string().regex(/^[a-f\d]{64}$/i),
  id = z.string().regex(/^[a-f\d]{24}$/i);
const filters = z.object({
  search: z.string().trim().max(180).optional(),
  module: z.enum(Object.keys(moduleLabels) as [string, ...string[]]).optional(),
  kind: z.enum(["all", "file", "link"]).optional(),
  recent: z.preprocess(
    (v) => (v === "true" ? true : v === "false" ? false : v),
    z.boolean().optional(),
  ),
});
function handle(work: (a: Actor, r: Request, s: Response) => Promise<unknown>) {
  return (r: Request, s: Response, n: NextFunction) => {
    void (async () => {
      const data = await work(actors.get(r)!, r, s);
      if (!s.headersSent) s.json({ success: true, data });
    })().catch((e) => {
      if (s.headersSent) {
        s.destroy();
        return;
      }
      if (
        r.method === "GET" &&
        (r.path.includes("/download") || r.path.startsWith("/exports/")) &&
        r.get("accept")?.includes("text/html")
      ) {
        const message = (
          e instanceof AppError
            ? e.message
            : "Le fichier n’a pas pu être téléchargé. Revenez à la plateforme et réessayez."
        ).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c]!,
        );
        s.status(e instanceof AppError ? e.statusCode : 500)
          .type("text/html")
          .send(
            `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Téléchargement indisponible</title><body><main><h1>Téléchargement indisponible</h1><p>${message}</p><p>Fermez cet onglet pour revenir à la plateforme.</p></main></body></html>`,
          );
        return;
      }
      n(e);
    });
  };
}
filesRouter.get(
  "/",
  handle((a, r) =>
    service.list(
      a,
      filters.parse(r.query),
      z.coerce.number().int().min(1).max(100000).default(1).parse(r.query.page),
    ),
  ),
);
filesRouter.get(
  "/exports",
  handle((a) => exports.listExports(a)),
);
filesRouter.post(
  "/exports",
  handle((a, r) => {
    const body = z
      .object({
        filters: filters.default({}),
        ids: z.array(key).min(1).max(1000).optional(),
      })
      .parse(r.body);
    return exports.startExport(a, body.filters, body.ids);
  }),
);
filesRouter.get(
  "/exports/:id/:part",
  handle(async (a, r, s) => {
    const result = await exports.openExport(
      a,
      id.parse(r.params.id),
      id.parse(r.params.part),
    );
    s.type("application/zip");
    s.setHeader("Content-Length", String(result.bytes));
    s.setTimeout(60 * 60 * 1000);
    disposition(s, result.name);
    await pipeline(result.stream, s);
  }),
);
filesRouter.post(
  "/pending/:id/retry",
  handle((a, r) => service.retry(a, id.parse(r.params.id))),
);
filesRouter.get(
  "/:key/preview-delete",
  handle((a, r) => service.deletionPreview(a, key.parse(r.params.key))),
);
filesRouter.delete(
  "/:key",
  handle((a, r) =>
    service.remove(
      a,
      key.parse(r.params.key),
      z.object({ token: key }).parse(r.body).token,
    ),
  ),
);
function disposition(s: Response, name: string, inline = false) {
  s.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="document"; filename*=UTF-8''${encodeURIComponent(safeName(name)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
  );
}
filesRouter.get(
  "/:key/download",
  handle(async (a, r, s) => {
    const entry = await service.get(a, key.parse(r.params.key));
    if (r.query.preview === "1" && entry.bytes > 50 * 1024 ** 2)
      throw new AppError(
        "Ce fichier est volumineux. Utilisez Télécharger pour le consulter sur votre ordinateur.",
        413,
        "FILES_PREVIEW_TOO_LARGE",
      );
    const stream = await openStorage(entry.storage, a);
    s.setTimeout(60 * 60 * 1000);
    const inline =
      r.query.preview === "1" &&
      entry.storage.kind !== "link" &&
      ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
        entry.mime,
      );
    s.type(inline ? entry.mime : "application/octet-stream");
    s.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    disposition(s, entry.name, inline);
    try {
      await service.audit(a, inline ? "VIEW" : "DOWNLOAD", entry.name);
      if (inline) {
        let previewBytes = 0;
        await pipeline(
          stream,
          new Transform({
            transform(chunk, _encoding, callback) {
              previewBytes += chunk.length;
              if (previewBytes > 50 * 1024 ** 2)
                callback(new Error("FILES_PREVIEW_TOO_LARGE"));
              else callback(null, chunk);
            },
          }),
          s,
        );
      } else {
        await pipeline(stream, s);
      }
    } catch (e) {
      stream.destroy();
      throw e;
    }
  }),
);
