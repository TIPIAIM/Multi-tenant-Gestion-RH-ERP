export const userManagementRoles = [
  "TENANT_ADMIN",
  "DIRECTION",
  "RH_MANAGER",
  "SERVICE_MANAGER",
  "AGENT",
] as const;

export type UserManagementRole =
  (typeof userManagementRoles)[number];

export type UserLinkedAgent = {
  id: string;
  fullName: string;
  matricule?: string;
  directionId?: string | null;
  serviceId?: string | null;
  directionName?: string | null;
  serviceName?: string | null;
  employmentStatus?: string;
};

export type ManagedUser = {
  id: string;
  tenantId: string;
  agentId?: string | null;
  linkedAgent?: UserLinkedAgent | null;
  fullName: string;
  email: string;
  role: UserManagementRole;
  isActive: boolean;
  mustChangePassword: boolean;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  activeSessionCount?: number;
};

export type ManagedUserStats = {
  total: number;
  active: number;
  inactive: number;
  linkedToAgent: number;
  unlinkedToAgent: number;
  byRole: Array<{
    role: UserManagementRole;
    count: number;
  }>;
};

export type ManagedUsersResponse = {
  items: ManagedUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ManagedUserListResponse = ManagedUsersResponse;

export type CreateManagedUserInput = {
  fullName: string;
  email: string;
  role: UserManagementRole;
  agentId?: string | null;
  password?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
};

export type UpdateManagedUserInput = Partial<
  Pick<
    CreateManagedUserInput,
    | "fullName"
    | "email"
    | "role"
    | "agentId"
    | "isActive"
    | "mustChangePassword"
  >
>;

export type ResetManagedUserPasswordInput = {
  password?: string;
  mustChangePassword?: boolean;
};

export type UserAgentOption = {
  id: string;
  fullName: string;
  matricule?: string;
  directionName?: string | null;
  serviceName?: string | null;
  employmentStatus?: string;
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

export type ManagedUserSession = PublicUserSession;

export type UserAdminActivity = {
  id: string;
  actorName: string;
  targetName: string;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type ManagedUserActivity = UserAdminActivity;
