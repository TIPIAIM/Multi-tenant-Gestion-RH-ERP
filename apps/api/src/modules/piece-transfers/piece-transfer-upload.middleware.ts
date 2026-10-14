import { extname } from "node:path";
import type {
  NextFunction,
  Request,
  Response,
} from "express";
import multer from "multer";
import { AppError } from "../../core/errors/app-error.js";

const MAXIMUM_INITIAL_FILE_SIZE =
  10 * 1024 * 1024;

const MAXIMUM_MESSAGE_FILE_COUNT =
  7;

const MAXIMUM_MESSAGE_TOTAL_SIZE =
  20 * 1024 * 1024;

// Marge multipart pour bloquer précocement les requêtes manifestement trop grosses.
const MAXIMUM_MESSAGE_REQUEST_SIZE =
  22 * 1024 * 1024;

const audioTypes: Record<string, string[]> = {
  ".webm": ["audio/webm"], ".ogg": ["audio/ogg"], ".m4a": ["audio/mp4", "audio/x-m4a"],
  ".mp3": ["audio/mpeg"], ".wav": ["audio/wav", "audio/x-wav", "audio/wave"],
};
const allowedMimeTypes =
  new Set([
    "application/pdf",

    "image/jpeg",
    "image/png",
    "image/webp",

    "text/plain",

    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]);

const allowedExtensions =
  new Set([
    ".pdf",

    ".jpg",
    ".jpeg",
    ".png",
    ".webp",

    ".txt",

    ".doc",
    ".docx",

    ".xls",
    ".xlsx",

    ".ppt",
    ".pptx",
  ]);

function validateFile(
  file: Express.Multer.File,
  allowAudio = false,
): AppError | null {
  const extension =
    extname(
      file.originalname,
    ).toLowerCase();

  const mimeType = (file.mimetype.split(";")[0] ?? "").trim().toLowerCase();
  if (allowAudio && audioTypes[extension]?.includes(mimeType)) { file.mimetype = mimeType; return null; }
  if (
    !allowedMimeTypes.has(
      file.mimetype,
    ) ||
    !allowedExtensions.has(
      extension,
    )
  ) {
    return new AppError(
      "Format non autorisé. Utilisez PDF, image, texte, Word, Excel ou PowerPoint.",
      400,
      "PIECE_TRANSFER_FILE_TYPE_INVALID",
    );
  }

  return null;
}

const initialFileUpload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      files: 1,
      fileSize:
        MAXIMUM_INITIAL_FILE_SIZE,
    },

    fileFilter: (
      _request,
      file,
      callback,
    ) => {
      const error =
        validateFile(file);

      if (error) {
        callback(error);
        return;
      }

      callback(null, true);
    },
  });

const messageFilesUpload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      files:
        MAXIMUM_MESSAGE_FILE_COUNT,

      // Limite de sécurité par fichier. Le plafond global de 20 Mo
      // est contrôlé juste après Multer.
      fileSize:
        MAXIMUM_MESSAGE_TOTAL_SIZE,
    },

    fileFilter: (
      _request,
      file,
      callback,
    ) => {
      const error =
        validateFile(file, true);

      if (error) {
        callback(error);
        return;
      }

      callback(null, true);
    },
  });

export function uploadPieceTransferMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  initialFileUpload.single(
    "file",
  )(
    request,
    response,
    (error: unknown) => {
      if (error) {
        next(error);
        return;
      }

      // La pièce initiale est facultative.
      // Si elle existe, Multer a déjà contrôlé taille, MIME et extension.
      next();
    },
  );
}

export function uploadPieceTransferMessageMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const contentLength =
    Number(
      request.headers[
        "content-length"
      ] ??
        0,
    );

  if (
    Number.isFinite(
      contentLength,
    ) &&
    contentLength >
      MAXIMUM_MESSAGE_REQUEST_SIZE
  ) {
    next(
      new AppError(
        "La requête dépasse la limite autorisée pour les pièces jointes.",
        413,
        "PIECE_TRANSFER_MESSAGE_REQUEST_TOO_LARGE",
      ),
    );

    return;
  }

  messageFilesUpload.array(
    "files",
    MAXIMUM_MESSAGE_FILE_COUNT,
  )(
    request,
    response,
    (error: unknown) => {
      if (error) {
        next(error);
        return;
      }

      const files =
        Array.isArray(request.files)
          ? request.files
          : [];

      for (const file of files) {
        if (!file.mimetype.startsWith("audio/")) continue;
        const bytes = file.buffer;
        const extension = extname(file.originalname).toLowerCase();
        const valid = extension === ".webm" ? bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
          : extension === ".ogg" ? bytes.subarray(0, 4).toString() === "OggS"
          : extension === ".m4a" ? bytes.length >= 12 && bytes.subarray(4, 8).toString() === "ftyp"
          : extension === ".wav" ? bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE"
          : extension === ".mp3" ? bytes.subarray(0, 3).toString() === "ID3" || (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) : false;
        if (!valid) { next(new AppError("Le fichier audio est vide ou son format est invalide.", 400, "PIECE_TRANSFER_AUDIO_INVALID")); return; }
      }
      const totalBytes =
        files.reduce(
          (
            total,
            file,
          ) =>
            total +
            file.size,
          0,
        );

      if (
        totalBytes >
        MAXIMUM_MESSAGE_TOTAL_SIZE
      ) {
        next(
          new AppError(
            "La taille totale des pièces jointes ne peut pas dépasser 20 Mo par message.",
            400,
            "PIECE_TRANSFER_MESSAGE_FILES_TOO_LARGE",
          ),
        );

        return;
      }

      next();
    },
  );
}
