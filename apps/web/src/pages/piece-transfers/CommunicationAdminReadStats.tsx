import { useMemo, useRef, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import type { PieceTransferAdminOverview } from "../../features/piece-transfers/piece-transfer.types";

function formatRole(value: string): string {
  const labels: Record<string, string> = {
    TENANT_ADMIN: "Administrateur",
    RH_MANAGER: "Responsable RH",
    DIRECTION: "Direction",
    SERVICE_MANAGER: "Chef de service",
    AGENT: "Agent",
  };
  return labels[value] ?? value;
}

type Filter = "ALL" | "UNREAD" | "READ";
export default function CommunicationAdminReadStats({ overview, onNavigate }: {
  overview?: PieceTransferAdminOverview;
  onNavigate: (view: "MESSAGES" | "FILES") => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState("UNREAD");
  const tableRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return (overview?.agents ?? []).filter(row => {
      if (filter === "UNREAD" && !(row.messagesUnread > 0)) return false;
      if (filter === "READ" && (!(row.activeMessagesReceived > 0) || row.messagesUnread > 0)) return false;
      return [row.fullName, row.matricule, row.directionName, row.serviceName, ...row.emails]
        .some(value => value?.toLocaleLowerCase("fr").includes(query));
    }).sort((a, b) => sort === "NAME" ? a.fullName.localeCompare(b.fullName, "fr")
      : (sort === "RECEIVED" ? b.activeMessagesReceived - a.activeMessagesReceived
        : b.messagesUnread - a.messagesUnread) || a.fullName.localeCompare(b.fullName, "fr"));
  }, [overview?.agents, search, filter, sort]);
  function inspect(next: Filter) {
    setFilter(next); setSearch("");
    tableRef.current?.scrollIntoView({ block: "nearest" });
    tableRef.current?.focus({ preventScroll: true });
  }
  if (!overview) return <div className="piece-transfer-chat-list-state">Aucune donnée.</div>;
  const metric = (label: string, value: number, onClick: () => void) => (
    <button type="button" key={label} onClick={onClick} aria-label={`${label} : ${value}. Consulter`}>
      <span>{label}</span><strong>{new Intl.NumberFormat("fr-FR").format(value ?? 0)}</strong><small>Consulter →</small>
    </button>
  );
  return <div className="piece-transfer-admin-stats-v5">
    <div className="piece-transfer-admin-summary-v5 communication-admin-summary">
      {metric("Messages envoyés", overview.totals.messagesSent, () => onNavigate("MESSAGES"))}
      {metric("Messages reçus", overview.totals.messagesReceived, () => onNavigate("MESSAGES"))}
      {metric("Fichiers envoyés", overview.totals.filesSent, () => onNavigate("FILES"))}
      {metric("Fichiers reçus", overview.totals.filesReceived, () => onNavigate("FILES"))}
      {metric("Communications initiées", overview.totals.communicationsStarted, () => onNavigate("MESSAGES"))}
      {metric("Communications reçues", overview.totals.communicationsReceived, () => onNavigate("MESSAGES"))}
      {metric("Messages lus", overview.totals.messagesRead, () => inspect("ALL"))}
      {metric("Messages non ouverts", overview.totals.messagesUnread, () => inspect("UNREAD"))}
      {metric("Agents avec des non lus", overview.totals.agentsWithUnread, () => inspect("UNREAD"))}
    </div>
    <div className="piece-transfer-agent-table-v5 communication-admin-read-table" ref={tableRef} tabIndex={-1}>
      <header><UsersRound size={18} /><strong>Activité et lecture par agent</strong></header>
      <p className="communication-read-explanation">Les compteurs de lecture portent sur les messages des communications actives, hors messages supprimés. L’activité historique reste affichée.</p>
      <div className="communication-admin-filters">
        <label className="communication-admin-search"><Search size={16} aria-hidden="true" /><input aria-label="Rechercher un agent" placeholder="Nom, matricule, service ou email…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>Lecture<select value={filter} onChange={event => setFilter(event.target.value as Filter)}>
          <option value="ALL">Tous les agents</option><option value="UNREAD">Avec des non lus</option><option value="READ">Tout lu</option>
        </select></label>
        <label>Trier par<select value={sort} onChange={event => setSort(event.target.value)}>
          <option value="UNREAD">Non lus en premier</option><option value="RECEIVED">Messages actifs reçus</option><option value="NAME">Nom de l’agent</option>
        </select></label>
      </div>
      <p className="communication-read-result" role="status">{rows.length} agent{rows.length > 1 ? "s" : ""} affiché{rows.length > 1 ? "s" : ""}</p>
      <div className="piece-transfer-table-scroll"><table>
        <thead><tr><th scope="col">Agent</th><th scope="col">Reçus actifs</th><th scope="col">Lus</th><th scope="col">Non ouverts</th><th scope="col">Lecture</th><th scope="col">Structure</th><th scope="col">Msg envoyés</th><th scope="col">Msg reçus</th><th scope="col">Fich. envoyés</th><th scope="col">Fich. reçus</th></tr></thead>
        <tbody>{rows.map(row => {
          const percentage = row.activeMessagesReceived ? Math.round(row.messagesRead / row.activeMessagesReceived * 100) : null;
          return <tr key={row.entityId}>
            <td><strong>{row.fullName}</strong><span>{row.matricule || formatRole(row.role)}</span>{row.emails[0] && <span>{row.emails[0]}</span>}</td>
            <td>{row.activeMessagesReceived}</td>
            <td><span className="communication-read-pill is-read">{row.messagesRead}</span></td>
            <td><span className={`communication-read-pill ${row.messagesUnread ? "is-unread" : "is-clear"}`}>{row.messagesUnread}</span>{row.unreadCommunications > 0 && <small>{row.unreadCommunications} discussion{row.unreadCommunications > 1 ? "s" : ""}</small>}</td>
            <td>{percentage === null ? <span>Aucun message actif</span> : <div className="communication-read-rate"><progress max={100} value={percentage} aria-label={`Taux de lecture de ${row.fullName}`} /><span>{percentage} %</span></div>}</td>
            <td><strong>{row.directionName || "—"}</strong><span>{row.serviceName || row.jobTitle || "—"}</span></td>
            <td>{row.messagesSent}</td><td>{row.messagesReceived}</td>
            <td>{row.filesSent}</td><td>{row.filesReceived}</td>
          </tr>;
        })}{!rows.length && <tr><td colSpan={10}>Aucun agent ne correspond à ces filtres.</td></tr>}</tbody>
      </table></div>
    </div>
  </div>;
}
