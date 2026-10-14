import { AtSign, ChevronDown, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { usePieceTransferNotifications } from "./use-piece-transfer-notifications";
import "./communication-mention-notice.css";

export default function CommunicationMentionNotice() {
  const query = usePieceTransferNotifications();
  const alerts = query.data?.mentionAlerts ?? [];
  const count = query.data?.unreadMentions ?? 0;
  if (!count || !alerts.length || query.isError) return null;
  const first = alerts[0];
  if (!first) return null;
  const link = (id: string) => `/piece-transfers?unread=1&conversation=${encodeURIComponent(id)}`;
  return <aside className="communication-mention-notice" aria-label="Notifications de mentions">
    <div className="communication-mention-notice-main">
      <span className="communication-mention-notice-icon" aria-hidden="true"><AtSign size={20}/></span>
      <div><strong role="status" aria-live="polite">{count === 1 ? "Vous avez été mentionné dans un message" : `Vous avez été mentionné dans ${count} messages`}</strong><p>À lire dans <b>{first.title}</b>{alerts.length > 1 ? " et d’autres discussions" : ""}.</p></div>
      <Link to={link(first.transferId)} className="communication-mention-open"><MessageCircle size={16}/><span>Ouvrir</span></Link>
    </div>
    {alerts.length > 1 && <details><summary>Voir les discussions concernées <ChevronDown size={15}/></summary><ul>{alerts.map(alert => <li key={alert.transferId}><Link to={link(alert.transferId)}><span>{alert.title}</span><b>{alert.count}</b></Link></li>)}</ul>{alerts.length === 20 && <small>Les 20 discussions les plus récentes sont affichées.</small>}</details>}
  </aside>;
}
