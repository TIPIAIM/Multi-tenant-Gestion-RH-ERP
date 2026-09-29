import type {
  NextFunction,
  Request,
  Response,
} from "express";
import { AppError } from "../../core/errors/app-error.js";
import {
  addAgentHistorySchema,
  agentIdParamsSchema,
  createAgentSchema,
  listAgentsQuerySchema,
  updateAgentSchema,
} from "./agent.schema.js";
import {
  addAgentHistoryEntry,
  createAgent,
  deleteAgent,
  getAgentById,
  getAgentStats,
  listAgents,
  updateAgent,
} from "./agent.service.js";
import {
  resolveAgentActor,
  toPublicAgentScope,
} from "./agent.access.js";
import {
  runAgentContractEndAlertsForTenant,
} from "./agent-contract-alert.service.js";

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
    throw new AppError(
      "Authentification requise.",
      401,
      "AUTH_REQUIRED",
    );
  }

  return request.auth.userId;
}

async function getActorOrThrow(request: Request) {
  const tenant = getTenantOrThrow(request);
  const userId = getAuthenticatedUserIdOrThrow(request);
  const actor = await resolveAgentActor(tenant, userId);

  return { tenant, actor };
}

export async function getAgentScopeController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { actor } = await getActorOrThrow(request);

    response.status(200).json({
      success: true,
      data: {
        scope: toPublicAgentScope(actor),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listAgentsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getActorOrThrow(request);
    const query = listAgentsQuerySchema.parse(request.query);
    const result = await listAgents(tenant, actor, query);

    response.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAgentStatsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getActorOrThrow(request);
    const stats = await getAgentStats(tenant, actor);

    response.status(200).json({
      success: true,
      data: {
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAgentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getActorOrThrow(request);
    const { id } = agentIdParamsSchema.parse(request.params);
    const agent = await getAgentById(tenant, actor, id);

    response.status(200).json({
      success: true,
      data: {
        agent,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createAgentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getActorOrThrow(request);
    const input = createAgentSchema.parse(request.body);
    const agent = await createAgent(tenant, actor, input);

    response.status(201).json({
      success: true,
      data: {
        agent,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAgentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getActorOrThrow(request);
    const { id } = agentIdParamsSchema.parse(request.params);
    const input = updateAgentSchema.parse(request.body);
    const agent = await updateAgent(tenant, actor, id, input);

    response.status(200).json({
      success: true,
      data: {
        agent,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteAgentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getActorOrThrow(request);
    const { id } = agentIdParamsSchema.parse(request.params);
    const result = await deleteAgent(tenant, actor, id);

    response.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function addAgentHistoryController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getActorOrThrow(request);
    const { id } = agentIdParamsSchema.parse(request.params);
    const input = addAgentHistorySchema.parse(request.body);
    const agent = await addAgentHistoryEntry(tenant, actor, id, input);

    response.status(201).json({
      success: true,
      data: {
        agent,
      },
    });
  } catch (error) {
    next(error);
  }
}


export async function runAgentContractEndAlertsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant } = await getActorOrThrow(request);

    const result = await runAgentContractEndAlertsForTenant({
      tenantId: tenant._id,
    });

    response.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
