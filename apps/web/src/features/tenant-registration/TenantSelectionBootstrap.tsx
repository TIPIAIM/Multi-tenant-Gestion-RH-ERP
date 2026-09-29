import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { setSelectedTenantSlug } from "../../lib/api";
import { selectTenantWorkspace } from "./tenant-registration.api";

/**
 * À monter dans LoginPage.
 *
 * Exemple :
 *   /login?tenant=mon-entreprise&email=admin@entreprise.com
 *
 * Le slug est mémorisé SYNCHRONEMENT avant l'appel réseau.
 * Le login peut donc envoyer x-tenant-slug immédiatement.
 */
export default function TenantSelectionBootstrap() {
  const [searchParams] = useSearchParams();
  const tenant = searchParams.get("tenant")?.trim().toLowerCase();

  useEffect(() => {
    if (!tenant) return;

    setSelectedTenantSlug(tenant);

    void selectTenantWorkspace(tenant).catch((error) => {
      console.error(
        "[FADES-RH] Impossible de confirmer la sélection du tenant.",
        error,
      );
    });
  }, [tenant]);

  return null;
}
