import mongoose from "mongoose";
import { env } from "./env.js";

const databaseStates: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized",
};

let listenersAttached = false;

function attachDatabaseListeners(): void {
  if (listenersAttached) {
    return;
  }

  mongoose.connection.on("connected", () => {
    console.log(`✅ MongoDB connecté : ${mongoose.connection.host}`);
  });

  mongoose.connection.on("error", (error: Error) => {
    console.error("❌ Erreur MongoDB :", error.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB déconnecté.");
  });

  listenersAttached = true;
}

export async function connectDatabase(): Promise<void> {
  attachDatabaseListeners();

  console.log("⏳ Connexion à MongoDB Atlas en cours...");

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
}

export function getDatabaseStatus() {
  const state = mongoose.connection.readyState;

  return {
    state,
    status: databaseStates[state] ?? "unknown",
  };
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}