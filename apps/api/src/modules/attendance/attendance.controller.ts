import type {
    NextFunction,
    Request,
    Response,
  } from "express";
  import { AppError } from "../../core/errors/app-error.js";
  import {
    resolveAttendanceActor,
  } from "./attendance.access.js";
  import {
    attendanceEventsQuerySchema,
    attendanceIdParamsSchema,
    attendanceStatsQuerySchema,
    createManualAttendanceSchema,
    listAttendanceQuerySchema,
    selfAttendanceInputSchema,
    updateAttendanceSchema,
  } from "./attendance.schema.js";
  import {
    checkInSelf,
    checkOutSelf,
    createManualAttendance,
    deleteAttendance,
    getAttendanceById,
    getAttendanceStats,
    getMyAttendanceToday,
    listAttendanceEvents,
    listAttendances,
    updateAttendance,
  } from "./attendance.service.js";
  
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
  
  function getAuthenticatedUserIdOrThrow(
    request: Request,
  ): string {
    if (!request.auth?.userId) {
      throw new AppError(
        "Authentification requise.",
        401,
        "AUTH_REQUIRED",
      );
    }
  
    return request.auth.userId;
  }
  
  async function getAttendanceContext(
    request: Request,
  ) {
    const tenant = getTenantOrThrow(request);
  
    const userId =
      getAuthenticatedUserIdOrThrow(request);
  
    const actor = await resolveAttendanceActor(
      tenant,
      userId,
    );
  
    return {
      tenant,
      actor,
    };
  }
  
  export async function checkInSelfController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const input = selfAttendanceInputSchema.parse(
        request.body ?? {},
      );
  
      const attendance = await checkInSelf(
        tenant,
        actor,
        input.note,
      );
  
      response.status(201).json({
        success: true,
        data: {
          attendance,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function checkOutSelfController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const input = selfAttendanceInputSchema.parse(
        request.body ?? {},
      );
  
      const attendance = await checkOutSelf(
        tenant,
        actor,
        input.note,
      );
  
      response.status(200).json({
        success: true,
        data: {
          attendance,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function getMyAttendanceTodayController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const attendance = await getMyAttendanceToday(
        tenant,
        actor,
      );
  
      response.status(200).json({
        success: true,
        data: {
          attendance,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function createManualAttendanceController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const input =
        createManualAttendanceSchema.parse(
          request.body,
        );
  
      const attendance = await createManualAttendance(
        tenant,
        actor,
        input,
      );
  
      response.status(201).json({
        success: true,
        data: {
          attendance,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function updateAttendanceController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const { id } = attendanceIdParamsSchema.parse(
        request.params,
      );
  
      const input = updateAttendanceSchema.parse(
        request.body,
      );
  
      const attendance = await updateAttendance(
        tenant,
        actor,
        id,
        input,
      );
  
      response.status(200).json({
        success: true,
        data: {
          attendance,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function listAttendancesController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const query = listAttendanceQuerySchema.parse(
        request.query,
      );
  
      const result = await listAttendances(
        tenant,
        actor,
        query,
      );
  
      response.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function getAttendanceStatsController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const query =
        attendanceStatsQuerySchema.parse(
          request.query,
        );
  
      const stats = await getAttendanceStats(
        tenant,
        actor,
        query,
      );
  
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
  
  export async function getAttendanceController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const { id } = attendanceIdParamsSchema.parse(
        request.params,
      );
  
      const attendance = await getAttendanceById(
        tenant,
        actor,
        id,
      );
  
      response.status(200).json({
        success: true,
        data: {
          attendance,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function listAttendanceEventsController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const { id } = attendanceIdParamsSchema.parse(
        request.params,
      );
  
      const query =
        attendanceEventsQuerySchema.parse(
          request.query,
        );
  
      const events = await listAttendanceEvents(
        tenant,
        actor,
        id,
        query.limit,
      );
  
      response.status(200).json({
        success: true,
        data: {
          events,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  export async function deleteAttendanceController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { tenant, actor } =
        await getAttendanceContext(request);
  
      const { id } = attendanceIdParamsSchema.parse(
        request.params,
      );
  
      response.status(200).json({
        success: true,
        data: await deleteAttendance(
          tenant,
          actor,
          id,
        ),
      });
    } catch (error) {
      next(error);
    }
  }
