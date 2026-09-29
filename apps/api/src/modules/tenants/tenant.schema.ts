import { z } from "zod";
import { normalizeTenantSlug } from "./tenant-registration.utils.js";

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "La couleur doit être au format hexadécimal.");

const slugSchema = z
  .string()
  .trim()
  .min(2, "Le slug est trop court.")
  .max(80, "Le slug est trop long.")
  .transform((value) => normalizeTenantSlug(value))
  .refine((value) => value.length >= 2, "Le slug est trop court.")
  .refine(
    (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
    "Le slug doit contenir uniquement des lettres minuscules, chiffres et tirets.",
  );

const passwordSchema = z
  .string()
  .min(12, "Le mot de passe doit contenir au moins 12 caractères.")
  .max(72, "Le mot de passe est trop long.")
  .refine((value) => /[a-z]/.test(value), "Ajoutez au moins une lettre minuscule.")
  .refine((value) => /[A-Z]/.test(value), "Ajoutez au moins une lettre majuscule.")
  .refine((value) => /\d/.test(value), "Ajoutez au moins un chiffre.")
  .refine(
    (value) => /[^A-Za-z0-9]/.test(value),
    "Ajoutez au moins un caractère spécial.",
  );

export const tenantSlugParamsSchema = z.object({
  slug: slugSchema,
});

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180),
  slug: slugSchema,
  contactEmail: z.string().trim().email().optional(),
  contactPhone: z.string().trim().min(5).max(40).optional(),
  address: z.string().trim().min(4).max(300).optional(),
  branding: z.object({
    primaryColor: colorSchema,
    secondaryColor: colorSchema,
    accentColor: colorSchema,
    logoUrl: z.string().trim().url().optional(),
  }),
});

export const tenantAvailabilityParamsSchema = z.object({
  slug: slugSchema,
});

export const selectTenantSchema = z.object({
  slug: slugSchema,
});

export const selfRegisterTenantSchema = z
  .object({
    organization: z.object({
      name: z.string().trim().min(2, "Le nom de l’organisation est obligatoire.").max(120),
      legalName: z.string().trim().min(2, "La dénomination légale est obligatoire.").max(180),
      slug: slugSchema,
      contactPhone: z.string().trim().min(5).max(40).optional().or(z.literal("")),
      address: z.string().trim().min(4).max(300).optional().or(z.literal("")),
    }),
    administrator: z.object({
      fullName: z.string().trim().min(2, "Le nom de l’administrateur est obligatoire.").max(160),
      email: z.string().trim().email("L’adresse e-mail est invalide.").max(180),
      password: passwordSchema,
      confirmPassword: z.string().min(1, "Veuillez confirmer le mot de passe."),
    }),
    branding: z
      .object({
        primaryColor: colorSchema.default("#046242"),
        secondaryColor: colorSchema.default("#0B2536"),
        accentColor: colorSchema.default("#E9B521"),
      })
      .optional(),
    termsAccepted: z.boolean().refine((value) => value, {
      message: "Vous devez accepter les conditions d’utilisation pour créer l’espace.",
    }),
    // Champ invisible anti-bot. Il doit rester vide.
    website: z.string().max(0).optional().default(""),
  })
  .superRefine((input, context) => {
    if (input.administrator.password !== input.administrator.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["administrator", "confirmPassword"],
        message: "Les deux mots de passe ne correspondent pas.",
      });
    }
  });

export type CreateTenantInput = z.output<typeof createTenantSchema>;
export type SelfRegisterTenantInput = z.output<typeof selfRegisterTenantSchema>;
