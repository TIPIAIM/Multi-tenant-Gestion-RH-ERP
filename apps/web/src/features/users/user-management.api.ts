import { api } from "../../lib/api";
import type {
  CreateManagedUserInput,
  ManagedUser,
  ManagedUserActivity,
  ManagedUserListResponse,
  ManagedUserSession,
  ManagedUserStats,
  ResetManagedUserPasswordInput,
  UpdateManagedUserInput,
  UserAgentOption,
  UserManagementRole,
} from "./user-management.types";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

type UserListStatus = "ALL" | "ACTIVE" | "INACTIVE" | string;
type UserListLinked = "ALL" | "LINKED" | "UNLINKED" | string;

export type GetManagedUsersParams = {
  page?: number;
  limit?: number;
  search?: string;
  q?: string;
  role?: UserManagementRole | "ALL" | string;
  status?: UserListStatus;
  active?: "" | "true" | "false" | boolean;
  isActive?: boolean | "";
  linked?: UserListLinked;
  linkedOnly?: boolean;
  agentId?: string | null;
  sort?: "CREATED_DESC" | "CREATED_ASC" | "NAME_ASC" | "NAME_DESC" | "ROLE_ASC" | string;
};

function unwrap<T>(response: { data: ApiEnvelope<T> }): T {
  return response.data.data;
}

function buildUserListParams(params?: GetManagedUsersParams) {
  const query: Record<string, string | number | boolean> = {
    page: params?.page ?? 1,
    limit: params?.limit ?? 15,
  };

  const search = (params?.search ?? params?.q ?? "").trim();

  if (search) query.search = search;
  if (params?.role && params.role !== "ALL") query.role = params.role;

  if (typeof params?.isActive === "boolean") {
    query.isActive = String(params.isActive);
  } else if (typeof params?.active === "boolean") {
    query.isActive = String(params.active);
  } else if (params?.active === "true" || params?.active === "false") {
    query.active = params.active;
  } else if (params?.status && params.status !== "ALL") {
    query.status = params.status;
  }

  if (params?.linked && params.linked !== "ALL") query.linked = params.linked;
  if (params?.linkedOnly === true) query.linkedOnly = true;
  if (params?.agentId) query.agentId = params.agentId;
  if (params?.sort) query.sort = params.sort;

  return query;
}

export async function getManagedUserStats(): Promise<ManagedUserStats> {
  const data = unwrap(
    await api.get<ApiEnvelope<{ stats: ManagedUserStats }>>(
      "/admin-users/stats",
    ),
  );

  return data.stats;
}

export async function getManagedUsers(
  params: GetManagedUsersParams = {},
): Promise<ManagedUserListResponse> {
  return unwrap(
    await api.get<ApiEnvelope<ManagedUserListResponse>>(
      "/admin-users",
      {
        params: buildUserListParams(params),
      },
    ),
  );
}

export async function getManagedUserById(
  id: string,
): Promise<ManagedUser> {
  const data = unwrap(
    await api.get<ApiEnvelope<{ user: ManagedUser }>>(
      `/admin-users/${id}`,
    ),
  );

  return data.user;
}

export async function createManagedUser(
  input: CreateManagedUserInput,
): Promise<{
  user: ManagedUser;
  temporaryPassword?: string;
}> {
  return unwrap(
    await api.post<
      ApiEnvelope<{
        user: ManagedUser;
        temporaryPassword?: string;
      }>
    >("/admin-users", input),
  );
}

export async function updateManagedUser(
  id: string,
  input: UpdateManagedUserInput,
): Promise<ManagedUser> {
  const data = unwrap(
    await api.patch<ApiEnvelope<{ user: ManagedUser }>>(
      `/admin-users/${id}`,
      input,
    ),
  );

  return data.user;
}

export async function updateManagedUserStatus(
  id: string,
  input: { isActive: boolean } | boolean,
): Promise<ManagedUser> {
  const payload =
    typeof input === "boolean" ? { isActive: input } : input;

  const data = unwrap(
    await api.patch<ApiEnvelope<{ user: ManagedUser }>>(
      `/admin-users/${id}/status`,
      payload,
    ),
  );

  return data.user;
}

export async function toggleManagedUserStatus(
  idOrInput:
    | string
    | {
        id: string;
        isActive: boolean;
      },
  maybeIsActive?: boolean,
): Promise<ManagedUser> {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const isActive =
    typeof idOrInput === "string"
      ? Boolean(maybeIsActive)
      : idOrInput.isActive;

  return updateManagedUserStatus(id, { isActive });
}

export async function updateManagedUserEmailVerified(
  id: string,
  input: { emailVerified: boolean } = { emailVerified: true },
): Promise<ManagedUser> {
  const data = unwrap(
    await api.patch<ApiEnvelope<{ user: ManagedUser }>>(
      `/admin-users/${id}/email-verified`,
      input,
    ),
  );

  return data.user;
}

export async function verifyManagedUserEmail(
  id: string,
): Promise<ManagedUser> {
  const data = unwrap(
    await api.patch<ApiEnvelope<{ user: ManagedUser }>>(
      `/admin-users/${id}/verify-email`,
      {},
    ),
  );

  return data.user;
}

export async function forceVerifyManagedUserEmail(
  id: string,
): Promise<ManagedUser> {
  return verifyManagedUserEmail(id);
}

export async function resetManagedUserPassword(
  idOrInput:
    | string
    | {
        id: string;
        input?: ResetManagedUserPasswordInput;
        password?: string;
      },
  maybeInput?: ResetManagedUserPasswordInput,
): Promise<{
  user: ManagedUser;
  temporaryPassword: string;
}> {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const input =
    typeof idOrInput === "string"
      ? maybeInput
      : idOrInput.input ?? { password: idOrInput.password };

  return unwrap(
    await api.patch<
      ApiEnvelope<{
        user: ManagedUser;
        temporaryPassword: string;
      }>
    >(`/admin-users/${id}/reset-password`, input ?? {}),
  );
}

export async function getManagedUserSessions(
  id: string,
): Promise<ManagedUserSession[]> {
  const data = unwrap(
    await api.get<ApiEnvelope<{ sessions: ManagedUserSession[] }>>(
      `/admin-users/${id}/sessions`,
    ),
  );

  return data.sessions;
}

export async function forceLogoutManagedUserSessions(
  id: string,
): Promise<{ revokedCount: number }> {
  return unwrap(
    await api.delete<ApiEnvelope<{ revokedCount: number }>>(
      `/admin-users/${id}/sessions`,
    ),
  );
}

export async function revokeManagedUserSessions(
  id: string,
): Promise<{ revokedCount: number }> {
  return forceLogoutManagedUserSessions(id);
}

export async function forceLogoutManagedUser(
  id: string,
): Promise<{ revokedCount: number }> {
  return forceLogoutManagedUserSessions(id);
}

export async function getManagedUserActivity(
  id: string,
): Promise<ManagedUserActivity[]> {
  const data = unwrap(
    await api.get<ApiEnvelope<{ activities: ManagedUserActivity[] }>>(
      `/admin-users/${id}/activity`,
    ),
  );

  return data.activities;
}

export async function getManagedUserActivities(
  id: string,
): Promise<ManagedUserActivity[]> {
  return getManagedUserActivity(id);
}

/**
 * Liste complète des Agents actifs pour le formulaire Utilisateur.
 * Important : aucun filtre "onlyUnlinked" n'est envoyé.
 * Le même Agent RH reste donc visible et réutilisable sur plusieurs comptes.
 */
export async function getAgentOptionsForUserLink(): Promise<UserAgentOption[]> {
  const payload = unwrap(
    await api.get<
      ApiEnvelope<{
        items: UserAgentOption[];
      }>
    >("/admin-users/options/agents"),
  );

  return payload.items;
}
