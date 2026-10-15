 import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { SignOptions } from "jsonwebtoken";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);

const envFilePath = resolve(currentDirectory, "../../.env");

dotenv.config({ path: envFilePath });

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `La variable d'environnement ${name} est obligatoire. Vérifie apps/api/.env.`,
    );
  }

  return value;
}

function getPort(): number {
  const value = Number.parseInt(process.env.PORT ?? "5000", 10);

  if (Number.isNaN(value)) {
    throw new Error("La variable PORT doit être un nombre valide.");
  }

  return value;
}

function getPositiveInteger(
  name: string,
  fallback: number,
): number {
  const rawValue = process.env[name] ?? String(fallback);
  const value = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `La variable ${name} doit être un entier positif valide.`,
    );
  }

  return value;
}

function getDefaultTenantSlug(): string {
  const value = (process.env.DEFAULT_TENANT_SLUG ?? "fades")
    .trim()
    .toLowerCase();

  const isValidSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

  if (!isValidSlug) {
    throw new Error(
      "DEFAULT_TENANT_SLUG doit contenir uniquement des lettres minuscules, chiffres et tirets.",
    );
  }

  return value;
}

function getSecureSecret(name: string): string {
  const secret = getRequiredEnv(name);

  if (secret.length < 32) {
    throw new Error(
      `${name} doit contenir au moins 32 caractères.`,
    );
  }

  return secret;
}

function getJwtDuration(
  name: string,
  fallback: string,
): SignOptions["expiresIn"] {
  const value = process.env[name]?.trim() || fallback;

  return value as SignOptions["expiresIn"];
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: getPort(),
  webUrl: process.env.WEB_URL ?? "http://localhost:5173",
  mongoUri: getRequiredEnv("MONGODB_URI"),
  defaultTenantSlug: getDefaultTenantSlug(),

  jwtAccessSecret: getSecureSecret("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: getSecureSecret("JWT_REFRESH_SECRET"),

  jwtAccessExpiresIn: getJwtDuration(
    "JWT_ACCESS_EXPIRES_IN",
    "24h",
  ),

  jwtRefreshExpiresIn: getJwtDuration(
    "JWT_REFRESH_EXPIRES_IN",
    "24h",
  ),

  jwtAccessCookieMaxAgeMs: getPositiveInteger(
    "JWT_ACCESS_COOKIE_MAX_AGE_MS",
    24 * 60 * 60 * 1000,
  ),

  jwtRefreshCookieMaxAgeMs: getPositiveInteger(
    "JWT_REFRESH_COOKIE_MAX_AGE_MS",
    24 * 60 * 60 * 1000,
  ),

  passwordSaltRounds: getPositiveInteger(
    "BCRYPT_SALT_ROUNDS",
    12,
  ),
  cloudinary: {
    cloudName: getOptionalEnv("CLOUDINARY_CLOUD_NAME"),
    apiKey: getOptionalEnv("CLOUDINARY_API_KEY"),
    apiSecret: getOptionalEnv("CLOUDINARY_API_SECRET"),
  },
  initialAdmin: {
    fullName: process.env.FADES_ADMIN_FULL_NAME?.trim(),
    email: process.env.FADES_ADMIN_EMAIL?.trim().toLowerCase(),
    password: process.env.FADES_ADMIN_PASSWORD,
  },
};

function getOptionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();

  return value || undefined;
}

export function getCloudinaryConfig(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "La configuration Cloudinary est incomplète. Vérifiez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.",
    );
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
  };
}
