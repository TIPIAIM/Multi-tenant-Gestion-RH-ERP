import { extname } from "node:path";
import type {
  NextFunction,
  Request,
  Response,
} from "express";
import multer from "multer";
import { AppError } from "../../core/errors/app-error.js";

const maximumFileSize = 10 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "application/pdf",

  "image/jpeg",
  "image/png",
  "image/webp",

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
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);

const multerUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    files: 1,
    fileSize: maximumFileSize,
  },

  fileFilter: (_request, file, callback) => {
    const extension = extname(
      file.originalname,
    ).toLowerCase();

    const isAuthorizedMimeType = allowedMimeTypes.has(
      file.mimetype,
    );

    const isAuthorizedExtension = allowedExtensions.has(
      extension,
    );

    if (!isAuthorizedMimeType || !isAuthorizedExtension) {
      callback(
        new AppError(
          "Format de fichier non autorisé. Utilisez PDF, image, Word ou Excel.",
          400,
          "AGENT_DOCUMENT_FILE_TYPE_INVALID",
        ),
      );

      return;
    }

    callback(null, true);
  },
});

export function uploadAgentDocumentMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  multerUpload.single("file")(
    request,
    response,
    (error: unknown) => {
      if (error) {
        next(error);

        return;
      }

      if (!request.file) {
        next(
          new AppError(
            "Aucun fichier n'a été transmis.",
            400,
            "AGENT_DOCUMENT_FILE_REQUIRED",
          ),
        );

        return;
      }

      next();
    },
  );
}