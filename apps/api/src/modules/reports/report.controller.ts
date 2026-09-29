import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../core/errors/app-error.js";
import { resolveReportActor } from "./report.access.js";
import {
  listManagementReportsQuerySchema,
  reportGenerationSchema,
  reportIdParamsSchema,
  reportPreviewQuerySchema,
  updateManagementReportSchema,
  validateManagementReportSchema,
} from "./report.schema.js";
//
import {
  archiveManagementReport,
  deleteManagementReport,
  exportManagementReportsCsv,
  generateManagementReport,
  getManagementReportById,
  getManagementReportStats,
  listManagementReports,
  previewManagementReport,
  recomputeManagementReport,
  updateManagementReport,
  validateManagementReport,
} from "./report.service.js";

function getTenantOrThrow(request: Request) {
  if (!request.tenant)
    throw new AppError(
      "Le contexte organisationnel est introuvable.",
      500,
      "TENANT_CONTEXT_MISSING"
    );
  return request.tenant;
}
function getUserIdOrThrow(request: Request): string {
  if (!request.auth?.userId)
    throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
  return request.auth.userId;
}
async function context(request: Request) {
  const tenant = getTenantOrThrow(request);
  const actor = await resolveReportActor(tenant, getUserIdOrThrow(request));
  return { tenant, actor };
}

export async function listManagementReportsController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const query = listManagementReportsQuerySchema.parse(request.query);
    response
      .status(200)
      .json({
        success: true,
        data: await listManagementReports(tenant, actor, query),
      });
  } catch (error) {
    next(error);
  }
}
export async function getManagementReportStatsController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    response
      .status(200)
      .json({
        success: true,
        data: { stats: await getManagementReportStats(tenant, actor) },
      });
  } catch (error) {
    next(error);
  }
}
export async function getManagementReportScopeController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { actor } = await context(request);
    response.status(200).json({
      success: true,
      data: {
        scope: {
          role: actor.role,
          directionId: actor.directionId?.toString() ?? null,
          serviceId: actor.serviceId?.toString() ?? null,
          defaultScopeType:
            actor.role === "SERVICE_MANAGER"
              ? "SERVICE"
              : actor.role === "DIRECTION"
              ? "DIRECTION"
              : "INSTITUTION",
          canValidate: ["TENANT_ADMIN", "RH_MANAGER", "DIRECTION"].includes(
            actor.role
          ),
          canDelete: actor.role === "TENANT_ADMIN",
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
export async function previewManagementReportController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const input = reportPreviewQuerySchema.parse(request.body);
    response
      .status(200)
      .json({
        success: true,
        data: { report: await previewManagementReport(tenant, actor, input) },
      });
  } catch (error) {
    next(error);
  }
}
export async function generateManagementReportController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const input = reportGenerationSchema.parse(request.body);
    response
      .status(201)
      .json({
        success: true,
        data: { report: await generateManagementReport(tenant, actor, input) },
      });
  } catch (error) {
    next(error);
  }
}
export async function getManagementReportController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = reportIdParamsSchema.parse(request.params);
    response
      .status(200)
      .json({
        success: true,
        data: { report: await getManagementReportById(tenant, actor, id) },
      });
  } catch (error) {
    next(error);
  }
}
export async function updateManagementReportController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = reportIdParamsSchema.parse(request.params);
    const input = updateManagementReportSchema.parse(request.body);
    response
      .status(200)
      .json({
        success: true,
        data: {
          report: await updateManagementReport(tenant, actor, id, input),
        },
      });
  } catch (error) {
    next(error);
  }
}
export async function recomputeManagementReportController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = reportIdParamsSchema.parse(request.params);
    response
      .status(200)
      .json({
        success: true,
        data: { report: await recomputeManagementReport(tenant, actor, id) },
      });
  } catch (error) {
    next(error);
  }
}
export async function validateManagementReportController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = reportIdParamsSchema.parse(request.params);
    const input = validateManagementReportSchema.parse(request.body);
    response
      .status(200)
      .json({
        success: true,
        data: {
          report: await validateManagementReport(tenant, actor, id, input),
        },
      });
  } catch (error) {
    next(error);
  }
}
export async function archiveManagementReportController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = reportIdParamsSchema.parse(request.params);
    response
      .status(200)
      .json({
        success: true,
        data: { report: await archiveManagementReport(tenant, actor, id) },
      });
  } catch (error) {
    next(error);
  }
}
export async function deleteManagementReportController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = reportIdParamsSchema.parse(request.params);
    response
      .status(200)
      .json({
        success: true,
        data: await deleteManagementReport(tenant, actor, id),
      });
  } catch (error) {
    next(error);
  }
}
export async function exportManagementReportsCsvController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const query = listManagementReportsQuerySchema.parse(request.query);
    const csv = await exportManagementReportsCsv(tenant, actor, query);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="rapports-fades-rh.csv"'
    );
    response.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}
