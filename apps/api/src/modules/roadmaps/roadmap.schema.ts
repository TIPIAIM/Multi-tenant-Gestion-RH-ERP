import { z } from "zod";
import {
  kpiReviewDecisions,
  roadmapStatuses,
} from "./roadmap.types.js";

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

  const [year, month, day] = value
    .split("-")
    .map(Number);

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

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

function roadmapItemHasContent(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;

  return [
    item.title,
    item.description,
    item.kpiLabel,
    item.plannedPeriod,
    item.dueDate,
  ].some(
    (candidate) =>
      typeof candidate === "string" &&
      candidate.trim().length > 0,
  );
}

const optionalTextSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .max(4000, "Le texte KPI est trop long.")
    .optional(),
);

const optionalDateKeySchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .refine(
      isValidDateKey,
      "La date doit respecter le format YYYY-MM-DD.",
    )
    .optional(),
);

const optionalShortTextSchema = (maximum: number, message: string) =>
  z.preprocess(
    emptyStringToUndefined,
    z.string().trim().max(maximum, message).optional(),
  );

export const roadmapIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const roadmapItemParamsSchema = z.object({
  id: objectIdSchema,
  itemId: objectIdSchema,
});

const roadmapItemInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(
      3,
      "La ligne de feuille de route doit contenir au moins 3 caractères.",
    )
    .max(
      260,
      "La ligne de feuille de route est trop longue.",
    ),

  description: optionalShortTextSchema(
    1500,
    "La description de la ligne est trop longue.",
  ),

  kpiLabel: z
    .string()
    .trim()
    .min(2, "Chaque ligne doit indiquer le KPI attendu.")
    .max(220, "Le KPI attendu est trop long."),

  plannedPeriod: optionalShortTextSchema(
    160,
    "La période prévisionnelle est trop longue.",
  ),

  dueDate: optionalDateKeySchema,
});

const roadmapItemsInputSchema = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter(roadmapItemHasContent)
      : value,
  z
    .array(roadmapItemInputSchema)
    .min(1, "Ajoutez au moins une ligne de feuille de route.")
    .max(120, "La feuille de route contient trop de lignes."),
);

export const createRoadmapSchema = z.object({
  calendarYear: z.coerce
    .number()
    .int()
    .min(2020)
    .max(2200),

  title: z
    .string()
    .trim()
    .min(
      5,
      "L’intitulé de la feuille de route doit contenir au moins 5 caractères.",
    )
    .max(
      220,
      "L’intitulé de la feuille de route est trop long.",
    ),

  overview: optionalShortTextSchema(
    3000,
    "La présentation générale est trop longue.",
  ),

  items: roadmapItemsInputSchema,
});

export const updateRoadmapSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(
        5,
        "L’intitulé de la feuille de route doit contenir au moins 5 caractères.",
      )
      .max(
        220,
        "L’intitulé de la feuille de route est trop long.",
      )
      .optional(),

    overview: optionalShortTextSchema(
      3000,
      "La présentation générale est trop longue.",
    ),

    items: roadmapItemsInputSchema.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Au moins une donnée doit être modifiée.",
  );

export const listRoadmapsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),

  search: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().max(120).optional(),
  ),

  status: z.preprocess(
    emptyStringToUndefined,
    z.enum(roadmapStatuses).optional(),
  ),

  calendarYear: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(2020).max(2200).optional(),
  ),

  sort: z
    .enum([
      "UPDATED_DESC",
      "CREATED_DESC",
      "PROGRESS_ASC",
      "PROGRESS_DESC",
    ])
    .default("UPDATED_DESC"),
});

export const reviewRoadmapSchema = z.object({
  comment: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .max(1500, "Le commentaire de validation est trop long.")
      .optional(),
  ),
});

export const submitKpiSchema = z.object({
  kpiText: optionalTextSchema,
});

export const reviewItemKpiSchema = z.object({
  decision: z.enum(kpiReviewDecisions),

  comment: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .max(1500, "Le commentaire est trop long.")
      .optional(),
  ),
});

export const activityQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50),
});

export type CreateRoadmapInput = z.output<
  typeof createRoadmapSchema
>;

export type UpdateRoadmapInput = z.output<
  typeof updateRoadmapSchema
>;

export type ListRoadmapsQuery = z.output<
  typeof listRoadmapsQuerySchema
>;

export type ReviewRoadmapInput = z.output<
  typeof reviewRoadmapSchema
>;

export type SubmitKpiInput = z.output<
  typeof submitKpiSchema
>;

export type ReviewItemKpiInput = z.output<
  typeof reviewItemKpiSchema
>;
