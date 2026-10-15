import multer from "multer";
import type { RequestHandler } from "express";
import { AppError } from "../../core/errors/app-error.js";
export const SETTINGS_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export function assertLogoFile(buffer: Buffer, mime: string): void {
  const png = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = buffer.length >= 16 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!buffer.length || buffer.length > SETTINGS_LOGO_MAX_BYTES || !(
    (mime === "image/png" && png) || (mime === "image/jpeg" && jpeg) || (mime === "image/webp" && webp)
  )) throw new AppError("Choisissez une image PNG, JPEG ou WebP de 2 Mo maximum.", 400, "SETTINGS_LOGO_INVALID");
  if (png && (buffer.readUInt32BE(16) > 8192 || buffer.readUInt32BE(20) > 8192)) {
    throw new AppError("Le logo ne doit pas dépasser 8192 pixels par côté.", 400, "SETTINGS_LOGO_DIMENSIONS");
  }
}
const parse = multer({ storage: multer.memoryStorage(), limits: { fileSize: SETTINGS_LOGO_MAX_BYTES, files: 1, fields: 3, fieldSize: 65536 },
  fileFilter: (_request, file, callback) => {
    if (["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) callback(null, true);
    else callback(new AppError("Format non accepté : PNG, JPEG ou WebP uniquement.", 400, "SETTINGS_LOGO_FORMAT"));
  },
}).single("logo");
export const settingsLogoUploadMiddleware: RequestHandler = (request, response, next) => {
  parse(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(new AppError(error.code === "LIMIT_FILE_SIZE" ? "Le logo doit faire au maximum 2 Mo." : "Le formulaire de logo est invalide.", 400, "SETTINGS_LOGO_UPLOAD_LIMIT"));
    } else next(error);
  });
};
