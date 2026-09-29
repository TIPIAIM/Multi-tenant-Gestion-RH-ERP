import { env } from "../config/env.js";

const result = {
  cloudNameConfigured: Boolean(env.cloudinary.cloudName),
  apiKeyConfigured: Boolean(env.cloudinary.apiKey),
  apiSecretConfigured: Boolean(env.cloudinary.apiSecret),
};

console.table(result);

const isConfigured = Object.values(result).every(Boolean);

process.exit(isConfigured ? 0 : 1);