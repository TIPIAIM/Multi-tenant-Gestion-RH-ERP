import { z } from "zod";
import {
  organizationUnitStatuses,
  organizationUnitTypes,
} from "./organization.types.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-fA-F0-9]{24}$/,
    "L'identifiant MongoDB est invalide.",
  );

const unitCodeSchema = z
  .string()
  .trim()
  .min(2, "Le code est trop court.")
  .max(30, "Le code est trop long.")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Le code ne peut contenir que des lettres, chiffres, tirets et underscores.",
  )
  .transform((value) => value.toUpperCase());

const unitNameSchema = z
  .string()
  .trim()
  .min(2, "Le nom est trop court.")
  .max(140, "Le nom est trop long.");

export const organizationUnitIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const createOrganizationUnitSchema = z
  .object({
    name: unitNameSchema,
    code: unitCodeSchema,
    type: z.enum(organizationUnitTypes),

    parentId: objectIdSchema.nullable().optional(),

    managerUserId: objectIdSchema.nullable().optional(),

    description: z
      .string()
      .trim()
      .max(800, "La description est trop longue.")
      .optional(),

    status: z
      .enum(organizationUnitStatuses)
      .default("ACTIVE"),

    sortOrder: z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .default(0),
  })
  .superRefine((data, context) => {
    if (data.type === "DIRECTION" && data.parentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentId"],
        message:
          "Une Direction ne peut pas dépendre d'une autre structure.",
      });
    }

    if (data.type === "SERVICE" && !data.parentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentId"],
        message:
          "Un Service doit obligatoirement être rattaché à une Direction.",
      });
    }
  });

export const updateOrganizationUnitSchema = z
  .object({
    name: unitNameSchema.optional(),
    code: unitCodeSchema.optional(),

    managerUserId: objectIdSchema.nullable().optional(),

    description: z
      .string()
      .trim()
      .max(800, "La description est trop longue.")
      .optional(),

    status: z.enum(organizationUnitStatuses).optional(),

    sortOrder: z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "Au moins une donnée doit être modifiée.",
  );

export type CreateOrganizationUnitInput = z.output<
  typeof createOrganizationUnitSchema
>;

export type UpdateOrganizationUnitInput = z.output<
  typeof updateOrganizationUnitSchema
>;