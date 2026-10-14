import { z } from "zod";
import {
  pieceTransferAudienceModes,
  pieceTransferStatuses,
} from "./piece-transfer.types.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-fA-F0-9]{24}$/,
    "L'identifiant MongoDB est invalide.",
  );

function parseRecipientIds(
  value: unknown,
): unknown {
  if (
    Array.isArray(value)
  ) {
    return value;
  }

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(value);

    return Array.isArray(
      parsed,
    )
      ? parsed
      : [];
  } catch {
    return value
      .split(",")
      .map(
        (item) =>
          item.trim(),
      )
      .filter(Boolean);
  }
}

export const createPieceTransferSchema =
  z
    .object({
      title: z.string().trim().max(180, "L’objet est trop long.")
        .optional().default(""),

      description: z
        .string()
        .trim()
        .max(
          2000,
          "La description est trop longue.",
        )
        .optional()
        .or(
          z.literal(""),
        ),

      audienceMode: z.enum(
        pieceTransferAudienceModes,
      ),

      recipientUserIds: z.preprocess(
        parseRecipientIds,
        z
          .array(
            objectIdSchema,
          )
          .max(
            500,
            "Maximum 500 destinataires ciblés.",
          ),
      ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if ((value.audienceMode === "ALL" || new Set(value.recipientUserIds).size > 1) && !value.title.trim()) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["title"], message: "Donnez un nom au groupe." });
        }
        if (
          value.audienceMode ===
            "SELECTED" &&
          value.recipientUserIds
            .length === 0
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,
            path: [
              "recipientUserIds",
            ],
            message:
              "Sélectionnez au moins un destinataire.",
          });
        }
      },
    );

export const createPieceTransferMessageSchema =
  z.object({
    mentionUserIds: z.preprocess(parseRecipientIds, z.array(objectIdSchema).max(500)).optional(),
    replyToMessageId: objectIdSchema.optional(),
    forwardMessageId: objectIdSchema.optional(),
    forwardTransferId: objectIdSchema.optional(),
    body: z
      .string()
      .trim()
      .max(
        4000,
        "Le message est trop long.",
      )
      .optional()
      .or(
        z.literal(""),
      ),
  });

export const updatePieceTransferMessageSchema =
  z.object({
    body: z
      .string()
      .trim()
      .max(
        4000,
        "Le message est trop long.",
      ),
  });

export const listPieceTransfersQuerySchema =
  z.object({
    search: z
      .string()
      .trim()
      .max(120)
      .optional(),

    status: z
      .enum(
        pieceTransferStatuses,
      )
      .optional(),

    unreadOnly: z
      .union([
        z.literal("true"),
        z.literal("false"),
      ])
      .optional()
      .transform(
        (value) =>
          value ===
          "true",
      ),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
  });

export const listPieceTransferMessagesQuerySchema =
  z.object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(100),
  });

export const recipientOptionsQuerySchema =
  z.object({
    search: z
      .string()
      .trim()
      .max(120)
      .optional(),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50),
  });

export const pieceTransferIdParamsSchema =
  z.object({
    id:
      objectIdSchema,
  });

export const pieceTransferMessageParamsSchema =
  z.object({
    id:
      objectIdSchema,
    messageId:
      objectIdSchema,
  });

const messageFileIndexSchema =
  z.coerce
    .number()
    .int()
    .min(0)
    .max(6);

export const pieceTransferMessageFileParamsSchema =
  z.object({
    id:
      objectIdSchema,
    messageId:
      objectIdSchema,
    fileIndex:
      messageFileIndexSchema,
  });

export const adminMessageParamsSchema =
  z.object({
    messageId:
      objectIdSchema,
  });

export const adminMessageFileParamsSchema =
  z.object({
    messageId:
      objectIdSchema,
    fileIndex:
      messageFileIndexSchema,
  });

export type CreatePieceTransferInput =
  z.output<
    typeof createPieceTransferSchema
  >;

export type CreatePieceTransferMessageInput =
  z.output<
    typeof createPieceTransferMessageSchema
  >;

export type UpdatePieceTransferMessageInput =
  z.output<
    typeof updatePieceTransferMessageSchema
  >;

export type ListPieceTransfersQuery =
  z.output<
    typeof listPieceTransfersQuerySchema
  >;

export type ListPieceTransferMessagesQuery =
  z.output<
    typeof listPieceTransferMessagesQuerySchema
  >;

export type RecipientOptionsQuery =
  z.output<
    typeof recipientOptionsQuerySchema
  >;

export const markPieceTransferReadSchema = z.object({ messageId: objectIdSchema.optional() });

export const pieceTransferReactionSchema = z.object({
  emoji: z.enum(["👍", "❤️", "😂", "🙏", "💪", "👋", "👏", "✅"]).nullable(),
});
export const forwardToAgentsSchema = z.object({
  groupName: z.string().trim().max(180, "Le nom est trop long.").optional(),
  mode: z.enum(["INDIVIDUAL", "COMMON"]).default("INDIVIDUAL"),
  recipientUserIds: z.array(objectIdSchema).min(1, "Choisissez un agent.").max(500),
});
