import { z } from "zod";
import {
  evaluationCriteriaKeys,
  evaluationDecisions,
  evaluationStatuses,
} from "./evaluation.types.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "L'identifiant MongoDB est invalide.");

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).optional().or(z.literal(""));

const dateStringSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "La date est invalide.");

const scoreSchema = z.coerce.number().min(0).max(5).optional();

const evidenceLinkSchema = z.object({
  title: z.string().trim().min(2).max(180),
  url: z.string().trim().url("Le lien doit être une URL valide.").max(800),
  description: optionalText(500),
});

const criterionInputSchema = z.object({
  key: z.enum(evaluationCriteriaKeys),
  selfScore: scoreSchema,
  managerScore: scoreSchema,
  hrScore: scoreSchema,
  comment: optionalText(1200),
  evidenceLinks: z.array(evidenceLinkSchema).max(10).optional(),
});

export const evaluationIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const createEvaluationSchema = z
  .object({
    agentId: objectIdSchema,
    title: z.string().trim().min(3).max(220).optional(),
    evaluationYear: z.coerce.number().int().min(2000).max(2100).optional(),
    periodStartDate: dateStringSchema,
    periodEndDate: dateStringSchema,
    evidenceLinks: z.array(evidenceLinkSchema).max(20).optional(),
    confidentialNote: optionalText(4000),
  })
  .superRefine((input, context) => {
    if (new Date(input.periodEndDate).getTime() < new Date(input.periodStartDate).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEndDate"],
        message: "La date de fin ne peut pas précéder la date de début.",
      });
    }
  });

export const updateEvaluationSchema = z
  .object({
    title: z.string().trim().min(3).max(220).optional(),
    periodStartDate: dateStringSchema.optional(),
    periodEndDate: dateStringSchema.optional(),
    evidenceLinks: z.array(evidenceLinkSchema).max(20).optional(),
    criteria: z.array(criterionInputSchema).max(20).optional(),
    confidentialNote: optionalText(4000),
    status: z.enum(evaluationStatuses).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Au moins une donnée doit être modifiée.")
  .superRefine((input, context) => {
    if (
      input.periodStartDate &&
      input.periodEndDate &&
      new Date(input.periodEndDate).getTime() < new Date(input.periodStartDate).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEndDate"],
        message: "La date de fin ne peut pas précéder la date de début.",
      });
    }
  });

export const reviewBlockSchema = z.object({
  comment: optionalText(3000),
  strengths: optionalText(2500),
  improvementAreas: optionalText(2500),
  trainingNeeds: optionalText(2500),
  nextObjectives: optionalText(2500),
  criteria: z.array(criterionInputSchema).max(20).optional(),
});

export const hrValidationSchema = z.object({
  finalDecision: z.enum(evaluationDecisions).default("NO_DECISION"),
  finalComment: optionalText(3500),
  criteria: z.array(criterionInputSchema).max(20).optional(),
});

export const listEvaluationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(evaluationStatuses).optional(),
  evaluationYear: z.coerce.number().int().min(2000).max(2100).optional(),
  agentId: objectIdSchema.optional(),
  directionId: objectIdSchema.optional(),
  serviceId: objectIdSchema.optional(),
  dateFrom: dateStringSchema.optional(),
  dateTo: dateStringSchema.optional(),
  sort: z
    .enum(["CREATED_DESC", "PERIOD_DESC", "SCORE_DESC", "AGENT_ASC"])
    .default("CREATED_DESC"),
});

export type CreateEvaluationInput = z.output<typeof createEvaluationSchema>;
export type UpdateEvaluationInput = z.output<typeof updateEvaluationSchema>;
export type ReviewBlockInput = z.output<typeof reviewBlockSchema>;
export type HrValidationInput = z.output<typeof hrValidationSchema>;
export type ListEvaluationsQuery = z.output<typeof listEvaluationsQuerySchema>;
