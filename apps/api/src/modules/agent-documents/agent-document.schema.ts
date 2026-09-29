import { z } from "zod";
import {
  agentDocumentCategories,
} from "../agents/agent.types.js";
import {
  agentDocumentExpiryFilters,
  agentDocumentStatuses,
} from "./agent-document.types.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-fA-F0-9]{24}$/,
    "L'identifiant MongoDB est invalide.",
  );

const dateStringSchema = z
  .string()
  .trim()
  .refine(
    (value) => !Number.isNaN(new Date(value).getTime()),
    "La date est invalide.",
  );

export const agentDocumentParamsSchema = z.object({
  id: objectIdSchema,
  documentId: objectIdSchema,
});

export const agentIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const agentDocumentUploadMetadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Le titre est trop court.")
    .max(180, "Le titre est trop long."),

  category: z.enum(agentDocumentCategories),

  expiresAt: dateStringSchema.optional().or(z.literal("")),
});

export const listAgentDocumentsQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, "La recherche est trop longue.")
    .optional(),

  category: z.enum(agentDocumentCategories).optional(),

  status: z
    .enum(agentDocumentStatuses)
    .default("ACTIVE"),

  expiry: z
    .enum(agentDocumentExpiryFilters)
    .default("ALL"),
});

export type AgentDocumentUploadMetadata = z.output<
  typeof agentDocumentUploadMetadataSchema
>;

export type ListAgentDocumentsQuery = z.output<
  typeof listAgentDocumentsQuerySchema
>;