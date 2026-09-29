import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";

const rootDirectory = path.resolve(process.cwd(), "storage", "private", "roadmap-kpis");

function ensureDirectory(): void {
  fs.mkdirSync(rootDirectory, { recursive: true });
}

function safeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return ext.replace(/[^a-z0-9.]/g, "") || ".bin";
}

const storage = multer.diskStorage({
  destination(_request, _file, callback) {
    ensureDirectory();
    callback(null, rootDirectory);
  },
  filename(_request, file, callback) {
    callback(null, `${Date.now()}-${randomUUID()}${safeExt(file.originalname)}`);
  },
});

export const roadmapKpiUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter(_request, file, callback) {
    const allowed = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!allowed.includes(file.mimetype)) {
      callback(new Error("Format de fichier KPI non autorisé."));
      return;
    }
    callback(null, true);
  },
});
