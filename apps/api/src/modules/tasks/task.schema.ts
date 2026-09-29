import { z } from "zod";
import {
  taskDueFilters,
  taskKpiKinds,
  taskPriorities,
  taskStatuses,
} from "./task.types.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "L'identifiant MongoDB est invalide.");

const nullableObjectIdSchema = objectIdSchema.nullable().optional();

const dateStringSchema = z
  .string()
  .trim()
  .refine(
    (value) => !Number.isNaN(new Date(value).getTime()),
    "La date est invalide.",
  );

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).optional().or(z.literal(""));

const tagsSchema = z
  .array(z.string().trim().min(1).max(32))
  .max(8, "Vous ne pouvez pas dépasser 8 étiquettes.");

const progressSchema = z.coerce.number().int().min(0).max(100);

const taskKpiDefinitionSchema = z
  .object({
    id: objectIdSchema.optional(),
    label: z
      .string()
      .trim()
      .min(2, "Le libellé du KPI est trop court.")
      .max(180, "Le libellé du KPI est trop long."),
    kind: z.enum(taskKpiKinds),
    required: z.boolean().default(true),
    instructions: optionalText(1200),
    targetNumber: z.coerce.number().finite().optional(),
    unit: optionalText(50),
  })
  .superRefine((input, context) => {
    if (input.kind !== "NUMBER" && input.targetNumber !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetNumber"],
        message:
          "Une valeur cible chiffrée est réservée aux KPI de type Nombre.",
      });
    }
  });

const kpisSchema = z
  .array(taskKpiDefinitionSchema)
  .max(10, "Une tâche ne peut pas contenir plus de 10 KPI.")
  .default([]);

export const taskIdParamsSchema = z.object({ id: objectIdSchema });
export const taskKpiParamsSchema = z.object({
  id: objectIdSchema,
  kpiId: objectIdSchema,
});

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(3, "Le titre est trop court.").max(220),
    description: optionalText(4000),
    priority: z.enum(taskPriorities).default("MEDIUM"),
    status: z.enum(taskStatuses).default("TODO"),
    progressPercentage: progressSchema.default(0),
    startDate: dateStringSchema.optional().or(z.literal("")),
    dueDate: dateStringSchema.optional().or(z.literal("")),
    directionId: objectIdSchema,
    serviceId: nullableObjectIdSchema,
    assignedToAgentId: objectIdSchema,
    tags: tagsSchema.default([]),
    kpis: kpisSchema,
  })
  .superRefine((input, context) => {
    if (
      input.startDate &&
      input.dueDate &&
      new Date(input.dueDate).getTime() < new Date(input.startDate).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message:
          "L'échéance ne peut pas être antérieure à la date de début.",
      });
    }
  });

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(3).max(220).optional(),
    description: optionalText(4000),
    priority: z.enum(taskPriorities).optional(),
    status: z.enum(taskStatuses).optional(),
    progressPercentage: progressSchema.optional(),
    startDate: dateStringSchema.optional().or(z.literal("")),
    dueDate: dateStringSchema.optional().or(z.literal("")),
    directionId: objectIdSchema.optional(),
    serviceId: nullableObjectIdSchema,
    assignedToAgentId: objectIdSchema.optional(),
    tags: tagsSchema.optional(),
    kpis: z.array(taskKpiDefinitionSchema).max(10).optional(),
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    "Au moins une donnée doit être modifiée.",
  );

export const updateTaskProgressSchema = z.object({
  progressPercentage: progressSchema,
  status: z
    .enum(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"])
    .optional(),
  note: optionalText(500),
});

export const submitTaskKpiValueSchema = z.object({
  value: z.union([
    z.string().trim().min(1, "La valeur du KPI est vide.").max(8000),
    z.coerce.number().finite(),
  ]),
});

export const addTaskCommentSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Le commentaire est vide.")
    .max(2000, "Le commentaire est trop long."),
});

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(taskStatuses).optional(),
  priority: z.enum(taskPriorities).optional(),
  directionId: objectIdSchema.optional(),
  serviceId: objectIdSchema.optional(),
  assignedToAgentId: objectIdSchema.optional(),
  due: z.enum(taskDueFilters).default("ALL"),
  sort: z
    .enum(["DUE_DATE_ASC", "UPDATED_DESC", "CREATED_DESC"])
    .default("DUE_DATE_ASC"),
});

export const taskBoardQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  priority: z.enum(taskPriorities).optional(),
  directionId: objectIdSchema.optional(),
  serviceId: objectIdSchema.optional(),
  assignedToAgentId: objectIdSchema.optional(),
  due: z.enum(taskDueFilters).default("ALL"),
  limit: z.coerce.number().int().min(1).max(250).default(120),
});

export const listTaskActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type TaskKpiDefinitionInput = z.output<
  typeof taskKpiDefinitionSchema
>;
export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
export type UpdateTaskProgressInput = z.output<
  typeof updateTaskProgressSchema
>;
export type SubmitTaskKpiValueInput = z.output<
  typeof submitTaskKpiValueSchema
>;
export type AddTaskCommentInput = z.output<typeof addTaskCommentSchema>;
export type ListTasksQuery = z.output<typeof listTasksQuerySchema>;
export type TaskBoardQuery = z.output<typeof taskBoardQuerySchema>;
