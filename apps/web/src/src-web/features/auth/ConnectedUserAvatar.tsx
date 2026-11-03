import { memo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/auth.context";
import { api } from "../../lib/api";
import { getAgentById, getAgentScope } from "../agents/agent.api";
import "./connected-user-avatar.css";

function ConnectedUserAvatar() {
  const { user } = useAuth();
  const accountKey = `${user?.tenantId ?? ""}:${user?.id ?? ""}`;
  const scope = useQuery({
    queryKey: ["agents", "scope", user?.tenantId, user?.id],
    queryFn: getAgentScope,
    enabled: Boolean(user && !user.agentId),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const agentId = user?.agentId || scope.data?.agentId || null;
  const agent = useQuery({
    queryKey: ["agent", agentId, user?.tenantId, user?.id],
    queryFn: () => getAgentById(agentId!),
    enabled: Boolean(user && agentId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const hasPhoto = Boolean(agentId && agent.data?.hasPhoto && !agent.isError);
  const photo = useQuery({
    queryKey: [
      "agent-photo",
      user?.tenantId,
      user?.id,
      agentId,
      agent.data?.photoRevision,
    ],
    queryFn: async ({ signal }) => {
      const response = await api.get<Blob>(`/agents/${agentId}/photo`, {
        responseType: "blob",
        signal,
      });
      if (!response.data.type.startsWith("image/"))
        throw new Error("Photo indisponible");
      return response.data;
    },
    enabled: Boolean(user && hasPhoto),
    staleTime: 60_000,
    gcTime: 120_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const [preview, setPreview] = useState<{
    key: string;
    blob: Blob;
    url: string;
  } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo.data || !hasPhoto || !user?.id) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo.data);
    setPreview({ key: accountKey, blob: photo.data, url });
    setFailedUrl(null);
    return () => URL.revokeObjectURL(url);
  }, [photo.data, hasPhoto, accountKey, user?.id]);
  const initials =
    (user?.fullName ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name.charAt(0).toUpperCase())
      .join("") || "U";
  const source =
    hasPhoto &&
    !photo.isError &&
    preview?.key === accountKey &&
    preview.blob === photo.data &&
    preview.url !== failedUrl
      ? preview.url
      : null;
  return source ? (
    <img
      className="connected-user-avatar-image"
      src={source}
      decoding="async"
      alt={`Photo de profil de ${user?.fullName ?? "l’utilisateur"}`}
      onError={() => setFailedUrl(source)}
    />
  ) : (
    <span
      className="connected-user-avatar-initials"
      aria-label={user?.fullName ?? "Utilisateur"}
    >
      {initials}
    </span>
  );
}

export default memo(ConnectedUserAvatar);
