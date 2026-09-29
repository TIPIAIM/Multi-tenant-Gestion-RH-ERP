import { z } from "zod";
import {
  agentContractTypes,
  agentEmploymentStatuses,
  agentHistoryEventTypes,
} from "./agent.types.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-fA-F0-9]{24}$/,
    "L'identifiant MongoDB est invalide.",
  );

const nullableObjectIdSchema = objectIdSchema.nullable().optional();

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .or(z.literal(""));

const dateStringSchema = z
  .string()
  .trim()
  .refine(
    (value) => !Number.isNaN(new Date(value).getTime()),
    "La date est invalide.",
  );

const matriculeSchema = z
  .string()
  .trim()
  .min(2, "Le matricule est trop court.")
  .max(40, "Le matricule est trop long.")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Le matricule ne peut contenir que lettres, chiffres, tirets et underscores.",
  )
  .transform((value) => value.toUpperCase());

const phoneSchema = z
  .string()
  .trim()
  .min(5, "Le numéro de téléphone est trop court.")
  .max(40, "Le numéro de téléphone est trop long.");

const firstNameSchema = z
  .string()
  .trim()
  .min(2, "Le prénom est trop court.")
  .max(100, "Le prénom est trop long.");

const lastNameSchema = z
  .string()
  .trim()
  .min(2, "Le nom est trop court.")
  .max(100, "Le nom est trop long.");

const jobTitleSchema = z
  .string()
  .trim()
  .min(2, "Le poste est trop court.")
  .max(160, "Le poste est trop long.");

export const agentIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const createAgentSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  matricule: matriculeSchema,

  phone: phoneSchema,
  email: z.string().trim().email().max(180).optional().or(z.literal("")),
  address: optionalText(300),

  jobTitle: jobTitleSchema,
  grade: optionalText(100),
  category: optionalText(100),

  directionId: objectIdSchema,
  serviceId: nullableObjectIdSchema,
  supervisorAgentId: nullableObjectIdSchema,
  userId: nullableObjectIdSchema,

  employmentStatus: z
    .enum(agentEmploymentStatuses)
    .default("ACTIVE"),

  contractType: z
    .enum(agentContractTypes)
    .default("PERMANENT"),

  employmentStartDate: dateStringSchema,
  employmentEndDate: dateStringSchema.optional().or(z.literal("")),

  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});

export const updateAgentSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
    matricule: matriculeSchema.optional(),

    phone: phoneSchema.optional(),
    email: z.string().trim().email().max(180).optional().or(z.literal("")),
    address: optionalText(300),

    jobTitle: jobTitleSchema.optional(),
    grade: optionalText(100),
    category: optionalText(100),

    directionId: objectIdSchema.optional(),
    serviceId: nullableObjectIdSchema,
    supervisorAgentId: nullableObjectIdSchema,
    userId: nullableObjectIdSchema,

    employmentStatus: z.enum(agentEmploymentStatuses).optional(),
    contractType: z.enum(agentContractTypes).optional(),

    employmentStartDate: dateStringSchema.optional(),
    employmentEndDate: dateStringSchema.optional().or(z.literal("")),
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    "Au moins une donnée doit être modifiée.",
  );

export const addAgentHistorySchema = z.object({
  eventType: z.enum(agentHistoryEventTypes),

  eventDate: dateStringSchema,

  description: z
    .string()
    .trim()
    .min(3, "La description est trop courte.")
    .max(1000, "La description est trop longue."),

  note: optionalText(1500),
});

export const listAgentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  search: z.string().trim().max(100).optional(),

  employmentStatus: z.enum(agentEmploymentStatuses).optional(),

  directionId: objectIdSchema.optional(),

  serviceId: objectIdSchema.optional(),
});

export type CreateAgentInput = z.output<typeof createAgentSchema>;

export type UpdateAgentInput = z.output<typeof updateAgentSchema>;

export type AddAgentHistoryInput = z.output<
  typeof addAgentHistorySchema
>;

export type ListAgentsQuery = z.output<
  typeof listAgentsQuerySchema
>;