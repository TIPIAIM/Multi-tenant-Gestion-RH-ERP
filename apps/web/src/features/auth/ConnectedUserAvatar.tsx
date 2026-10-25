import { useState } from "react";
import { useAuth } from "./auth.context";
import useAvatarPhoto from "./useAvatarPhoto";
import "./connected-user-avatar.css";

export default function ConnectedUserAvatar() {
  const { user } = useAuth();
  const { source, message } = useAvatarPhoto("/auth/me/avatar");
  const [failed, setFailed] = useState<string | null>(null);
  const initials = (user?.fullName ?? "").trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map(part => part.charAt(0).toUpperCase()).join("") || "U";
  return source && source !== failed ? <img className="connected-user-avatar-image" src={source}
    alt={`Photo de ${user?.fullName ?? "l’utilisateur"}`} onError={() => setFailed(source)} />
    : <span className="connected-user-avatar-initials" aria-label={user?.fullName ?? "Utilisateur"}
      title={source && source === failed ? "Image bloquée ou illisible dans le navigateur." : message}>{initials}</span>;
}
