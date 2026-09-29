import { z } from "zod";
import {
  managementReportScopeTypes,
  managementReportStatuses,
  managementReportTypes,
} from "./report.types.js";

const objectIdSchema = z.string().trim().regex(/^[a-fA-F0-9]{24}$/, "L'identifiant MongoDB est invalide.");
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const editorialSchema = z.object({
  introduction: optionalText(8000),
  highlights: optionalText(8000),
  difficulties: optionalText(8000),
  actionsTaken: optionalText(8000),
  outlook: optionalText(8000),
  confidentialNote: optionalText(8000),
});

export const reportGenerationSchema = z
  .object({
    reportType: z.enum(managementReportTypes),
    reportYear: z.coerce.number().int().min(2000).max(2100),
    reportMonth: z.coerce.number().int().min(1).max(12).optional(),
    reportSemester: z.coerce.number().int().min(1).max(2).optional(),
    scopeType: z.enum(managementReportScopeTypes).default("INSTITUTION"),
    directionId: objectIdSchema.optional(),
    serviceId: objectIdSchema.optional(),
    title: z.string().trim().min(3).max(260).optional(),
    editorial: editorialSchema.optional(),
  })
  .superRefine((input, context) => {
    if (input.reportType === "MONTHLY" && !input.reportMonth) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["reportMonth"], message: "Le mois est obligatoire pour un rapport mensuel." });
    }
    if (input.reportType === "SEMIANNUAL" && !input.reportSemester) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["reportSemester"], message: "Le semestre est obligatoire pour un rapport semestriel." });
    }
    if (input.scopeType === "DIRECTION" && !input.directionId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["directionId"], message: "La Direction est obligatoire." });
    }
    if (input.scopeType === "SERVICE" && (!input.directionId || !input.serviceId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceId"], message: "La Direction et le Service sont obligatoires." });
    }
  });

export const reportPreviewQuerySchema = reportGenerationSchema;

export const reportIdParamsSchema = z.object({ id: objectIdSchema });

export const updateManagementReportSchema = z
  .object({
    title: z.string().trim().min(3).max(260).optional(),
    editorial: editorialSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Au moins une donnée doit être modifiée.");

export const validateManagementReportSchema = z.object({
  validationComment: optionalText(5000),
});

export const listManagementReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  reportType: z.enum(managementReportTypes).optional(),
  status: z.enum(managementReportStatuses).optional(),
  reportYear: z.coerce.number().int().min(2000).max(2100).optional(),
  directionId: objectIdSchema.optional(),
  serviceId: objectIdSchema.optional(),
  sort: z.enum(["CREATED_DESC", "PERIOD_DESC", "TYPE_ASC", "STATUS_ASC"]).default("PERIOD_DESC"),
});

export type ReportGenerationInput = z.output<typeof reportGenerationSchema>;
export type UpdateManagementReportInput = z.output<typeof updateManagementReportSchema>;
export type ValidateManagementReportInput = z.output<typeof validateManagementReportSchema>;
export type ListManagementReportsQuery = z.output<typeof listManagementReportsQuerySchema>;
