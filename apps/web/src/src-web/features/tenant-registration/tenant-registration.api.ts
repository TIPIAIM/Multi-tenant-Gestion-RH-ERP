import { api, setSelectedTenantSlug } from "../../lib/api";
import type {
  SelfRegisterTenantInput,
  SelfRegisterTenantResult,
  TenantSlugAvailability,
} from "./tenant-registration.types";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

export async function checkTenantSlugAvailability(
  slug: string,
): Promise<TenantSlugAvailability> {
  const response = await api.get<ApiSuccess<TenantSlugAvailability>>(
    `/tenants/availability/${encodeURIComponent(slug)}`,
  );

  return response.data.data;
}

export async function registerTenantFromInterface(
  input: SelfRegisterTenantInput,
): Promise<SelfRegisterTenantResult> {
  const response = await api.post<ApiSuccess<SelfRegisterTenantResult>>(
    "/tenants/register",
    input,
  );

  const result = response.data.data;

  /**
   * Le backend écrit déjà le cookie .
   * On mémorise aussi le slug côté frontend afin que le tout premier
   * POST /auth/login envoie explicitement x-tenant-slug, même si le
   * navigateur n'a pas encore réutilisé le cookie.
   */
  setSelectedTenantSlug(result.tenant.slug);

  return result;
}

export async function selectTenantWorkspace(slug: string): Promise<void> {
  /**
   * On mémorise immédiatement AVANT l'appel réseau.
   * Cela supprime la course entre TenantSelectionBootstrap et le clic
   * sur "Se connecter".
   */
  setSelectedTenantSlug(slug);

  await api.post(
    "/tenants/select",
    { slug },
    {
      headers: {
        "x-tenant-slug": slug,
      },
    },
  );
}
