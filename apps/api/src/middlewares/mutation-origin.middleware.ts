import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "../core/errors/app-error.js";
export const requireTrustedMutationOrigin: RequestHandler = (
  request,
  _response,
  next,
) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    next();
    return;
  }
  const origin = request.get("origin");
  if (origin && origin !== new URL(env.webUrl).origin) {
    next(
      new AppError(
        "Origine de la requête non autorisée.",
        403,
        "ORIGIN_FORBIDDEN",
      ),
    );
    return;
  }
  next();
};
