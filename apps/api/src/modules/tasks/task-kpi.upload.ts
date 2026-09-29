import { extname } from "node:path";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../../core/errors/app-error.js";

const maximumFileSize = 10 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".txt",
  ".csv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: maximumFileSize,
  },
  fileFilter: (_request, file, callback) => {
    const extension = extname(file.originalname).toLowerCase();

    if (
      !allowedMimeTypes.has(file.mimetype) ||
      !allowedExtensions.has(extension)
    ) {
      callback(
        new AppError(
          "Format KPI non autorisé. Utilisez PDF, image, texte, CSV, Word ou Excel.",
          400,
          "TASK_KPI_FILE_TYPE_INVALID",
        ),
      );
      return;
    }

    callback(null, true);
  },
});

export function uploadTaskKpiFileMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  upload.single("file")(request, response, (error: unknown) => {
    if (error) {
      next(error);
      return;
    }

    if (!request.file) {
      next(
        new AppError(
          "Aucun fichier KPI n'a été transmis.",
          400,
          "TASK_KPI_FILE_REQUIRED",
        ),
      );
      return;
    }

    next();
  });
}
