import { z } from "zod";
import { userRoles } from "./user.types.js";

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Identifiant MongoDB invalide.");

export const optionalObjectIdSchema = z
  .union([objectIdSchema, z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (!value) return null;
    return value;
  });

export const userIdParamsSchema = z.object({
  id: objectIdSchema,
});

const emailSchema = z
  .string()
  .trim()
  .email("Adresse email invalide.")
  .max(180, "L'adresse email est trop longue.")
  .transform((value) => value.toLowerCase());

const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Le nom complet doit contenir au moins 2 caractères.")
  .max(160, "Le nom complet est trop long.");

export const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  role: z.enum(userRoles),

  /**
   * Agent lié facultatif et réutilisable.
   * Le même Agent peut être affecté à plusieurs comptes utilisateurs.
   */
  agentId: optionalObjectIdSchema,

  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
    .max(120, "Le mot de passe est trop long.")
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined),

  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

export const updateUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    email: emailSchema.optional(),
    role: z.enum(userRoles).optional(),
    agentId: optionalObjectIdSchema.optional(),
    isActive: z.boolean().optional(),
    mustChangePassword: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Au moins une donnée doit être modifiée.",
  );

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  search: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),

  role: z
    .union([z.enum(userRoles), z.literal("ALL"), z.literal("")])
    .optional()
    .transform((value) => {
      if (!value || value === "ALL") return undefined;
      return value;
    }),

  status: z
    .enum(["ALL", "ACTIVE", "INACTIVE"])
    .optional()
    .default("ALL"),

  active: z
    .union([z.literal("true"), z.literal("false"), z.literal("")])
    .optional(),

  isActive: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),

  linked: z
    .enum(["ALL", "LINKED", "UNLINKED"])
    .optional()
    .default("ALL"),

  linkedOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),

  agentId: optionalObjectIdSchema.optional(),

  sort: z
    .enum([
      "CREATED_DESC",
      "CREATED_ASC",
      "NAME_ASC",
      "NAME_DESC",
      "ROLE_ASC",
    ])
    .default("CREATED_DESC"),
});

export const statusSchema = z.object({
  isActive: z.boolean(),
});

export const emailVerificationSchema = z.object({
  emailVerified: z.boolean().optional().default(true),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
    .max(120, "Le mot de passe est trop long.")
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined),

  mustChangePassword: z.boolean().optional().default(true),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
export type StatusInput = z.output<typeof statusSchema>;
export type EmailVerificationInput = z.output<typeof emailVerificationSchema>;
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;
