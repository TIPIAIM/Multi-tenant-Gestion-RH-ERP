import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { TenantModel } from "../modules/tenants/tenant.model.js";
import { UserModel } from "../modules/users/user.model.js";

function normalize(value?: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 72) {
    throw new Error("Le nouveau mot de passe doit contenir entre 12 et 72 caractères.");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Le nouveau mot de passe doit contenir une minuscule.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Le nouveau mot de passe doit contenir une majuscule.");
  }
  if (!/\d/.test(password)) {
    throw new Error("Le nouveau mot de passe doit contenir un chiffre.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Le nouveau mot de passe doit contenir un caractère spécial.");
  }
}

async function run(): Promise<void> {
  const slug = normalize(process.argv[2]);
  const email = normalize(process.argv[3]);
  const newPassword = process.env.TENANT_ADMIN_NEW_PASSWORD ?? "";
  const reactivate = process.env.TENANT_ADMIN_REACTIVATE === "true";

  if (!slug || !email) {
    throw new Error(
      "Usage : npx tsx src/scripts/repair-tenant-admin-password.ts <slug> <email>",
    );
  }

  validatePassword(newPassword);

  await connectDatabase();

  const tenant = await TenantModel.findOne({
    slug,
    status: "ACTIVE",
  }).exec();

  if (!tenant) {
    throw new Error(`Tenant actif introuvable : ${slug}`);
  }

  const user = await (UserModel as any)
    .findOne({
      tenantId: tenant._id,
      email,
    })
    .select("+passwordHash")
    .exec();

  if (!user) {
    throw new Error(
      `Aucun compte administrateur n'existe pour ${email} dans le tenant ${slug}.`,
    );
  }

  user.passwordHash = await bcrypt.hash(
    newPassword,
    env.passwordSaltRounds,
  );

  if (reactivate) {
    user.isActive = true;
  }

  user.mustChangePassword = false;

  await user.save();

  console.log(
    `Mot de passe réinitialisé pour ${user.email} dans ${tenant.slug}.`,
  );
  console.log(
    `Compte actif : ${String(user.isActive)} | Rôle : ${user.role}`,
  );
}

run()
  .catch((error) => {
    console.error("Réparation impossible :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
