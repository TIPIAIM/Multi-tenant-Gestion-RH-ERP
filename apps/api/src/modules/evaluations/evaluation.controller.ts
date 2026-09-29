import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../core/errors/app-error.js";
import {
  createEvaluationSchema,
  evaluationIdParamsSchema,
  hrValidationSchema,
  listEvaluationsQuerySchema,
  reviewBlockSchema,
  updateEvaluationSchema,
} from "./evaluation.schema.js";
import {
  createEvaluation,
  deleteEvaluation,
  exportEvaluationsCsv,
  getEvaluationById,
  getEvaluationStats,
  listEvaluations,
  recomputeEvaluationIntelligence,
  submitManagerReview,
  submitSelfReview,
  updateEvaluation,
  validateEvaluationHr,
} from "./evaluation.service.js";
import { resolveEvaluationActor } from "./evaluation.access.js";

function getTenantOrThrow(request: Request) {
  if (!request.tenant) {
    throw new AppError(
      "Le contexte organisationnel est introuvable.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  return request.tenant;
}

function getAuthenticatedUserIdOrThrow(request: Request): string {
  if (!request.auth?.userId) {
    throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
  }

  return request.auth.userId;
}

async function getEvaluationContext(request: Request) {
  const tenant = getTenantOrThrow(request);
  const userId = getAuthenticatedUserIdOrThrow(request);
  const actor = await resolveEvaluationActor(tenant, userId);
  return { tenant, actor };
}

export async function listEvaluationsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const query = listEvaluationsQuerySchema.parse(request.query);
    const result = await listEvaluations(tenant, actor, query);
    response.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getEvaluationStatsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const stats = await getEvaluationStats(tenant, actor);
    response.status(200).json({ success: true, data: { stats } });
  } catch (error) {
    next(error);
  }
}

export async function exportEvaluationsCsvController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const query = listEvaluationsQuerySchema.parse(request.query);
    const csv = await exportEvaluationsCsv(tenant, actor, query);

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", "attachment; filename=\"evaluations-fades-rh.csv\"");
    response.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

export async function createEvaluationController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const input = createEvaluationSchema.parse(request.body);
    const evaluation = await createEvaluation(tenant, actor, input);
    response.status(201).json({ success: true, data: { evaluation } });
  } catch (error) {
    next(error);
  }
}

export async function getEvaluationController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const { id } = evaluationIdParamsSchema.parse(request.params);
    const evaluation = await getEvaluationById(tenant, actor, id);
    response.status(200).json({ success: true, data: { evaluation } });
  } catch (error) {
    next(error);
  }
}

export async function updateEvaluationController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const { id } = evaluationIdParamsSchema.parse(request.params);
    const input = updateEvaluationSchema.parse(request.body);
    const evaluation = await updateEvaluation(tenant, actor, id, input);
    response.status(200).json({ success: true, data: { evaluation } });
  } catch (error) {
    next(error);
  }
}

export async function submitSelfReviewController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const { id } = evaluationIdParamsSchema.parse(request.params);
    const input = reviewBlockSchema.parse(request.body);
    const evaluation = await submitSelfReview(tenant, actor, id, input);
    response.status(200).json({ success: true, data: { evaluation } });
  } catch (error) {
    next(error);
  }
}

export async function submitManagerReviewController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const { id } = evaluationIdParamsSchema.parse(request.params);
    const input = reviewBlockSchema.parse(request.body);
    const evaluation = await submitManagerReview(tenant, actor, id, input);
    response.status(200).json({ success: true, data: { evaluation } });
  } catch (error) {
    next(error);
  }
}

export async function validateEvaluationHrController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const { id } = evaluationIdParamsSchema.parse(request.params);
    const input = hrValidationSchema.parse(request.body);
    const evaluation = await validateEvaluationHr(tenant, actor, id, input);
    response.status(200).json({ success: true, data: { evaluation } });
  } catch (error) {
    next(error);
  }
}

export async function recomputeEvaluationIntelligenceController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const { id } = evaluationIdParamsSchema.parse(request.params);
    const evaluation = await recomputeEvaluationIntelligence(tenant, actor, id);
    response.status(200).json({ success: true, data: { evaluation } });
  } catch (error) {
    next(error);
  }
}

export async function deleteEvaluationController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getEvaluationContext(request);
    const { id } = evaluationIdParamsSchema.parse(request.params);
    const result = await deleteEvaluation(tenant, actor, id);
    response.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
