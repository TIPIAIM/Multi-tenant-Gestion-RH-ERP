import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth.context";
import { getApiErrorMessage } from "../auth/auth.api";
import { api } from "../../lib/api";
import "./document-marks.css";
export type DocumentMarkKind = "stamp" | "signature";
export type DocumentMarks = {
  revision: number;
  stamp: boolean;
  signature: boolean;
};
export function useDocumentMarks(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["document-marks", user?.tenantId, user?.id],
    queryFn: async () =>
      (await api.get<{ data: DocumentMarks }>("/settings/document-marks")).data
        .data,
    enabled: Boolean(user && enabled),
    staleTime: 30_000,
    retry: false,
  });
}
/** Blob URLs are scoped to this account and revoked on replacement/unmount. */
export function PrivateDocumentMark({
  path,
  revision,
  label,
}: {
  path: string;
  revision: number;
  label: string;
}) {
  const { user } = useAuth();
  const key = `${user?.tenantId}:${user?.id}:${path}:${revision}`;
  const query = useQuery({
    queryKey: ["private-document-mark", key],
    queryFn: async ({ signal }) => {
      const response = await api.get<Blob>(path, {
        responseType: "blob",
        signal,
      });
      if (!response.data.type.startsWith("image/"))
        throw new Error("Image indisponible");
      return response.data;
    },
    enabled: Boolean(user),
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
  });
  const [preview, setPreview] = useState<{
    key: string;
    blob: Blob;
    url: string;
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(query.data);
    setPreview({ key, blob: query.data, url });
    setFailed(null);
    return () => URL.revokeObjectURL(url);
  }, [query.data, key]);
  const source =
    !query.isError &&
    preview?.key === key &&
    preview.blob === query.data &&
    preview.url !== failed
      ? preview.url
      : null;
  return source ? (
    <img src={source} alt={label} onError={() => setFailed(source)} />
  ) : (
    <span className="document-mark-placeholder" role="status">
      {query.isError || failed ? "Aperçu indisponible" : "Chargement…"}
    </span>
  );
}
export default function TenantDocumentMarksPanel() {
  const { user } = useAuth();
  const allowed = user?.role === "TENANT_ADMIN";
  const query = useDocumentMarks(allowed);
  const client = useQueryClient();
  const [busy, setBusy] = useState<DocumentMarkKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function change(kind: DocumentMarkKind, file?: File) {
    if (!query.data || busy) return;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      if (
        file &&
        (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 2 * 1024 * 1024)
      )
        throw new Error(
          "Choisissez une image PNG, JPEG ou WebP de 2 Mo maximum.",
        );
      if (file) {
        const form = new FormData();
        form.append("image", file);
        form.append("revision", String(query.data.revision));
        await api.post("/settings/document-marks/" + kind, form);
      } else
        await api.delete("/settings/document-marks/" + kind, {
          data: { revision: query.data.revision },
        });
      await client.invalidateQueries({ queryKey: ["document-marks"] });
      setNotice(
        file
          ? "Visuel enregistré."
          : "Visuel supprimé pour les prochains bulletins.",
      );
    } catch (e) {
      setError(
        e instanceof Error && !("response" in e)
          ? e.message
          : getApiErrorMessage(e),
      );
      await query.refetch();
    } finally {
      setBusy(null);
    }
  }
  if (!allowed) return null;
  return (
    <section
      className="document-marks-panel"
      aria-labelledby="document-marks-title"
    >
      <h3 id="document-marks-title">Cachet et signature de l’entreprise</h3>
      <p>
        Ces visuels privés sont enregistrés immédiatement. Les RH choisissent de
        les appliquer à chaque bulletin validé. Les bulletins déjà préparés
        conservent leurs visuels.
      </p>
      <p className="document-marks-help">
        PNG transparent conseillé · PNG, JPEG ou WebP · 2 Mo maximum par image
      </p>
      {query.isError && (
        <p role="alert">
          Impossible de charger la configuration.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Réessayer
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="document-marks-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="document-marks-grid">
        {(["stamp", "signature"] as const).map((kind) => (
          <div className="document-mark-field" key={kind}>
            <h4>{kind === "stamp" ? "Cachet" : "Signature"}</h4>
            <div className="document-mark-preview">
              {query.data?.[kind] ? (
                <PrivateDocumentMark
                  path={`/settings/document-marks/${kind}`}
                  revision={query.data.revision}
                  label={
                    kind === "stamp"
                      ? "Cachet de l’entreprise"
                      : "Signature de l’entreprise"
                  }
                />
              ) : (
                <span>{query.isPending ? "Chargement…" : "Aucun visuel"}</span>
              )}
            </div>
            <label className="document-mark-upload">
              {busy === kind
                ? "Enregistrement…"
                : query.data?.[kind]
                  ? "Remplacer l’image"
                  : "Ajouter une image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={Boolean(busy) || !query.data}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void change(kind, file);
                }}
              />
            </label>
            {query.data?.[kind] && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void change(kind)}
              >
                Supprimer
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
