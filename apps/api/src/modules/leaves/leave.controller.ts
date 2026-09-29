import type {
  NextFunction,
  Request,
  Response,
} from "express";
import { AppError } from "../../core/errors/app-error.js";
import { resolveLeaveActor } from "./leave.access.js";
import {
  cancelLeaveRequestSchema,
  createLeaveRequestSchema,
  leaveActivitiesQuerySchema,
  leaveDashboardQuerySchema,
  leaveRequestIdParamsSchema,
  listLeaveBalancesQuerySchema,
  listLeaveCalendarQuerySchema,
  listLeaveRequestsQuerySchema,
  reviewLeaveRequestSchema,
  updateLeaveRequestSchema,
  upsertLeaveBalanceSchema,
} from "./leave.schema.js";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  getLeaveDashboard,
  getLeaveRequestById,
  listLeaveActivities,
  listLeaveBalances,
  listLeaveCalendar,
  listLeaveRequests,
  listMyLeaveBalances,
  reviewLeaveRequestByManager,
  reviewLeaveRequestFinal,
  submitLeaveRequest,
  updateLeaveRequest,
  upsertLeaveBalance,
} from "./leave.service.js";

async function getLeaveContext(request: Request) {
  if (!request.tenant) {
    throw new AppError(
      "Le contexte organisationnel est introuvable.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  if (!request.auth) {
    throw new AppError(
      "Authentification requise.",
      401,
      "AUTH_REQUIRED",
    );
  }

  const actor = await resolveLeaveActor(
    request.tenant,
    request.auth.userId,
  );

  return {
    tenant: request.tenant,
    actor,
  };
}

export async function getLeaveDashboardController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const query = leaveDashboardQuerySchema.parse(request.query);
    const dashboard = await getLeaveDashboard(
      tenant,
      actor,
      query.calendarYear,
    );

    response.status(200).json({
      success: true,
      data: { dashboard },
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyLeaveBalancesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const query = listLeaveBalancesQuerySchema.parse(request.query);
    const balances = await listMyLeaveBalances(
      tenant,
      actor,
      query.calendarYear,
    );

    response.status(200).json({
      success: true,
      data: { balances },
    });
  } catch (error) {
    next(error);
  }
}

export async function listLeaveBalancesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const query = listLeaveBalancesQuerySchema.parse(request.query);
    const balances = await listLeaveBalances(
      tenant,
      actor,
      query,
    );

    response.status(200).json({
      success: true,
      data: { balances },
    });
  } catch (error) {
    next(error);
  }
}

export async function upsertLeaveBalanceController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const input = upsertLeaveBalanceSchema.parse(request.body);
    const balance = await upsertLeaveBalance(
      tenant,
      actor,
      input,
    );

    response.status(200).json({
      success: true,
      data: { balance },
    });
  } catch (error) {
    next(error);
  }
}

export async function listLeaveCalendarController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const query = listLeaveCalendarQuerySchema.parse(request.query);
    const items = await listLeaveCalendar(tenant, actor, query);

    response.status(200).json({
      success: true,
      data: { items },
    });
  } catch (error) {
    next(error);
  }
}

export async function listLeaveRequestsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const query = listLeaveRequestsQuerySchema.parse(request.query);
    const result = await listLeaveRequests(tenant, actor, query);

    response.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function createLeaveRequestController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const input = createLeaveRequestSchema.parse(request.body);
    const leaveRequest = await createLeaveRequest(
      tenant,
      actor,
      input,
    );

    response.status(201).json({
      success: true,
      data: { leaveRequest },
    });
  } catch (error) {
    next(error);
  }
}

export async function getLeaveRequestController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const { id } = leaveRequestIdParamsSchema.parse(request.params);
    const leaveRequest = await getLeaveRequestById(
      tenant,
      actor,
      id,
    );

    response.status(200).json({
      success: true,
      data: { leaveRequest },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateLeaveRequestController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const { id } = leaveRequestIdParamsSchema.parse(request.params);
    const input = updateLeaveRequestSchema.parse(request.body);
    const leaveRequest = await updateLeaveRequest(
      tenant,
      actor,
      id,
      input,
    );

    response.status(200).json({
      success: true,
      data: { leaveRequest },
    });
  } catch (error) {
    next(error);
  }
}

export async function submitLeaveRequestController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const { id } = leaveRequestIdParamsSchema.parse(request.params);
    const leaveRequest = await submitLeaveRequest(
      tenant,
      actor,
      id,
    );

    response.status(200).json({
      success: true,
      data: { leaveRequest },
    });
  } catch (error) {
    next(error);
  }
}

export async function managerReviewLeaveRequestController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const { id } = leaveRequestIdParamsSchema.parse(request.params);
    const input = reviewLeaveRequestSchema.parse(request.body);
    const leaveRequest = await reviewLeaveRequestByManager(
      tenant,
      actor,
      id,
      input,
    );

    response.status(200).json({
      success: true,
      data: { leaveRequest },
    });
  } catch (error) {
    next(error);
  }
}

export async function finalReviewLeaveRequestController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const { id } = leaveRequestIdParamsSchema.parse(request.params);
    const input = reviewLeaveRequestSchema.parse(request.body);
    const leaveRequest = await reviewLeaveRequestFinal(
      tenant,
      actor,
      id,
      input,
    );

    response.status(200).json({
      success: true,
      data: { leaveRequest },
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelLeaveRequestController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const { id } = leaveRequestIdParamsSchema.parse(request.params);
    const input = cancelLeaveRequestSchema.parse(request.body);
    const leaveRequest = await cancelLeaveRequest(
      tenant,
      actor,
      id,
      input,
    );

    response.status(200).json({
      success: true,
      data: { leaveRequest },
    });
  } catch (error) {
    next(error);
  }
}

export async function listLeaveActivitiesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant, actor } = await getLeaveContext(request);
    const { id } = leaveRequestIdParamsSchema.parse(request.params);
    const query = leaveActivitiesQuerySchema.parse(request.query);
    const activities = await listLeaveActivities(
      tenant,
      actor,
      id,
      query.limit,
    );

    response.status(200).json({
      success: true,
      data: { activities },
    });
  } catch (error) {
    next(error);
  }
}
