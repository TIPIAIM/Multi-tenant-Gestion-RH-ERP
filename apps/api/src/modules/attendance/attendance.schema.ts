import { z } from "zod";
import {
  attendanceStatuses,
} from "./attendance.types.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-fA-F0-9]{24}$/,
    "L'identifiant MongoDB est invalide.",
  );

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const attendanceDateSchema = z
  .string()
  .trim()
  .refine(
    isValidDateKey,
    "La date de présence doit respecter le format YYYY-MM-DD.",
  );

const dateTimeSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      !Number.isNaN(new Date(value).getTime()),
    "La date et l'heure sont invalides.",
  );

const optionalDateTimeSchema = dateTimeSchema
  .optional()
  .or(z.literal(""));

const optionalTextSchema = z
  .string()
  .trim()
  .max(1000, "La note est trop longue.")
  .optional()
  .or(z.literal(""));

export const attendanceIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const selfAttendanceInputSchema = z.object({
  note: optionalTextSchema,
});

export const createManualAttendanceSchema = z
  .object({
    agentId: objectIdSchema,

    attendanceDate: attendanceDateSchema,

    status: z
      .enum(attendanceStatuses)
      .default("PRESENT"),

    checkInAt: optionalDateTimeSchema,
    checkOutAt: optionalDateTimeSchema,

    note: optionalTextSchema,
  })
  .superRefine((input, context) => {
    if (
      input.checkInAt &&
      input.checkOutAt &&
      new Date(input.checkOutAt).getTime() <
        new Date(input.checkInAt).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkOutAt"],
        message:
          "L'heure de départ ne peut pas être antérieure à l'heure d'arrivée.",
      });
    }
  });

export const updateAttendanceSchema = z
  .object({
    status: z.enum(attendanceStatuses).optional(),

    checkInAt: optionalDateTimeSchema,
    checkOutAt: optionalDateTimeSchema,

    note: optionalTextSchema,
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    "Au moins une information doit être modifiée.",
  );

export const listAttendanceQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25),

    dateFrom: attendanceDateSchema.optional(),
    dateTo: attendanceDateSchema.optional(),

    status: z.enum(attendanceStatuses).optional(),

    agentId: objectIdSchema.optional(),
    directionId: objectIdSchema.optional(),
    serviceId: objectIdSchema.optional(),
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

export const attendanceStatsQuerySchema = z
  .object({
    dateFrom: attendanceDateSchema.optional(),
    dateTo: attendanceDateSchema.optional(),

    directionId: objectIdSchema.optional(),
    serviceId: objectIdSchema.optional(),
    agentId: objectIdSchema.optional(),
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

export const attendanceEventsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30),
});

export type CreateManualAttendanceInput = z.output<
  typeof createManualAttendanceSchema
>;

export type UpdateAttendanceInput = z.output<
  typeof updateAttendanceSchema
>;

export type ListAttendanceQuery = z.output<
  typeof listAttendanceQuerySchema
>;

export type AttendanceStatsQuery = z.output<
  typeof attendanceStatsQuerySchema
>;