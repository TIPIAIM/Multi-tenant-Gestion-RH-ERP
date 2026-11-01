import { ensureFileIndexes } from "./modules/files/files.model.js";
import { startFileCleanup } from "./modules/files/files.service.js";
import { cleanExports, drainFileExports } from "./modules/files/files.export.js";
import { TaskNoticeModel } from "./modules/tasks/task-notifications.js";
import { closeTaskNotificationStreams } from "./modules/tasks/task-notification-events.js";
import {
  PayrollModel,
  PayrollDeliveryModel,
} from "./modules/payroll/payroll.model.js";
import { AgentPhotoAsset } from "./modules/agents/agent-photo.js";
import { startAgentPhotoCleanup } from "./modules/agents/agent-photo.js";
import type { Server } from "node:http";
import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { ensureTrainingIndexes } from "./modules/trainings/training.bootstrap.js";
import { startSettingsLogoCleanupWorker } from "./modules/settings/settings-logo.storage.js";
import { ensureRecruitmentIndexes } from "./modules/recruitment/recruitment.bootstrap.js";
import { ensureBackupIndexes } from "./modules/backups/backup.model.js";
import { drainBackupOperations } from "./modules/backups/backup.service.js";


let stopFiles: (() => Promise<void>) | undefined;
let exportCleanupTimer: ReturnType<typeof setInterval> | undefined;
let exportCleanup: Promise<void> | undefined;
let stopPhotoCleanup: (() => void) | undefined;
let stopLogoCleanup: (() => Promise<void>) | undefined;
let httpServer: Server | undefined;

async function bootstrap(): Promise<void> {
  console.log("🚀 Initialisation de  API...");
  console.log(`🌐 Environnement : ${env.nodeEnv}`);

  await connectDatabase();
  await ensureBackupIndexes();
  await ensureFileIndexes();
  stopFiles = startFileCleanup();
  await cleanExports();
  exportCleanupTimer = setInterval(() => { if (!exportCleanup) exportCleanup = cleanExports().catch(() => {}).finally(() => { exportCleanup = undefined; }); }, 60000);
  exportCleanupTimer.unref();
  await ensureRecruitmentIndexes();
  await ensureTrainingIndexes();
  await TaskNoticeModel.createIndexes();
  // Ensure uniqueness before accepting concurrent payroll writes.
  await PayrollModel.createIndexes();
  await PayrollDeliveryModel.createIndexes();
  await AgentPhotoAsset.createIndexes();
  stopPhotoCleanup = startAgentPhotoCleanup();
  stopLogoCleanup = startSettingsLogoCleanupWorker();
//await drainBackupOperations(); disconnectDatabase
  httpServer = app.listen(env.port, () => {
    console.log(`✅ API disponible sur http://localhost:${env.port}`);
  });
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} reçu. Arrêt sécurisé du serveur...`);
  try {
    closeTaskNotificationStreams();
    if (httpServer)
      await new Promise<void>((resolve, reject) =>
        httpServer!.close((error) => (error ? reject(error) : resolve())),
      );
    stopPhotoCleanup?.();
    await stopLogoCleanup?.();
    await drainBackupOperations();
    await stopFiles?.();
    if (exportCleanupTimer) clearInterval(exportCleanupTimer);
    await exportCleanup;
    await drainFileExports();
    await disconnectDatabase();
    console.log("Serveur HTTP arrêté.");
    process.exit(0);
  } catch (error) {
    console.error("Erreur lors de l’arrêt :", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

bootstrap().catch((error: unknown) => {
  console.error("❌ Impossible de démarrer le serveur :", error);
  process.exit(1);
});
