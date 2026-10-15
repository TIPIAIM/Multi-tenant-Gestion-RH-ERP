import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../auth/auth.context";
import { getApiErrorMessage } from "../auth/auth.api";
import type { Agent } from "./agent.types";
import "./agent-photo.css";
export function AgentAvatar({ agent }: { agent: Agent }) {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const query = useQuery({
    queryKey: [
      "agent-photo",
      user?.tenantId,
      user?.id,
      agent.id,
      agent.photoRevision,
    ],
    queryFn: async () =>
      (
        await api.get<Blob>(`/agents/${agent.id}/photo`, {
          responseType: "blob",
        })
      ).data,
    enabled: Boolean(agent.hasPhoto),
    staleTime: 60_000,
    gcTime: 120_000,
    retry: 1,
  });
  useEffect(() => {
    setUrl("");
    if (!query.data || !agent.hasPhoto) return;
    const source = URL.createObjectURL(query.data);
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [query.data, agent.hasPhoto, agent.photoRevision]);
  return url ? (
    <img
      className="agent-photo-image"
      src={url}
      alt={`Portrait de ${agent.fullName}`}
      loading="lazy"
      onError={() => setUrl("")}
    />
  ) : (
    <span aria-label={agent.fullName}>
      {agent.fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n.charAt(0))
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function AgentPhotoEditor({
  agent,
  canManage,
}: {
  agent: Agent;
  canManage: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (file: File | null) => {
      if (file) {
        const form = new FormData();
        form.append("photo", file);
        form.append("revision", String(agent.photoRevision ?? 0));
        await api.post(`/agents/${agent.id}/photo`, form);
      } else
        await api.delete(`/agents/${agent.id}/photo`, {
          data: { revision: agent.photoRevision ?? 0 },
        });
    },
    onSuccess: async () => {
      setConfirm(false);
      await client.invalidateQueries({
        predicate: (q) =>
          ["agents", "agent", "agent-photo"].includes(String(q.queryKey[0])),
      });
    },
  });
  if (!canManage) return null;
  return (
    <div className="agent-photo-editor">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          setError("");
          mutation.reset();
          if (!file) return;
          if (
            !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
            file.size > 2 * 1024 * 1024
          ) {
            setError("Choisissez une image PNG, JPEG ou WebP de 2 Mo maximum.");
            return;
          }
          mutation.mutate(file);
        }}
      />
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => input.current?.click()}
      >
        <Camera size={17} />
        {mutation.isPending
          ? "Enregistrement…"
          : agent.hasPhoto
            ? "Changer la photo"
            : "Ajouter une photo"}
      </button>
      {agent.hasPhoto && (
        <button
          type="button"
          aria-label="Supprimer la photo"
          title="Supprimer la photo"
          disabled={mutation.isPending}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={17} />
        </button>
      )}
      {confirm && (
        <div role="group" aria-label="Confirmer la suppression">
          <span>Supprimer la photo ?</span>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(null)}
          >
            Supprimer
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => setConfirm(false)}
          >
            Conserver
          </button>
        </div>
      )}
      {(error || mutation.isError) && (
        <p role="alert">{error || getApiErrorMessage(mutation.error)}</p>
      )}
    </div>
  );
}
