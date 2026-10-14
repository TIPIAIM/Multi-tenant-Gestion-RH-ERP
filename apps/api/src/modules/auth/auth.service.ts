import bcrypt from "bcryptjs";
import type { HydratedDocument } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { TenantModel } from "../tenants/tenant.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import type { PublicUser, User } from "../users/user.types.js";
import { AuthSessionModel } from "./auth-session.model.js";
import type { ChangePasswordInput, LoginInput } from "./auth.schema.js";
import { issueAuthTokens, verifyRefreshToken } from "./auth.tokens.js";
import type { AuthTokens } from "./auth.types.js";

type UserDocument = HydratedDocument<User> & { id: string; passwordHash: string };
type AuthResult = { user: PublicUser; tokens: AuthTokens };

function serializeUser(user: UserDocument): PublicUser {
  return {
    id: user.id, tenantId: user.tenantId.toString(),
    agentId: user.agentId?.toString() ?? null,
    fullName: user.fullName, email: user.email, role: user.role,
    isActive: user.isActive, mustChangePassword: user.mustChangePassword,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt?.toISOString(), updatedAt: user.updatedAt?.toISOString(),
  };
}

async function createSessionForUser(input: {
  user: UserDocument; ipAddress?: string; userAgent?: string;
}): Promise<AuthResult> {
  const now = new Date();
  const session = await AuthSessionModel.create({
    tenantId: input.user.tenantId, userId: input.user._id,
    refreshTokenHash: "pending",
    expiresAt: new Date(Date.now() + env.jwtRefreshCookieMaxAgeMs),
    lastUsedAt: now, ipAddress: input.ipAddress, userAgent: input.userAgent,
  });
  const tokens = issueAuthTokens({
    userId: input.user.id, tenantId: input.user.tenantId.toString(),
    sessionId: session.id, role: input.user.role,
  });
  session.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, env.passwordSaltRounds);
  await session.save();
  input.user.lastLoginAt = now;
  await input.user.save();
  return { user: serializeUser(input.user), tokens };
}

function invalidCredentials(): AppError {
  return new AppError("Identifiants incorrects ou compte indisponible.", 401, "AUTH_LOGIN_FAILED");
}

export async function loginUser(input: {
  tenant: TenantDocument; credentials: LoginInput; ipAddress?: string; userAgent?: string;
}): Promise<AuthResult> {
  const email = input.credentials.email.trim().toLowerCase();
  const user = await (UserModel as any).findOne({ tenantId: input.tenant._id, email })
    .select("+passwordHash").exec() as UserDocument | null;
  if (!user || !user.isActive || !user.passwordHash) throw invalidCredentials();
  if (!await bcrypt.compare(input.credentials.password, user.passwordHash)) throw invalidCredentials();
  return createSessionForUser({ user, ipAddress: input.ipAddress, userAgent: input.userAgent });
}

/** Le cookie de sélection et le tenant par défaut ne décident jamais du login. */
export async function loginUserFromCredentials(input: {
  credentials: LoginInput; tenantSlug?: string; ipAddress?: string; userAgent?: string;
}): Promise<AuthResult & { tenant: { id: string; slug: string } }> {
  const email = input.credentials.email.trim().toLowerCase();
  const slug = input.tenantSlug?.trim().toLowerCase();
  if (slug) {
    const tenant = await (TenantModel as any).findOne({ slug, status: "ACTIVE" })
      .exec() as TenantDocument | null;
    if (!tenant) throw invalidCredentials();
    const result = await loginUser({
      tenant, credentials: input.credentials,
      ipAddress: input.ipAddress, userAgent: input.userAgent,
    });
    return { ...result, tenant: { id: tenant.id, slug: tenant.slug } };
  }
  const candidates = await (UserModel as any).find({ email, isActive: true })
    .select("+passwordHash").exec() as UserDocument[];
  const matches = new Map<string, { tenant: TenantDocument; user: UserDocument }>();
  for (const user of candidates) {
    if (!user.passwordHash || !await bcrypt.compare(input.credentials.password, user.passwordHash)) continue;
    const tenant = await (TenantModel as any).findOne({ _id: user.tenantId, status: "ACTIVE" })
      .exec() as TenantDocument | null;
    if (tenant) matches.set(tenant.id, { tenant, user });
  }
  if (!matches.size) throw invalidCredentials();
  if (matches.size > 1) {
    throw new AppError(
      "Ces identifiants correspondent à plusieurs organisations. Utilisez le lien de votre organisation (/login?tenant=son-slug).",
      409, "AUTH_TENANT_SELECTION_REQUIRED",
    );
  }
  const match = matches.values().next().value;
  if (!match) throw invalidCredentials();
  const result = await createSessionForUser({
    user: match.user, ipAddress: input.ipAddress, userAgent: input.userAgent,
  });
  return { ...result, tenant: { id: match.tenant.id, slug: match.tenant.slug } };
}

export async function refreshUserSession(input: {
  tenant: TenantDocument; refreshToken: string; ipAddress?: string; userAgent?: string;
}): Promise<AuthResult> {
  const payload = verifyRefreshToken(input.refreshToken);
  if (payload.tid !== input.tenant.id) {
    throw new AppError("Cette session n'appartient pas à cette organisation.", 401, "AUTH_TENANT_MISMATCH");
  }
  const session = await AuthSessionModel.findOne({
    _id: payload.sid, tenantId: input.tenant._id, userId: payload.sub,
  }).select("+refreshTokenHash").exec();
  if (!session || session.expiresAt.getTime() < Date.now()) {
    throw new AppError("Votre session a expiré. Veuillez vous reconnecter.", 401, "AUTH_SESSION_EXPIRED");
  }
  if (!await bcrypt.compare(input.refreshToken, session.refreshTokenHash)) {
    await AuthSessionModel.deleteOne({ _id: session._id }).exec();
    throw new AppError("Votre session a été invalidée.", 401, "AUTH_SESSION_INVALIDATED");
  }
  const user = await (UserModel as any).findOne({
    _id: payload.sub, tenantId: input.tenant._id, isActive: true,
  }).exec() as UserDocument | null;
  if (!user) {
    await AuthSessionModel.deleteOne({ _id: session._id }).exec();
    throw new AppError("Votre compte n'est plus actif.", 401, "AUTH_ACCOUNT_INACTIVE");
  }
  const tokens = issueAuthTokens({
    userId: user.id, tenantId: user.tenantId.toString(), sessionId: session.id, role: user.role,
  });
  session.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, env.passwordSaltRounds);
  session.lastUsedAt = new Date();
  session.expiresAt = new Date(Date.now() + env.jwtRefreshCookieMaxAgeMs);
  session.ipAddress = input.ipAddress;
  session.userAgent = input.userAgent;
  await session.save();
  return { user: serializeUser(user), tokens };
}

export async function getAuthenticatedUser(input: {
  tenant: TenantDocument; userId: string;
}): Promise<PublicUser> {
  const user = await (UserModel as any).findOne({
    _id: input.userId, tenantId: input.tenant._id, isActive: true,
  }).exec() as UserDocument | null;
  if (!user) throw new AppError("Utilisateur introuvable ou inactif.", 401, "AUTH_USER_NOT_FOUND");
  return serializeUser(user);
}

export async function changeOwnPassword(input: {
  tenant: TenantDocument; userId: string; data: ChangePasswordInput;
  ipAddress?: string; userAgent?: string;
}): Promise<AuthResult> {
  const user = await (UserModel as any).findOne({
    _id: input.userId, tenantId: input.tenant._id, isActive: true,
  }).select("+passwordHash").exec() as UserDocument | null;
  if (!user || !user.passwordHash) throw new AppError("Utilisateur introuvable ou inactif.", 401, "AUTH_USER_NOT_FOUND");
  if (!await bcrypt.compare(input.data.currentPassword, user.passwordHash)) {
    throw new AppError("Le mot de passe actuel est incorrect.", 400, "AUTH_CURRENT_PASSWORD_INVALID");
  }
  if (await bcrypt.compare(input.data.newPassword, user.passwordHash)) {
    throw new AppError("Le nouveau mot de passe doit être différent de l'ancien.", 400, "AUTH_PASSWORD_REUSED");
  }
  user.passwordHash = await bcrypt.hash(input.data.newPassword, env.passwordSaltRounds);
  user.mustChangePassword = false;
  await user.save();
  await AuthSessionModel.deleteMany({ tenantId: input.tenant._id, userId: user._id }).exec();
  return createSessionForUser({ user, ipAddress: input.ipAddress, userAgent: input.userAgent });
}

export async function logoutUserSession(input: {
  tenant: TenantDocument; refreshToken?: string;
}): Promise<void> {
  if (!input.refreshToken) return;
  try {
    const payload = verifyRefreshToken(input.refreshToken);
    if (payload.tid !== input.tenant.id) return;
    await AuthSessionModel.deleteOne({
      _id: payload.sid, tenantId: input.tenant._id, userId: payload.sub,
    }).exec();
  } catch {
    // Le contrôleur efface les cookies même lorsque le token est invalide.
  }
}
