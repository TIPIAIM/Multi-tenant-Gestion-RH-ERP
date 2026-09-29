import type { Server } from "node:http";
import { app } from "./app.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";
import { env } from "./config/env.js";

let httpServer: Server | undefined;

async function bootstrap(): Promise<void> {
  console.log("🚀 Initialisation de  API...");
  console.log(`🌐 Environnement : ${env.nodeEnv}`);

  await connectDatabase();

  httpServer = app.listen(env.port, () => {
    console.log(
      `✅ API disponible sur http://localhost:${env.port}`,
    );
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} reçu. Arrêt sécurisé du serveur...`);

  try {
    await disconnectDatabase();

    if (!httpServer) {
      process.exit(0);
      return;
    }

    httpServer.close(() => {
      console.log("Serveur HTTP arrêté.");
      process.exit(0);
    });
  } catch (error) {
    console.error("Erreur lors de l'arrêt :", error);
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