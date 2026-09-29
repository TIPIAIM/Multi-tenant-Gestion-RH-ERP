import axios from "axios";
import {
  api,
  getSelectedTenantSlug,
} from "../../lib/api";

export type AuthenticatedUser = {
  id: string;
  tenantId: string;
  agentId?: string | null;
  fullName: string;
  email: string;
  role:
    | "TENANT_ADMIN"
    | "DIRECTION"
    | "RH_MANAGER"
    | "SERVICE_MANAGER"
    | "AGENT";
  isActive: boolean;
  mustChangePassword: boolean;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type SessionRestorePayload = {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  tenant: {
    id: string;
    slug: string;
  } | null;
};

export async function loginRequest(
  input: LoginInput,
): Promise<AuthenticatedUser> {
  const tenantSlug = getSelectedTenantSlug();

  const response = await api.post<
    ApiSuccess<{ user: AuthenticatedUser }>
  >(
    "/auth/login",
    {
      email: input.email.trim().toLowerCase(),
      // Ne jamais trim() le mot de passe : sa valeur doit rester exacte.
      password: input.password,
    },
    tenantSlug
      ? {
          headers: {
            "x-tenant-slug": tenantSlug,
          },
        }
      : undefined,
  );

  return response.data.data.user;
}

/**
 * Nouveau bootstrap silencieux : 200 même lorsqu'aucune session n'existe.
 */
export async function restoreSessionRequest(): Promise<AuthenticatedUser | null> {
  const response = await api.get<ApiSuccess<SessionRestorePayload>>(
    "/auth/session",
  );

  return response.data.data.user;
}

/** Conservé pour compatibilité avec le reste du projet. */
export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const response = await api.get<
    ApiSuccess<{ user: AuthenticatedUser }>
  >("/auth/me");

  return response.data.data.user;
}

/** Conservé pour compatibilité avec le reste du projet. */
export async function refreshSession(): Promise<AuthenticatedUser> {
  const response = await api.post<
    ApiSuccess<{ user: AuthenticatedUser }>
  >("/auth/refresh");

  return response.data.data.user;
}

export async function logoutRequest(): Promise<void> {
  await api.post("/auth/logout");
}

export async function changePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<AuthenticatedUser> {
  const response = await api.post<
    ApiSuccess<{ user: AuthenticatedUser }>
  >("/auth/change-password", input);

  return response.data.data.user;
}

export function isUnauthorizedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | {
          message?: string;
          error?: string | { message?: string; code?: string };
        }
      | undefined;

    if (typeof data?.error === "object" && data.error?.message) {
      return data.error.message;
    }

    if (typeof data?.error === "string" && data.error.trim()) {
      return data.error;
    }

    if (data?.message) return data.message;

    if (error.code === "ECONNABORTED") {
      return "Le serveur met trop de temps à répondre.";
    }

    if (!error.response) {
      return "Impossible de joindre le serveur RH.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Une erreur est survenue.";
}
