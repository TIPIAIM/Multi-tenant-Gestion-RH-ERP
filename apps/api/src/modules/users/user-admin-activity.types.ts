import type { Types } from "mongoose";

export const userAdminActivityActions = [
  "USER_CREATED",
  "USER_UPDATED",
  "USER_STATUS_CHANGED",
  "USER_EMAIL_VERIFIED",
  "USER_PASSWORD_RESET",
  "USER_SESSIONS_REVOKED",
  "USER_AGENT_LINKED",
  "USER_AGENT_UNLINKED",
] as const;

export type UserAdminActivityAction =
  (typeof userAdminActivityActions)[number];

export interface UserAdminActivity {
  tenantId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  actorName: string;
  targetUserId: Types.ObjectId;
  targetName: string;
  action: UserAdminActivityAction;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PublicUserAdminActivity = {
  id: string;
  actorName: string;
  targetName: string;
  action: UserAdminActivityAction;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};
