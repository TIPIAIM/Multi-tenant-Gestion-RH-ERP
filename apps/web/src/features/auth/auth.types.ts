export type UserRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

export type AuthenticatedUser = {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
};