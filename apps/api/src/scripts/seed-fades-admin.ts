import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { TenantModel } from "../modules/tenants/tenant.model.js";
import { seedFadesTenant } from "../modules/tenants/tenant.service.js";
import { UserModel } from "../modules/users/user.model.js";

async function run(): Promise<void> {
  try {
    if (
      !env.initialAdmin.fullName ||
      !env.initialAdmin.email ||
      !env.initialAdmin.password
    ) {
      throw new Error(
        "FADES_ADMIN_FULL_NAME, FADES_ADMIN_EMAIL et FADES_ADMIN_PASSWORD sont obligatoires dans apps/api/.env."
      );
    }

    if (env.initialAdmin.password.length < 12) {
      throw new Error(
        "FADES_ADMIN_PASSWORD doit contenir au moins 12 caractères."
      );
    }

    await connectDatabase();
    await seedFadesTenant();

    const tenant = await TenantModel.findOne({
      slug: env.defaultTenantSlug,
    }).exec();

    if (!tenant) {
      throw new Error("Le tenant FADES est introuvable.");
    }

    const email = env.initialAdmin.email.toLowerCase();

    const existingUser = await (UserModel as any).findOne({
      tenantId: tenant._id,
      email,
    }).exec();

    if (existingUser) {
      console.log(`Administrateur déjà existant : ${existingUser.email}`);
      return;
    }

    const passwordHash = await bcrypt.hash(
      env.initialAdmin.password,
      env.passwordSaltRounds
    );

    const admin = await UserModel.create({
      tenantId: tenant._id,
      fullName: env.initialAdmin.fullName,
      email,
      passwordHash,
      role: "TENANT_ADMIN",
      isActive: true,
      mustChangePassword: true,
    });


    if (!admin) {
      throw new Error("La création de l’administrateur FADES a échoué.");
    }

    console.log(`Administrateur FADES créé : ${admin.email}`);
  } catch (error) {
    console.error("Échec de création de l'administrateur FADES :", error);

    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void run();
