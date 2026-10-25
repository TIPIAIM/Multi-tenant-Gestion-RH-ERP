import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth.context";
import { api } from "../../lib/api";

const messages: Record<string, string> = {
  NO_AGENT_LINK: "Aucun dossier agent lié à ce compte.",
  BROKEN_AGENT_LINK: "Le dossier agent lié est introuvable dans cette entreprise.",
  AMBIGUOUS_AGENT_LINK: "Plusieurs dossiers correspondent : vérifiez le lien utilisateur–agent.",
  CONFLICTING_AGENT_LINK: "Le dossier correspondant est déjà lié à un autre compte.",
  NO_AGENT_PHOTO: "Le dossier agent existe mais ne possède pas de photo.",
  PHOTO_ASSET_MISSING: "La photo enregistrée n’est plus disponible dans le stockage.",
  ACCOUNT_MISSING: "Compte du participant indisponible.",
  GROUP: "Discussion de groupe.",
};

function readImage(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    reader.onload = () => { cleanup(); typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image illisible")); };
    reader.onerror = () => { cleanup(); reject(new Error("Image illisible")); };
    reader.onabort = () => { cleanup(); reject(new DOMException("Chargement annulé", "AbortError")); };
    if (signal.aborted) { reject(new DOMException("Chargement annulé", "AbortError")); return; }
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(blob);
  });
}

export default function useAvatarPhoto(path: string, params?: { userId?: string }, enabled = true) {
  const { user } = useAuth();
  const accountKey = `${user?.tenantId ?? ""}:${user?.id ?? ""}`;
  const query = useQuery({
    queryKey: ["agent-photo", "unified-v1", user?.tenantId, user?.id, path, params?.userId ?? null],
    queryFn: async ({ signal }) => {
      try {
        const response = await api.get<Blob>(path, { params, responseType: "blob", signal, timeout: 35_000 });
        if (response.status === 204) {
          const diagnostic = await api.get<{ data?: { reason?: string } }>(path, {
            params: { ...params, diagnostic: "1" }, signal, timeout: 35_000,
          });
          const reason = diagnostic.data?.data?.reason ?? "NO_PHOTO";
          return { source: null, message: messages[reason] ?? "Aucune photo disponible.", accountKey };
        }
        const blob = response.data;
        if (!blob.size || !["image/png", "image/jpeg", "image/webp"].includes(blob.type.split(";")[0]!)) {
          throw new Error("Le serveur n’a pas renvoyé une photo PNG, JPEG ou WebP.");
        }
        return { source: await readImage(blob, signal), message: "Photo de profil", accountKey };
      } catch (error) {
        const response = (error as { response?: { status?: number; data?: unknown } })?.response;
        const status = response?.status;
        let message = status === 401 ? "Session expirée : reconnectez-vous." : status === 403 ? "Accès à cette photo refusé."
          : status === 404 ? "Route avatar introuvable : vérifiez les routes et redémarrez l’API."
          : status === 502 || status === 503 ? "Le stockage des photos est indisponible ou non configuré."
          : error instanceof Error ? error.message : "Chargement de photo impossible.";
        if (response?.data instanceof Blob && response.data.type.includes("json")) {
          try {
            const data = JSON.parse(await response.data.text()) as { error?: { message?: string } };
            message = data.error?.message || message;
          } catch { /* Preserve the useful status message. */ }
        }
        throw new Error(message);
      }
    },
    enabled: Boolean(user && enabled && path), staleTime: 30_000, gcTime: 120_000,
    refetchInterval: enabled ? 60_000 : false, refetchOnWindowFocus: true, retry: false,
  });
  const source = user && !query.isError && query.data?.accountKey === accountKey ? query.data.source : null;
  const message = query.isError ? query.error.message : query.data?.message ?? "Chargement de la photo";
  return { source, message };
}
