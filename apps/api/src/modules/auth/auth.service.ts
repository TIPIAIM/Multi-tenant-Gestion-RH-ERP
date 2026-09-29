import bcrypt from "bcryptjs";
import type { HydratedDocument } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import type { PublicUser, User } from "../users/user.types.js";
import { AuthSessionModel } from "./auth-session.model.js";
import type { ChangePasswordInput, LoginInput } from "./auth.schema.js";
import { issueAuthTokens, verifyRefreshToken } from "./auth.tokens.js";
import type { AuthTokens } from "./auth.types.js";

type UserDocument = HydratedDocument<User> & {
  id: string;
  passwordHash: string;
};

type AuthResult = {
  user: PublicUser;
  tokens: AuthTokens;
};

function serializeUser(user: UserDocument): PublicUser {
  return {
    id: user.id,
    tenantId: user.tenantId.toString(),
    agentId: user.agentId?.toString() ?? null,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}

async function createSessionForUser(input: {
  user: UserDocument;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AuthResult> {
  const now = new Date();

  const session = await AuthSessionModel.create({
    tenantId: input.user.tenantId,
    userId: input.user._id,
    refreshTokenHash: "pending",
    expiresAt: new Date(Date.now() + env.jwtRefreshCookieMaxAgeMs),
    lastUsedAt: now,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  const tokens = issueAuthTokens({
    userId: input.user.id,
    tenantId: input.user.tenantId.toString(),
    sessionId: session.id,
    role: input.user.role,
  });

  session.refreshTokenHash = await bcrypt.hash(
    tokens.refreshToken,
    env.passwordSaltRounds,
  );

  await session.save();

  input.user.lastLoginAt = now;
  await input.user.save();

  return {
    user: serializeUser(input.user),
    tokens,
  };
}

export async function loginUser(input: {
  tenant: TenantDocument;
  credentials: LoginInput;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AuthResult> {
  const email = input.credentials.email.trim().toLowerCase();

  const user = (await (UserModel as any)
    .findOne({
      tenantId: input.tenant._id,
      email,
    })
    .select("+passwordHash")
    .exec()) as UserDocument | null;

  if (!user || !user.isActive || !user.passwordHash) {
    throw new AppError(
      "Identifiants incorrects ou compte inactif.",
      401,
      "AUTH_LOGIN_FAILED",
    );
  }

  const passwordMatches = await bcrypt.compare(
    input.credentials.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new AppError(
      "Identifiants incorrects ou compte inactif.",
      401,
      "AUTH_LOGIN_FAILED",
    );
  }

  return createSessionForUser({
    user,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export async function refreshUserSession(input: {
  tenant: TenantDocument;
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AuthResult> {
  const payload = verifyRefreshToken(input.refreshToken);

  if (payload.tid !== input.tenant.id) {
    throw new AppError(
      "Cette session n'appartient pas à cette organisation.",
      401,
      "AUTH_TENANT_MISMATCH",
    );
  }

  const session = await AuthSessionModel.findOne({
    _id: payload.sid,
    tenantId: input.tenant._id,
    userId: payload.sub,
  })
    .select("+refreshTokenHash")
    .exec();

  if (!session || session.expiresAt.getTime() < Date.now()) {
    throw new AppError(
      "Votre session a expiré. Veuillez vous reconnecter.",
      401,
      "AUTH_SESSION_EXPIRED",
    );
  }

  const tokenMatches = await bcrypt.compare(
    input.refreshToken,
    session.refreshTokenHash,
  );

  if (!tokenMatches) {
    await AuthSessionModel.deleteOne({ _id: session._id }).exec();

    throw new AppError(
      "Votre session a été invalidée.",
      401,
      "AUTH_SESSION_INVALIDATED",
    );
  }

  const user = (await (UserModel as any)
    .findOne({
      _id: payload.sub,
      tenantId: input.tenant._id,
      isActive: true,
    })
    .exec()) as UserDocument | null;

  if (!user) {
    await AuthSessionModel.deleteOne({ _id: session._id }).exec();

    throw new AppError(
      "Votre compte n'est plus actif.",
      401,
      "AUTH_ACCOUNT_INACTIVE",
    );
  }

  const tokens = issueAuthTokens({
    userId: user.id,
    tenantId: user.tenantId.toString(),
    sessionId: session.id,
    role: user.role,
  });

  session.refreshTokenHash = await bcrypt.hash(
    tokens.refreshToken,
    env.passwordSaltRounds,
  );
  session.lastUsedAt = new Date();
  session.expiresAt = new Date(Date.now() + env.jwtRefreshCookieMaxAgeMs);
  session.ipAddress = input.ipAddress;
  session.userAgent = input.userAgent;
  await session.save();

  return {
    user: serializeUser(user),
    tokens,
  };
}

export async function getAuthenticatedUser(input: {
  tenant: TenantDocument;
  userId: string;
}): Promise<PublicUser> {
  const user = (await (UserModel as any)
    .findOne({
      _id: input.userId,
      tenantId: input.tenant._id,
      isActive: true,
    })
    .exec()) as UserDocument | null;

  if (!user) {
    throw new AppError(
      "Utilisateur introuvable ou inactif.",
      401,
      "AUTH_USER_NOT_FOUND",
    );
  }

  return serializeUser(user);
}

export async function changeOwnPassword(input: {
  tenant: TenantDocument;
  userId: string;
  data: ChangePasswordInput;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AuthResult> {
  const user = (await (UserModel as any)
    .findOne({
      _id: input.userId,
      tenantId: input.tenant._id,
      isActive: true,
    })
    .select("+passwordHash")
    .exec()) as UserDocument | null;

  if (!user || !user.passwordHash) {
    throw new AppError(
      "Utilisateur introuvable ou inactif.",
      401,
      "AUTH_USER_NOT_FOUND",
    );
  }

  const currentPasswordMatches = await bcrypt.compare(
    input.data.currentPassword,
    user.passwordHash,
  );

  if (!currentPasswordMatches) {
    throw new AppError(
      "Le mot de passe actuel est incorrect.",
      400,
      "AUTH_CURRENT_PASSWORD_INVALID",
    );
  }

  const passwordReused = await bcrypt.compare(
    input.data.newPassword,
    user.passwordHash,
  );

  if (passwordReused) {
    throw new AppError(
      "Le nouveau mot de passe doit être différent de l'ancien.",
      400,
      "AUTH_PASSWORD_REUSED",
    );
  }

  user.passwordHash = await bcrypt.hash(
    input.data.newPassword,
    env.passwordSaltRounds,
  );
  user.mustChangePassword = false;
  await user.save();

  await AuthSessionModel.deleteMany({
    tenantId: input.tenant._id,
    userId: user._id,
  }).exec();

  return createSessionForUser({
    user,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export async function logoutUserSession(input: {
  tenant: TenantDocument;
  refreshToken?: string;
}): Promise<void> {
  if (!input.refreshToken) return;

  try {
    const payload = verifyRefreshToken(input.refreshToken);

    if (payload.tid !== input.tenant.id) return;

    await AuthSessionModel.deleteOne({
      _id: payload.sid,
      tenantId: input.tenant._id,
      userId: payload.sub,
    }).exec();
  } catch {
    // Les cookies sont supprimés par le contrôleur même si le token est invalide.
  }
}
