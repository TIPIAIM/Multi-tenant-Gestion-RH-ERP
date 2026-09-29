import type { Types } from "mongoose";

export const userRoles = [
  "TENANT_ADMIN",
  "DIRECTION",
  "RH_MANAGER",
  "SERVICE_MANAGER",
  "AGENT",
] as const;

export type UserRole = (typeof userRoles)[number];

export interface User {
  tenantId: Types.ObjectId;

  /**
   * Liaison souple entre un compte utilisateur et un Agent RH.
   * Ce champ n'est volontairement PAS unique : le même Agent peut être
   * affecté à plusieurs comptes utilisateurs lorsque l'organisation en a besoin.
   */
  agentId?: Types.ObjectId | null;

  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  emailVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PublicLinkedAgent = {
  id: string;
  fullName: string;
  matricule?: string;
  directionId?: string | null;
  serviceId?: string | null;
  directionName?: string | null;
  serviceName?: string | null;
  employmentStatus?: string;
};

export type PublicUser = {
  id: string;
  tenantId: string;
  agentId?: string | null;
  linkedAgent?: PublicLinkedAgent | null;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicManagedUser = PublicUser & {
  activeSessionCount?: number;
};

export type PublicUserSession = {
  id: string;
  createdAt?: string;
  lastUsedAt?: string;
  expiresAt?: string;
  ip?: string;
  userAgent?: string;
  isRevoked?: boolean;
};
