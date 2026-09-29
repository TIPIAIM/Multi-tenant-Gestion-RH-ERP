import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { TenantModel } from "../modules/tenants/tenant.model.js";
import { UserModel } from "../modules/users/user.model.js";

function normalize(value?: string): string {
  return String(value ?? "").trim().toLowerCase();
}

async function run(): Promise<void> {
  const slug = normalize(process.argv[2]);
  const email = normalize(process.argv[3]);

  if (!slug || !email) {
    throw new Error(
      "Usage : npx tsx src/scripts/diagnose-tenant-admin.ts <slug> <email>",
    );
  }

  await connectDatabase();

  const tenant = await TenantModel.findOne({ slug }).exec();

  if (!tenant) {
    console.log(JSON.stringify({
      ok: false,
      stage: "TENANT",
      reason: "TENANT_NOT_FOUND",
      slug,
    }, null, 2));
    return;
  }

  const user = await (UserModel as any)
    .findOne({
      tenantId: tenant._id,
      email,
    })
    .select("+passwordHash")
    .exec();

  if (!user) {
    console.log(JSON.stringify({
      ok: false,
      stage: "USER",
      reason: "TENANT_ADMIN_NOT_FOUND",
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        status: tenant.status,
      },
      email,
    }, null, 2));
    return;
  }

  const passwordHash = String(user.passwordHash ?? "");

  console.log(JSON.stringify({
    ok: true,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
    },
    administrator: {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: Boolean(user.isActive),
      mustChangePassword: Boolean(user.mustChangePassword),
      passwordHashPresent: passwordHash.length > 0,
      passwordHashLooksLikeBcrypt: /^\$2[aby]\$\d{2}\$/.test(passwordHash),
    },
  }, null, 2));
}

run()
  .catch((error) => {
    console.error("Diagnostic impossible :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
