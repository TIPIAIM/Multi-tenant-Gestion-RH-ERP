import { useState } from "react";
import { UsersRound } from "lucide-react";
import useAvatarPhoto from "../../features/auth/useAvatarPhoto";
import "./communication-avatar.css";

export default function CommunicationAvatar({ transferId, userId, name, group = false }: {
  transferId: string; userId?: string; name: string; group?: boolean;
}) {
  const collective = group && !userId;
  const { source, message } = useAvatarPhoto(`/piece-transfers/${transferId}/avatar`,
    userId ? { userId } : undefined, Boolean(transferId && !collective));
  const [failed, setFailed] = useState<string | null>(null);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "U";
  return <span className="communication-person-avatar" aria-label={name}
    title={`${name} · ${collective ? "Groupe" : source && source === failed ? "Image bloquée ou illisible" : message}`}>
    {!collective && source && source !== failed ? <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailed(source)} />
      : collective ? <UsersRound size={20} aria-hidden="true" /> : <span aria-hidden="true">{initials}</span>}
  </span>;
}
