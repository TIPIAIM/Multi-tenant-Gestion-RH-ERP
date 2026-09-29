import type { JwtPayload } from "jsonwebtoken";
import type { UserRole } from "../users/user.types.js";

export type AuthTokenType = "access" | "refresh";

export interface AuthTokenPayload extends JwtPayload {
  sub: string;
  tid: string;
  sid: string;
  role: UserRole;
  tokenType: AuthTokenType;
}

export type AuthContext = {
  userId: string;
  tenantId: string;
  sessionId: string;
  role: UserRole;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
