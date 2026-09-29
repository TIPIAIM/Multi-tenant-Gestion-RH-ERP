import type {
    ErrorRequestHandler,
    RequestHandler,
  } from "express";
  import { ZodError } from "zod";
  import { env } from "../config/env.js";
  import { AppError } from "../core/errors/app-error.js";
  import multer from "multer";

  export const notFoundMiddleware: RequestHandler = (
    request,
    _response,
    next,
  ) => {
    next(
      new AppError(
        `Route introuvable : ${request.method} ${request.originalUrl}`,
        404,
        "ROUTE_NOT_FOUND",
      ),
    );
  };
  function isDuplicateKeyError(
    error: unknown,
  ): error is { code: number; keyValue?: Record<string, unknown> } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    );
  }



  export const errorMiddleware: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Le fichier dépasse la taille maximale autorisée de 10 Mo."
          : "Le fichier transmis est invalide.";
    
      return response.status(400).json({
        success: false,
        error: {
          code: error.code,
          message,
        },
      });
    }
    if (error instanceof ZodError) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Certaines données envoyées sont invalides.",
          details: error.issues,
        },
      });
    }
    if (isDuplicateKeyError(error)) {
      const duplicateFields = Object.keys(error.keyValue ?? {});
    
      const message = duplicateFields.includes("matricule")
        ? "Ce matricule existe déjà dans cette organisation."
        : duplicateFields.includes("email")
          ? "Cette adresse email est déjà utilisée dans cette organisation."
          : duplicateFields.includes("userId")
            ? "Ce compte utilisateur est déjà lié à un autre agent."
            : duplicateFields.includes("code")
              ? "Cette structure utilise déjà un code existant dans cette organisation."
              : "Une donnée unique existe déjà dans cette organisation.";
    
      return response.status(409).json({
        success: false,
        error: {
          code: "DUPLICATE_VALUE",
          message,
          details: error.keyValue,
        },
      });
    }
    if (error instanceof AppError) {
      return response.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }
  
    console.error("Erreur serveur non gérée :", error);
  
    return response.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          env.nodeEnv === "production"
            ? "Une erreur interne est survenue."
            : error instanceof Error
              ? error.message
              : "Une erreur interne est survenue.",
      },
    });
  };