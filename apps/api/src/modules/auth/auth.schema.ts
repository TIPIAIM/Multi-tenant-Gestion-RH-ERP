import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("L'adresse email est invalide.")
  .max(180);

const passwordSchema = z
  .string()
  .min(12, "Le mot de passe doit contenir au moins 12 caractères.")
  .max(128, "Le mot de passe est trop long.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Le mot de passe est obligatoire."),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<
  typeof changePasswordSchema
>;