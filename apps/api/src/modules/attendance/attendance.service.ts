import { Types } from "mongoose";
  import { AppError } from "../../core/errors/app-error.js";
  import { AgentModel } from "../agents/agent.model.js";
  import type {
    TenantDocument,
  } from "../tenants/tenant.types.js";
  import {
    assertCanCreateAttendanceForAgent,
    assertCanDeleteAttendance,
    assertCanManageAttendance,
    assertCanReadAttendance,
    getAttendanceScopeFilter,
    requireOwnAttendanceAgent,
    requireOwnAttendanceScope,
    type AttendanceActor,
  } from "./attendance.access.js";
  import {
    AttendanceEventModel,
    AttendanceModel,
  } from "./attendance.models.js";
  import type {
    AttendanceStatsQuery,
    CreateManualAttendanceInput,
    ListAttendanceQuery,
    UpdateAttendanceInput,
  } from "./attendance.schema.js";
  import {
    calculateAttendanceMetrics,
    defaultAttendanceSchedule,
    getAttendanceDateKey,
    getCurrentMonthRange,
  } from "./attendance.time.js";
  import type {
    AttendanceDocument,
    AttendanceEventAction,
    AttendanceStatus,
    PublicAttendance,
    PublicAttendanceEvent,
  } from "./attendance.types.js";
  
  function cleanOptionalText(
    value?: string,
  ): string | undefined {
    const cleaned = value?.trim();
  
    return cleaned || undefined;
  }
  
  function parseOptionalDate(
    value?: string,
  ): Date | undefined {
    const cleaned = value?.trim();
  
    return cleaned ? new Date(cleaned) : undefined;
  }
  
  function serializeAttendance(
    attendance: AttendanceDocument,
  ): PublicAttendance {
    return {
      id: attendance.id,
  
      agentId: attendance.agentId.toString(),
  
      directionId: attendance.directionId.toString(),
  
      serviceId: attendance.serviceId
        ? attendance.serviceId.toString()
        : null,
  
      attendanceDate: attendance.attendanceDate,
  
      status: attendance.status,
  
      checkInAt: attendance.checkInAt?.toISOString(),
      checkOutAt: attendance.checkOutAt?.toISOString(),
  
      checkInSource: attendance.checkInSource,
      checkOutSource: attendance.checkOutSource,
  
      lateMinutes: attendance.lateMinutes,
      workedMinutes: attendance.workedMinutes,
      overtimeMinutes: attendance.overtimeMinutes,
      earlyDepartureMinutes:
        attendance.earlyDepartureMinutes,
  
      note: attendance.note,
  
      createdByUserId:
        attendance.createdByUserId.toString(),
  
      lastUpdatedByUserId:
        attendance.lastUpdatedByUserId?.toString(),
  
      createdAt: attendance.createdAt?.toISOString(),
      updatedAt: attendance.updatedAt?.toISOString(),
    };
  }
  
  function serializeEvent(event: {
    id: string;
  
    attendanceId: Types.ObjectId;
    agentId: Types.ObjectId;
  
    actorUserId: Types.ObjectId;
    actorName: string;
  
    action: AttendanceEventAction;
    summary: string;
  
    createdAt?: Date;
  }): PublicAttendanceEvent {
    return {
      id: event.id,
  
      attendanceId: event.attendanceId.toString(),
      agentId: event.agentId.toString(),
  
      actorUserId: event.actorUserId.toString(),
      actorName: event.actorName,
  
      action: event.action,
      summary: event.summary,
  
      createdAt: event.createdAt?.toISOString(),
    };
  }
  
  function deriveAutomaticStatus(
    checkInAt?: Date,
  ): AttendanceStatus {
    if (!checkInAt) {
      return "ABSENT";
    }
  
    const metrics = calculateAttendanceMetrics({
      checkInAt,
    });
  
    return metrics.lateMinutes > 0
      ? "LATE"
      : "PRESENT";
  }
  
  function resolveRecordStatus(input: {
    requestedStatus?: AttendanceStatus;
    checkInAt?: Date;
  }): AttendanceStatus {
    if (
      input.requestedStatus &&
      !["PRESENT", "LATE"].includes(
        input.requestedStatus,
      )
    ) {
      return input.requestedStatus;
    }
  
    return deriveAutomaticStatus(input.checkInAt);
  }
  
  function assertDateOrder(
    checkInAt?: Date,
    checkOutAt?: Date,
  ): void {
    if (
      checkInAt &&
      checkOutAt &&
      checkOutAt.getTime() < checkInAt.getTime()
    ) {
      throw new AppError(
        "L'heure de départ ne peut pas être antérieure à l'heure d'arrivée.",
        400,
        "ATTENDANCE_TIME_RANGE_INVALID",
      );
    }
  }
  
  async function getAgentSnapshotOrThrow(
    tenant: TenantDocument,
    agentId: string,
  ): Promise<{
    id: Types.ObjectId;
    directionId: Types.ObjectId;
    serviceId: Types.ObjectId | null;
  }> {
    const agent = await (AgentModel as any).findOne({
      _id: agentId,
      tenantId: tenant._id,
    })
      .select("_id directionId serviceId")
      .lean()
      .exec();
  
    if (!agent) {
      throw new AppError(
        "L'agent sélectionné est introuvable.",
        404,
        "ATTENDANCE_AGENT_NOT_FOUND",
      );
    }
  
    const rawAgent = agent as {
      _id: Types.ObjectId;
      directionId?: Types.ObjectId;
      serviceId?: Types.ObjectId | null;
    };
  
    if (!rawAgent.directionId) {
      throw new AppError(
        "L'agent sélectionné doit être rattaché à une Direction.",
        400,
        "ATTENDANCE_AGENT_DIRECTION_REQUIRED",
      );
    }
  
    return {
      id: rawAgent._id,
      directionId: rawAgent.directionId,
      serviceId: rawAgent.serviceId ?? null,
    };
  }
  
  async function getAttendanceOrThrow(
    tenant: TenantDocument,
    attendanceId: string,
  ): Promise<AttendanceDocument> {
    const attendance = await AttendanceModel.findOne({
      _id: attendanceId,
      tenantId: tenant._id,
    }).exec();
  
    if (!attendance) {
      throw new AppError(
        "Le pointage demandé est introuvable.",
        404,
        "ATTENDANCE_NOT_FOUND",
      );
    }
  
    return attendance;
  }
  
  async function recordAttendanceEvent(input: {
    tenant: TenantDocument;
    attendance: AttendanceDocument;
    actor: AttendanceActor;
    action: AttendanceEventAction;
    summary: string;
  }): Promise<void> {
    await AttendanceEventModel.create({
      tenantId: input.tenant._id,
  
      attendanceId: input.attendance._id,
      agentId: input.attendance.agentId,
  
      actorUserId: input.actor.userId,
      actorName: input.actor.fullName,
  
      action: input.action,
      summary: input.summary,
    });
  }
  
  function applyMetrics(
    attendance: AttendanceDocument,
  ): void {
    const metrics = calculateAttendanceMetrics({
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
  
      scheduleStartMinutes:
        attendance.scheduleStartMinutes,
  
      scheduleEndMinutes:
        attendance.scheduleEndMinutes,
  
      graceMinutes: attendance.graceMinutes,
    });
  
    attendance.lateMinutes = metrics.lateMinutes;
    attendance.workedMinutes = metrics.workedMinutes;
    attendance.overtimeMinutes = metrics.overtimeMinutes;
    attendance.earlyDepartureMinutes =
      metrics.earlyDepartureMinutes;
  }
  
  function resolveDateRange(
    query: AttendanceStatsQuery,
  ): {
    dateFrom: string;
    dateTo: string;
  } {
    const monthRange = getCurrentMonthRange();
  
    return {
      dateFrom: query.dateFrom ?? monthRange.dateFrom,
      dateTo: query.dateTo ?? monthRange.dateTo,
    };
  }
  
  function buildAttendanceFilter(input: {
    tenant: TenantDocument;
    actor: AttendanceActor;
    query: {
      dateFrom?: string;
      dateTo?: string;
      status?: AttendanceStatus;
      agentId?: string;
      directionId?: string;
      serviceId?: string;
    };
  }): Record<string, any> {
    const filters: Record<string, any>[] = [
      { tenantId: input.tenant._id },
    ];
  
    const scopeFilter = getAttendanceScopeFilter(input.actor);
  
    if (Object.keys(scopeFilter).length > 0) {
      filters.push(scopeFilter);
    }
  
    if (input.query.status) {
      filters.push({ status: input.query.status });
    }
  
    if (input.query.agentId) {
      filters.push({ agentId: input.query.agentId });
    }
  
    if (input.query.directionId) {
      filters.push({ directionId: input.query.directionId });
    }
  
    if (input.query.serviceId) {
      filters.push({ serviceId: input.query.serviceId });
    }
  
    if (input.query.dateFrom || input.query.dateTo) {
      filters.push({
        attendanceDate: {
          ...(input.query.dateFrom
            ? { $gte: input.query.dateFrom }
            : {}),
  
          ...(input.query.dateTo
            ? { $lte: input.query.dateTo }
            : {}),
        },
      });
    }
  
    return filters.length === 1
      ? filters[0] ?? {}
      : { $and: filters };
  }
  
  export async function checkInSelf(
    tenant: TenantDocument,
    actor: AttendanceActor,
    note?: string,
  ): Promise<PublicAttendance> {
    const ownScope = requireOwnAttendanceScope(actor);
    const agentId = ownScope.agentId;
  
    const now = new Date();
    const attendanceDate = getAttendanceDateKey(now);
  
    const existingAttendance =
      await AttendanceModel.findOne({
        tenantId: tenant._id,
        agentId,
        attendanceDate,
      }).exec();
  
    if (existingAttendance?.checkInAt) {
      throw new AppError(
        "Votre arrivée a déjà été enregistrée pour aujourd'hui.",
        409,
        "ATTENDANCE_ALREADY_CHECKED_IN",
      );
    }
  
    if (existingAttendance) {
      existingAttendance.checkInAt = now;
      existingAttendance.checkInSource = "SELF_SERVICE";
      existingAttendance.status =
        resolveRecordStatus({
          checkInAt: now,
        });
  
      existingAttendance.note =
        cleanOptionalText(note) ??
        existingAttendance.note;
  
      existingAttendance.lastUpdatedByUserId =
        actor.userId;
  
      applyMetrics(existingAttendance);
  
      await existingAttendance.save();
  
      await recordAttendanceEvent({
        tenant,
        attendance: existingAttendance,
        actor,
        action: "CHECKED_IN",
        summary: "Arrivée enregistrée par l'agent.",
      });
  
      return serializeAttendance(existingAttendance);
    }
  
    const attendance = await AttendanceModel.create({
      tenantId: tenant._id,
  
      agentId,
  
      directionId: ownScope.directionId,
      serviceId: ownScope.serviceId,
  
      attendanceDate,
  
      status: resolveRecordStatus({
        checkInAt: now,
      }),
  
      checkInAt: now,
      checkInSource: "SELF_SERVICE",
  
      scheduleStartMinutes:
        defaultAttendanceSchedule.startMinutes,
  
      scheduleEndMinutes:
        defaultAttendanceSchedule.endMinutes,
  
      graceMinutes:
        defaultAttendanceSchedule.graceMinutes,
  
      lateMinutes: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      earlyDepartureMinutes: 0,
  
      note: cleanOptionalText(note),
  
      createdByUserId: actor.userId,
      lastUpdatedByUserId: actor.userId,
    });
  
    applyMetrics(attendance);
  
    await attendance.save();
  
    await recordAttendanceEvent({
      tenant,
      attendance,
      actor,
      action: "CHECKED_IN",
      summary: "Arrivée enregistrée par l'agent.",
    });
  
    return serializeAttendance(attendance);
  }
  
  export async function checkOutSelf(
    tenant: TenantDocument,
    actor: AttendanceActor,
    note?: string,
  ): Promise<PublicAttendance> {
    const agentId = requireOwnAttendanceAgent(actor);
  
    const attendanceDate = getAttendanceDateKey();
  
    const attendance = await AttendanceModel.findOne({
      tenantId: tenant._id,
      agentId,
      attendanceDate,
    }).exec();
  
    if (!attendance?.checkInAt) {
      throw new AppError(
        "Vous devez enregistrer votre arrivée avant votre départ.",
        400,
        "ATTENDANCE_CHECK_IN_REQUIRED",
      );
    }
  
    if (attendance.checkOutAt) {
      throw new AppError(
        "Votre départ a déjà été enregistré aujourd'hui.",
        409,
        "ATTENDANCE_ALREADY_CHECKED_OUT",
      );
    }
  
    attendance.checkOutAt = new Date();
    attendance.checkOutSource = "SELF_SERVICE";
  
    attendance.note =
      cleanOptionalText(note) ?? attendance.note;
  
    attendance.lastUpdatedByUserId = actor.userId;
  
    applyMetrics(attendance);
  
    await attendance.save();
  
    await recordAttendanceEvent({
      tenant,
      attendance,
      actor,
      action: "CHECKED_OUT",
      summary: "Départ enregistré par l'agent.",
    });
  
    return serializeAttendance(attendance);
  }
  
  export async function getMyAttendanceToday(
    tenant: TenantDocument,
    actor: AttendanceActor,
  ): Promise<PublicAttendance | null> {
    const agentId = requireOwnAttendanceAgent(actor);
  
    const attendanceDate = getAttendanceDateKey();
  
    const attendance = await AttendanceModel.findOne({
      tenantId: tenant._id,
      agentId,
      attendanceDate,
    }).exec();
  
    return attendance
      ? serializeAttendance(attendance)
      : null;
  }
  
  export async function createManualAttendance(
    tenant: TenantDocument,
    actor: AttendanceActor,
    input: CreateManualAttendanceInput,
  ): Promise<PublicAttendance> {
    const agent = await getAgentSnapshotOrThrow(
      tenant,
      input.agentId,
    );
  
    assertCanCreateAttendanceForAgent(actor, {
      agentId: agent.id,
      directionId: agent.directionId,
      serviceId: agent.serviceId,
    });
  
    const existingAttendance =
      await AttendanceModel.exists({
        tenantId: tenant._id,
        agentId: agent.id,
        attendanceDate: input.attendanceDate,
      });
  
    if (existingAttendance) {
      throw new AppError(
        "Un pointage existe déjà pour cet agent à cette date.",
        409,
        "ATTENDANCE_DUPLICATE_DATE",
      );
    }
  
    const checkInAt = parseOptionalDate(input.checkInAt);
    const checkOutAt = parseOptionalDate(
      input.checkOutAt,
    );
  
    assertDateOrder(checkInAt, checkOutAt);
  
    const attendance = await AttendanceModel.create({
      tenantId: tenant._id,
  
      agentId: agent.id,
  
      directionId: agent.directionId,
      serviceId: agent.serviceId,
  
      attendanceDate: input.attendanceDate,
  
      status: resolveRecordStatus({
        requestedStatus: input.status,
        checkInAt,
      }),
  
      checkInAt,
      checkOutAt,
  
      checkInSource: checkInAt
        ? "MANUAL"
        : undefined,
  
      checkOutSource: checkOutAt
        ? "MANUAL"
        : undefined,
  
      scheduleStartMinutes:
        defaultAttendanceSchedule.startMinutes,
  
      scheduleEndMinutes:
        defaultAttendanceSchedule.endMinutes,
  
      graceMinutes:
        defaultAttendanceSchedule.graceMinutes,
  
      lateMinutes: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      earlyDepartureMinutes: 0,
  
      note: cleanOptionalText(input.note),
  
      createdByUserId: actor.userId,
      lastUpdatedByUserId: actor.userId,
    });
  
    applyMetrics(attendance);
  
    await attendance.save();
  
    await recordAttendanceEvent({
      tenant,
      attendance,
      actor,
      action: "MANUAL_CREATED",
      summary: `Pointage manuel créé pour le ${attendance.attendanceDate}.`,
    });
  
    return serializeAttendance(attendance);
  }
  
  export async function updateAttendance(
    tenant: TenantDocument,
    actor: AttendanceActor,
    attendanceId: string,
    input: UpdateAttendanceInput,
  ): Promise<PublicAttendance> {
    const attendance = await getAttendanceOrThrow(
      tenant,
      attendanceId,
    );
  
    assertCanManageAttendance(attendance, actor);
  
    const nextCheckInAt =
      input.checkInAt !== undefined
        ? parseOptionalDate(input.checkInAt)
        : attendance.checkInAt;
  
    const nextCheckOutAt =
      input.checkOutAt !== undefined
        ? parseOptionalDate(input.checkOutAt)
        : attendance.checkOutAt;
  
    assertDateOrder(nextCheckInAt, nextCheckOutAt);
  
    const previousStatus = attendance.status;
    const previousCheckInAt = attendance.checkInAt;
    const previousCheckOutAt = attendance.checkOutAt;
  
    attendance.checkInAt = nextCheckInAt;
    attendance.checkOutAt = nextCheckOutAt;
  
    if (input.checkInAt !== undefined) {
      attendance.checkInSource = nextCheckInAt
        ? "MANUAL"
        : undefined;
    }
  
    if (input.checkOutAt !== undefined) {
      attendance.checkOutSource = nextCheckOutAt
        ? "MANUAL"
        : undefined;
    }
  
    attendance.status = resolveRecordStatus({
      requestedStatus: input.status ?? attendance.status,
      checkInAt: nextCheckInAt,
    });
  
    if (input.note !== undefined) {
      attendance.note = cleanOptionalText(input.note);
    }
  
    attendance.lastUpdatedByUserId = actor.userId;
  
    applyMetrics(attendance);
  
    await attendance.save();
  
    const changes: string[] = [];
  
    if (previousStatus !== attendance.status) {
      changes.push(
        `Statut : ${previousStatus} → ${attendance.status}`,
      );
    }
  
    if (
      previousCheckInAt?.getTime() !==
      attendance.checkInAt?.getTime()
    ) {
      changes.push("Heure d'arrivée corrigée");
    }
  
    if (
      previousCheckOutAt?.getTime() !==
      attendance.checkOutAt?.getTime()
    ) {
      changes.push("Heure de départ corrigée");
    }
  
    await recordAttendanceEvent({
      tenant,
      attendance,
      actor,
      action: "CORRECTED",
      summary:
        changes.join(" · ") ||
        "Pointage administratif mis à jour.",
    });
  
    return serializeAttendance(attendance);
  }
  
  export async function deleteAttendance(
    tenant: TenantDocument,
    actor: AttendanceActor,
    attendanceId: string,
  ): Promise<{ deleted: true; id: string }> {
    const attendance = await getAttendanceOrThrow(
      tenant,
      attendanceId,
    );
  
    assertCanDeleteAttendance(attendance, actor);
  
    const deletedId = attendance.id;
  
    await AttendanceEventModel.deleteMany({
      tenantId: tenant._id,
      attendanceId: attendance._id,
    }).exec();
  
    await attendance.deleteOne();
  
    return {
      deleted: true,
      id: deletedId,
    };
  }
  
  export async function getAttendanceById(
    tenant: TenantDocument,
    actor: AttendanceActor,
    attendanceId: string,
  ): Promise<PublicAttendance> {
    const attendance = await getAttendanceOrThrow(
      tenant,
      attendanceId,
    );
  
    assertCanReadAttendance(attendance, actor);
  
    return serializeAttendance(attendance);
  }
  
  export async function listAttendances(
    tenant: TenantDocument,
    actor: AttendanceActor,
    query: ListAttendanceQuery,
  ): Promise<{
    items: PublicAttendance[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const filter = buildAttendanceFilter({
      tenant,
      actor,
      query,
    });
  
    const skip = (query.page - 1) * query.limit;
  
    const [records, total] = await Promise.all([
      AttendanceModel.find(filter)
        .sort({
          attendanceDate: -1,
          checkInAt: -1,
        })
        .skip(skip)
        .limit(query.limit)
        .exec(),
  
      AttendanceModel.countDocuments(filter).exec(),
    ]);
  
    return {
      items: records.map(serializeAttendance),
  
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(
          1,
          Math.ceil(total / query.limit),
        ),
      },
    };
  }
  
  export async function getAttendanceStats(
    tenant: TenantDocument,
    actor: AttendanceActor,
    query: AttendanceStatsQuery,
  ): Promise<{
    dateFrom: string;
    dateTo: string;
  
    total: number;
    present: number;
    late: number;
    absent: number;
    onLeave: number;
    remote: number;
    businessTrip: number;
    excused: number;
  
    pendingCheckOut: number;
  
    workedMinutes: number;
    overtimeMinutes: number;
    lateMinutes: number;
  }> {
    const range = resolveDateRange(query);
  
    const baseFilter = buildAttendanceFilter({
      tenant,
      actor,
      query: {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      },
    });
  
    const [
      total,
      present,
      late,
      absent,
      onLeave,
      remote,
      businessTrip,
      excused,
      pendingCheckOut,
      totals,
    ] = await Promise.all([
      AttendanceModel.countDocuments(baseFilter).exec(),
  
      AttendanceModel.countDocuments({
        ...baseFilter,
        status: {
          $in: ["PRESENT", "LATE"],
        },
      }).exec(),
  
      AttendanceModel.countDocuments({
        ...baseFilter,
        status: "LATE",
      }).exec(),
  
      AttendanceModel.countDocuments({
        ...baseFilter,
        status: "ABSENT",
      }).exec(),
  
      AttendanceModel.countDocuments({
        ...baseFilter,
        status: "ON_LEAVE",
      }).exec(),
  
      AttendanceModel.countDocuments({
        ...baseFilter,
        status: "REMOTE",
      }).exec(),
  
      AttendanceModel.countDocuments({
        ...baseFilter,
        status: "BUSINESS_TRIP",
      }).exec(),
  
      AttendanceModel.countDocuments({
        ...baseFilter,
        status: "EXCUSED",
      }).exec(),
  
      AttendanceModel.countDocuments({
        ...baseFilter,
        checkInAt: {
          $exists: true,
        },
        checkOutAt: {
          $exists: false,
        },
      }).exec(),
  
      AttendanceModel.aggregate<{
        workedMinutes: number;
        overtimeMinutes: number;
        lateMinutes: number;
      }>([
        {
          $match: baseFilter,
        },
        {
          $group: {
            _id: null,
  
            workedMinutes: {
              $sum: "$workedMinutes",
            },
  
            overtimeMinutes: {
              $sum: "$overtimeMinutes",
            },
  
            lateMinutes: {
              $sum: "$lateMinutes",
            },
          },
        },
      ]).exec(),
    ]);
  
    return {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
  
      total,
      present,
      late,
      absent,
      onLeave,
      remote,
      businessTrip,
      excused,
  
      pendingCheckOut,
  
      workedMinutes: totals[0]?.workedMinutes ?? 0,
      overtimeMinutes:
        totals[0]?.overtimeMinutes ?? 0,
      lateMinutes: totals[0]?.lateMinutes ?? 0,
    };
  }
  
  export async function listAttendanceEvents(
    tenant: TenantDocument,
    actor: AttendanceActor,
    attendanceId: string,
    limit: number,
  ): Promise<PublicAttendanceEvent[]> {
    const attendance = await getAttendanceOrThrow(
      tenant,
      attendanceId,
    );
  
    assertCanReadAttendance(attendance, actor);
  
    const events = await AttendanceEventModel.find({
      tenantId: tenant._id,
      attendanceId: attendance._id,
    })
      .sort({
        createdAt: -1,
      })
      .limit(limit)
      .exec();
  
    return events.map(serializeEvent);
  }