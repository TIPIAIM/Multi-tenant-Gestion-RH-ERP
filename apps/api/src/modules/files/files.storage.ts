import { createReadStream } from "node:fs";
import { lstat, realpath, unlink } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryConfig } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { isWithin, cloudOwned } from "./files.rules.js";
import type { Storage, Actor } from "./files.types.js";
const error = (message: string) =>
  new AppError(message, 422, "FILES_STORAGE_UNAVAILABLE");
export function isPublicAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0)
    );
  }
  // Only global unicast IPv6. Reject mapped IPv4, local, multicast, Teredo/6to4.
  return (
    isIP(ip) === 6 &&
    /^[23]/i.test(ip) &&
    !/^2002:/i.test(ip) &&
    !/^2001:(0+:|:)/i.test(ip) &&
    !/^2001:db8:/i.test(ip)
  );
}
export async function publicStream(
  address: string,
  redirects = 0,
): Promise<Readable> {
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    redirects > 4
  )
    throw error(
      "Ce lien ne permet pas un téléchargement sécurisé. Ouvrez-le chez son hébergeur.",
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const records = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw error("Le lien ne désigne pas un serveur public autorisé.");
  const target = records[0]!;
  return new Promise<Readable>((resolve, reject) => {
    const req = httpsGet(
      url,
      {
        family: target.family,
        autoSelectFamily: false,
        lookup: (_host, _options, callback) =>
          callback(null, target.address, target.family),
        headers: {
          "Accept-Encoding": "identity",
          "User-Agent": "FADES-RH Files/1",
        },
      },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
          res.headers.location
        ) {
          res.resume();
          void publicStream(
            new URL(res.headers.location, url).href,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            error(
              "Le fichier externe est indisponible ou nécessite une connexion chez son hébergeur.",
            ),
          );
          return;
        }
        if (
          /^(text\/html|application\/xhtml\+xml)/i.test(
            String(res.headers["content-type"] ?? ""),
          )
        ) {
          res.resume();
          reject(
            error(
              "Ce lien ouvre une page web ou une page de connexion, pas un fichier téléchargeable directement.",
            ),
          );
          return;
        }
        const timeout = setTimeout(
          () =>
            res.destroy(
              error("Le téléchargement a dépassé le délai autorisé."),
            ),
          120000,
        );
        timeout.unref();
        res.once("close", () => clearTimeout(timeout));
        resolve(res);
      },
    );
    req.setTimeout(20000, () =>
      req.destroy(error("Le serveur de fichiers ne répond pas.")),
    );
    req.once("error", reject);
  });
}
function configure() {
  const c = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: c.cloudName,
    api_key: c.apiKey,
    api_secret: c.apiSecret,
    secure: true,
  });
  return c;
}
export async function localFile(storage: Extract<Storage, { kind: "local" }>) {
  if (!isWithin(storage.root, storage.path))
    throw error("L’emplacement de ce fichier n’est pas autorisé.");
  const root = await realpath(storage.root),
    file = await realpath(storage.path);
  if (!isWithin(root, file) || (await lstat(storage.path)).isSymbolicLink())
    throw error("L’emplacement de ce fichier n’est pas autorisé.");
  return file;
}
export async function openStorage(
  storage: Storage,
  a: Pick<Actor, "tenantId" | "slug">,
): Promise<Readable> {
  if (storage.kind === "local")
    return createReadStream(await localFile(storage));
  if (storage.kind === "link") return publicStream(storage.url);
  if (!cloudOwned(storage, String(a.tenantId), a.slug))
    throw error(
      "Le fichier ne correspond pas au stockage de votre organisation.",
    );
  configure();
  const url =
    storage.delivery === "upload"
      ? cloudinary.url(storage.id, {
          secure: true,
          resource_type: "image",
          type: "upload",
          format: storage.format,
          sign_url: true,
        })
      : cloudinary.utils.private_download_url(storage.id, storage.format, {
          resource_type: storage.kind === "raw" ? "raw" : "image",
          type: storage.delivery,
          expires_at: Math.floor(Date.now() / 1000) + 180,
          attachment: false,
        });
  return publicStream(url);
}
export async function destroyStorage(
  storage: Storage,
  a: Pick<Actor, "tenantId" | "slug">,
) {
  if (storage.kind === "link") return;
  if (storage.kind === "local") {
    try {
      const file = await localFile(storage);
      await unlink(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return;
  }
  if (!cloudOwned(storage, String(a.tenantId), a.slug))
    throw error(
      "Le fichier ne correspond pas au stockage de votre organisation.",
    );
  configure();
  const result = await cloudinary.uploader.destroy(storage.id, {
    resource_type: storage.kind === "raw" ? "raw" : "image",
    type: storage.delivery,
    invalidate: true,
  });
  if (!["ok", "not found"].includes(result.result))
    throw error(
      "Le stockage n’a pas confirmé la suppression. Elle sera réessayée.",
    );
}
