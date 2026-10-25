import { EventEmitter } from "node:events";
import type { Response } from "express";



// Les événements ne contiennent aucune tâche ni identité : ils invitent à relire l'API protégée.
const events = new EventEmitter();
events.setMaxListeners(0);
const streams = new Set<Response>();

export function closeTaskNotificationStreams(): void {
  for (const response of streams) response.end();
  streams.clear();
}

export function publishTaskNotificationChange(tenantId: string): void {
  events.emit(`tenant:${tenantId}`);
}

export function openTaskNotificationStream(tenantId: string, response: Response): void {
  streams.add(response);
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.on("error", () => response.destroy());
  response.flushHeaders();
  response.write("retry: 5000\n\n");
  const send = () => {
    if (!response.destroyed && !response.writableEnded) {
      try { response.write("event: tasks-changed\ndata: {}\n\n"); }
      catch { response.destroy(); }
    }
  };
  events.on(`tenant:${tenantId}`, send);
  send();
  const heartbeat = setInterval(() => {
    if (!response.destroyed && !response.writableEnded) response.write(": heartbeat\n\n");
  }, 20_000);
  // Une reconnexion périodique refait les contrôles d'authentification et du module.
  const lifetime = setTimeout(() => response.end(), 5 * 60_000);
  response.once("close", () => {
    streams.delete(response);
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    events.off(`tenant:${tenantId}`, send);
  });
}
