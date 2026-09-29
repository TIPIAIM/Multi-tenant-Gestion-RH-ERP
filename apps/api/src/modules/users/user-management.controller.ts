import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../core/errors/app-error.js";
import {
  activityQuerySchema,
  createUserSchema,
  emailVerificationSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  statusSchema,
  updateUserSchema,
  userIdParamsSchema,
} from "./user-management.schema.js";
import {
  createManagedUser,
  forceVerifyUserEmail,
  getUserById,
  getUserStats,
  listAgentOptionsForUserLink,
  listUserActivities,
  listUserSessions,
  listUsers,
  resetUserPassword,
  revokeUserSessions,
  setUserActiveStatus,
  setUserEmailVerified,
  toggleUserActiveStatus,
  updateManagedUser,
} from "./user-management.service.js";

async function tenantOnlyContext(request: Request) {
  if (!request.tenant) {
    throw new AppError(
      "Le contexte organisationnel est introuvable.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  return { tenant: request.tenant };
}

async function context(request: Request) {
  const { tenant } = await tenantOnlyContext(request);

  if (!request.auth?.userId) {
    throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
  }

  return {
    tenant,
    actor: {
      userId: request.auth.userId,
      fullName: (request.auth as { fullName?: string }).fullName,
    },
  };
}

export async function getUserAgentOptionsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant } = await tenantOnlyContext(request);

    response.status(200).json({
      success: true,
      data: {
        items: await listAgentOptionsForUserLink(tenant),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserStatsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant } = await context(request);
    response.status(200).json({
      success: true,
      data: { stats: await getUserStats(tenant) },
    });
  } catch (error) {
    next(error);
  }
}

export async function listUsersController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant } = await context(request);
    const query = listUsersQuerySchema.parse(request.query);
    response.status(200).json({
      success: true,
      data: await listUsers(tenant, query),
    });
  } catch (error) {
    next(error);
  }
}

export async function createUserController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const input = createUserSchema.parse(request.body);
    response.status(201).json({
      success: true,
      data: await createManagedUser(tenant, actor, input),
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    response.status(200).json({
      success: true,
      data: { user: await getUserById(tenant, id) },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateUserController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    const input = updateUserSchema.parse(request.body);
    response.status(200).json({
      success: true,
      data: { user: await updateManagedUser(tenant, actor, id, input) },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateUserStatusController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    const { isActive } = statusSchema.parse(request.body);
    response.status(200).json({
      success: true,
      data: { user: await setUserActiveStatus(tenant, actor, id, isActive) },
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleUserStatusController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    response.status(200).json({
      success: true,
      data: { user: await toggleUserActiveStatus(tenant, actor, id) },
    });
  } catch (error) {
    next(error);
  }
}

export async function forceVerifyUserEmailController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    response.status(200).json({
      success: true,
      data: { user: await forceVerifyUserEmail(tenant, actor, id) },
    });
  } catch (error) {
    next(error);
  }
}

export async function setUserEmailVerifiedController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    const { emailVerified } = emailVerificationSchema.parse(request.body ?? {});
    response.status(200).json({
      success: true,
      data: {
        user: await setUserEmailVerified(tenant, actor, id, emailVerified),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function resetUserPasswordController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    const input = resetPasswordSchema.parse(request.body ?? {});
    response.status(200).json({
      success: true,
      data: await resetUserPassword(tenant, actor, id, input),
    });
  } catch (error) {
    next(error);
  }
}

export async function listUserSessionsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    response.status(200).json({
      success: true,
      data: { sessions: await listUserSessions(tenant, id) },
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeUserSessionsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    response.status(200).json({
      success: true,
      data: await revokeUserSessions(tenant, actor, id),
    });
  } catch (error) {
    next(error);
  }
}

export async function listUserActivitiesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant } = await context(request);
    const { id } = userIdParamsSchema.parse(request.params);
    const query = activityQuerySchema.parse(request.query);
    response.status(200).json({
      success: true,
      data: {
        activities: await listUserActivities(tenant, id, query.limit),
      },
    });
  } catch (error) {
    next(error);
  }
}
