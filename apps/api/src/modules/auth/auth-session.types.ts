import type {
    HydratedDocument,
    Types,
  } from "mongoose";
  
  export interface AuthSession {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    refreshTokenHash: string;
    expiresAt: Date;
    lastUsedAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }
  
  export type AuthSessionDocument =
    HydratedDocument<AuthSession>;