import type { RequestHandler } from "express";
import { AppError } from "../../core/errors/app-error.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function clientKey(ip?: string): string {
  return (ip || "unknown").trim().slice(0, 120);
}

function cleanup(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Garde légère, sans dépendance supplémentaire.
 * En production multi-instance, conservez aussi un rate-limit partagé au niveau
 * reverse-proxy / Redis / WAF. Cette garde reste une défense complémentaire.
 */
export const tenantSelfRegistrationGuard: RequestHandler = (
  request,
  response,
  next,
) => {
  const now = Date.now();
  cleanup(now);

  const key = clientKey(request.ip);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (current.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    response.setHeader("Retry-After", String(retryAfterSeconds));
    next(
      new AppError(
        "Trop de tentatives de création d’espace. Veuillez réessayer dans quelques minutes.",
        429,
        "TENANT_REGISTRATION_RATE_LIMITED",
      ),
    );
    return;
  }

  current.count += 1;
  buckets.set(key, current);
  next();
};
