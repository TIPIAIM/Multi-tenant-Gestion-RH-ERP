import { z } from "zod";
import {
  leaveRequestStatuses,
  leaveReviewDecisions,
  leaveTypes,
} from "./leave.types.js";
import { isValidDateKey } from "./leave.time.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-fA-F0-9]{24}$/,
    "L'identifiant MongoDB est invalide.",
  );

const dateKeySchema = z
  .string()
  .trim()
  .refine(
    isValidDateKey,
    "La date doit respecter le format YYYY-MM-DD.",
  );

const reasonSchema = z
  .string()
  .trim()
  .min(3, "Le motif est trop court.")
  .max(2000, "Le motif est trop long.");

export const leaveRequestIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const createLeaveRequestSchema = z
  .object({
    agentId: objectIdSchema.optional(),
    leaveType: z.enum(leaveTypes),
    startDate: dateKeySchema,
    endDate: dateKeySchema,
    reason: reasonSchema,
  })
  .superRefine((input, context) => {
    if (input.endDate < input.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message:
          "La date de fin ne peut pas précéder la date de début.",
      });
    }

    if (
      input.startDate.slice(0, 4) !==
      input.endDate.slice(0, 4)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message:
          "Une demande ne peut pas chevaucher deux années administratives.",
      });
    }
  });

export const updateLeaveRequestSchema = z
  .object({
    leaveType: z.enum(leaveTypes).optional(),
    startDate: dateKeySchema.optional(),
    endDate: dateKeySchema.optional(),
    reason: reasonSchema.optional(),
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    "Au moins une information doit être modifiée.",
  );

export const reviewLeaveRequestSchema = z
  .object({
    decision: z.enum(leaveReviewDecisions),
    comment: z
      .string()
      .trim()
      .max(1200, "Le commentaire est trop long.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((input, context) => {
    if (
      input.decision === "REJECTED" &&
      !input.comment?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message:
          "Un motif est requis en cas de refus.",
      });
    }
  });

export const cancelLeaveRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Le motif d'annulation est trop court.")
    .max(1000, "Le motif d'annulation est trop long."),
});

export const listLeaveRequestsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
    status: z.enum(leaveRequestStatuses).optional(),
    leaveType: z.enum(leaveTypes).optional(),
    agentId: objectIdSchema.optional(),
    directionId: objectIdSchema.optional(),
    serviceId: objectIdSchema.optional(),
    dateFrom: dateKeySchema.optional(),
    dateTo: dateKeySchema.optional(),
    sort: z
      .enum([
        "START_DATE_ASC",
        "START_DATE_DESC",
        "CREATED_DESC",
      ])
      .default("START_DATE_DESC"),
  })
  .superRefine((input, context) => {
    if (
      input.dateFrom &&
      input.dateTo &&
      input.dateTo < input.dateFrom
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message:
          "La date de fin ne peut pas précéder la date de début.",
      });
    }
  });

export const listLeaveCalendarQuerySchema = z
  .object({
    dateFrom: dateKeySchema.optional(),
    dateTo: dateKeySchema.optional(),
  })
  .superRefine((input, context) => {
    if (
      input.dateFrom &&
      input.dateTo &&
      input.dateTo < input.dateFrom
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message:
          "La date de fin ne peut pas précéder la date de début.",
      });
    }
  });

const leaveBalanceNumber = z.coerce
  .number()
  .finite()
  .min(-365)
  .max(365);

export const upsertLeaveBalanceSchema = z.object({
  agentId: objectIdSchema,
  calendarYear: z.coerce.number().int().min(2020).max(2200),
  leaveType: z.enum(leaveTypes),
  openingDays: leaveBalanceNumber.default(0),
  entitledDays: leaveBalanceNumber.default(0),
  carriedOverDays: leaveBalanceNumber.default(0),
  adjustmentDays: leaveBalanceNumber.default(0),
});

export const listLeaveBalancesQuerySchema = z.object({
  agentId: objectIdSchema.optional(),
  calendarYear: z.coerce.number().int().min(2020).max(2200).optional(),
});

export const leaveDashboardQuerySchema = z.object({
  calendarYear: z.coerce.number().int().min(2020).max(2200).optional(),
});

export const leaveActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateLeaveRequestInput = z.output<
  typeof createLeaveRequestSchema
>;
export type UpdateLeaveRequestInput = z.output<
  typeof updateLeaveRequestSchema
>;
export type ReviewLeaveRequestInput = z.output<
  typeof reviewLeaveRequestSchema
>;
export type CancelLeaveRequestInput = z.output<
  typeof cancelLeaveRequestSchema
>;
export type ListLeaveRequestsQuery = z.output<
  typeof listLeaveRequestsQuerySchema
>;
export type ListLeaveCalendarQuery = z.output<
  typeof listLeaveCalendarQuerySchema
>;
export type UpsertLeaveBalanceInput = z.output<
  typeof upsertLeaveBalanceSchema
>;
export type ListLeaveBalancesQuery = z.output<
  typeof listLeaveBalancesQuerySchema
>;
