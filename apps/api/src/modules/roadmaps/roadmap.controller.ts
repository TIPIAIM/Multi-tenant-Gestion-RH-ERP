import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../core/errors/app-error.js";
import {
  resolveRoadmapActor,
  toPublicRoadmapScope,
} from "./roadmap.access.js";
import {
  activityQuerySchema,
  createRoadmapSchema,
  listRoadmapsQuerySchema,
  reviewItemKpiSchema,
  reviewRoadmapSchema,
  roadmapIdParamsSchema,
  roadmapItemParamsSchema,
  submitKpiSchema,
  updateRoadmapSchema,
} from "./roadmap.schema.js";
import {
  approveRoadmap,
  closeRoadmap,
  createRoadmap,
  deleteRoadmap,
  getKpiFile,
  getRoadmapById,
  getRoadmapStats,
  listRoadmapActivities,
  listRoadmaps,
  returnRoadmap,
  reviewItemKpi,
  submitItemKpi,
  submitRoadmap,
  updateRoadmap,
} from "./roadmap.service.js";

async function context(request: Request) {
  if (!request.tenant) {
    throw new AppError(
      "Le contexte organisationnel est introuvable.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  if (!request.auth?.userId) {
    throw new AppError(
      "Authentification requise.",
      401,
      "AUTH_REQUIRED",
    );
  }

  return {
    tenant: request.tenant,
    actor: await resolveRoadmapActor(
      request.tenant,
      request.auth.userId,
    ),
  };
}

export async function getRoadmapScopeController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { actor } = await context(request);

    response.status(200).json({
      success: true,
      data: {
        scope: toPublicRoadmapScope(actor),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getRoadmapStatsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);

    response.status(200).json({
      success: true,
      data: {
        stats: await getRoadmapStats(tenant, actor),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listRoadmapsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const query = listRoadmapsQuerySchema.parse(request.query);

    response.status(200).json({
      success: true,
      data: await listRoadmaps(tenant, actor, query),
    });
  } catch (error) {
    next(error);
  }
}

export async function createRoadmapController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const input = createRoadmapSchema.parse(request.body);

    response.status(201).json({
      success: true,
      data: {
        roadmap: await createRoadmap(tenant, actor, input),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getRoadmapController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = roadmapIdParamsSchema.parse(request.params);

    response.status(200).json({
      success: true,
      data: {
        roadmap: await getRoadmapById(tenant, actor, id),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateRoadmapController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = roadmapIdParamsSchema.parse(request.params);
    const input = updateRoadmapSchema.parse(request.body);

    response.status(200).json({
      success: true,
      data: {
        roadmap: await updateRoadmap(tenant, actor, id, input),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function submitRoadmapController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = roadmapIdParamsSchema.parse(request.params);

    response.status(200).json({
      success: true,
      data: {
        roadmap: await submitRoadmap(tenant, actor, id),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function approveRoadmapController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = roadmapIdParamsSchema.parse(request.params);
    const input = reviewRoadmapSchema.parse(request.body ?? {});

    response.status(200).json({
      success: true,
      data: {
        roadmap: await approveRoadmap(tenant, actor, id, input),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function returnRoadmapController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = roadmapIdParamsSchema.parse(request.params);
    const input = reviewRoadmapSchema.parse(request.body ?? {});

    response.status(200).json({
      success: true,
      data: {
        roadmap: await returnRoadmap(tenant, actor, id, input),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function closeRoadmapController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = roadmapIdParamsSchema.parse(request.params);

    response.status(200).json({
      success: true,
      data: {
        roadmap: await closeRoadmap(tenant, actor, id),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteRoadmapController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = roadmapIdParamsSchema.parse(request.params);

    response.status(200).json({
      success: true,
      data: await deleteRoadmap(tenant, actor, id),
    });
  } catch (error) {
    next(error);
  }
}

export async function submitItemKpiController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id, itemId } = roadmapItemParamsSchema.parse(
      request.params,
    );
    const input = submitKpiSchema.parse(request.body ?? {});

    response.status(200).json({
      success: true,
      data: {
        roadmap: await submitItemKpi(
          tenant,
          actor,
          id,
          itemId,
          input,
          request.file,
        ),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function reviewItemKpiController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id, itemId } = roadmapItemParamsSchema.parse(
      request.params,
    );
    const input = reviewItemKpiSchema.parse(request.body ?? {});

    response.status(200).json({
      success: true,
      data: {
        roadmap: await reviewItemKpi(
          tenant,
          actor,
          id,
          itemId,
          input,
        ),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadKpiFileController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id, itemId } = roadmapItemParamsSchema.parse(
      request.params,
    );
    const file = await getKpiFile(tenant, actor, id, itemId);

    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.type(file.mimeType);
    response.download(file.path, file.originalName);
  } catch (error) {
    next(error);
  }
}

export async function listRoadmapActivitiesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = roadmapIdParamsSchema.parse(request.params);
    const query = activityQuerySchema.parse(request.query);

    response.status(200).json({
      success: true,
      data: {
        activities: await listRoadmapActivities(
          tenant,
          actor,
          id,
          query.limit,
        ),
      },
    });
  } catch (error) {
    next(error);
  }
}

