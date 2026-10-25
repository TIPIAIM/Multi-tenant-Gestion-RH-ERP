import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../auth/auth.context";
import { getApiErrorMessage } from "../auth/auth.api";
import "./task-notifications.css";

type Notice = {
  id: string;
  taskId: string;
  kind: "ASSIGNED" | "COMPLETED";
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
type NoticePage = {
  unreadCount: number;
  openTasks: number;
  asOf: string;
  page: number;
  limit: number;
  total: number;
  items: Notice[];
};

export default function TaskNotificationsPanel() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(true);
  const key = ["tasks", "notifications", user?.tenantId, user?.id];

  useEffect(() => {
    if (new URLSearchParams(location.search).get("notifications") === "1") {
      setExpanded(true);
    }
  }, [location.key, location.search]);

  const query = useQuery({
    queryKey: [...key, "list", page, onlyUnread],
    queryFn: async () => {
      const response = await api.get<{ data: NoticePage }>("/tasks/notifications", {
        params: { page, ...(onlyUnread ? { unread: "1" } : {}) },
      });
      return response.data.data;
    },
    enabled: Boolean(user),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
  });

  const read = useMutation({
    mutationFn: async (notice: Notice | null) => {
      if (notice) {
        await api.patch(`/tasks/notifications/${notice.id}/read`);
      } else {
        if (!query.data) throw new Error("La liste des notifications est indisponible.");
        await api.patch("/tasks/notifications/read-all", { before: query.data.asOf });
      }
    },
    onSuccess: async (_, notice) => {
      setPage(1);
      await client.invalidateQueries({ queryKey: key });
      if (notice) {
        setExpanded(false);
        navigate(`/tasks?task=${encodeURIComponent(notice.taskId)}`);
      }
    },
  });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20));

  useEffect(() => {
    if (query.data && page > totalPages) setPage(totalPages);
  }, [page, totalPages, query.data]);

  return (
    <section className="task-notices" aria-label="Notifications de tâches">
      <div className="task-notices-heading">
        <button type="button" aria-expanded={expanded} aria-controls={panelId}
          onClick={() => setExpanded(value => !value)}>
          <Bell size={18} aria-hidden="true" />
          <span>Notifications</span>
          {(query.data?.unreadCount ?? 0) > 0 && (
            <span className="task-notices-count">{query.data!.unreadCount > 99 ? "99+" : query.data!.unreadCount}</span>
          )}
          {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {expanded && (
          <button type="button" disabled={read.isPending || !query.data?.unreadCount}
            onClick={() => read.mutate(null)}>
            <CheckCheck size={18} aria-hidden="true" />Tout marquer comme lu
          </button>
        )}
      </div>
      <div id={panelId} hidden={!expanded}>
        <label className="task-notices-filter">
          <input type="checkbox" checked={onlyUnread} onChange={event => {
            setOnlyUnread(event.target.checked); setPage(1);
          }} />Uniquement les non lues
        </label>
        {query.isPending && <p role="status">Chargement des notifications…</p>}
        {query.isError && <div role="alert"><p>{getApiErrorMessage(query.error)}</p>
          <button type="button" onClick={() => void query.refetch()}>Réessayer</button></div>}
        {read.isError && <p role="alert">{getApiErrorMessage(read.error)}</p>}
        {query.data && !query.isError && <>
          {query.data.items.length === 0 && <p>Aucune notification{onlyUnread ? " non lue" : ""}.</p>}
          <ul>
            {query.data.items.map(notice => <li key={notice.id}>
              <button type="button" className={notice.readAt ? "" : "is-unread"}
                disabled={read.isPending} onClick={() => read.mutate(notice)}>
                <strong>{notice.kind === "COMPLETED" ? "Tâche terminée" : "Nouvelle attribution"} · {notice.title}</strong>
                <span>{notice.message}</span>
                <time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleString("fr-FR")}</time>
              </button>
            </li>)}
          </ul>
          {totalPages > 1 && <nav aria-label="Pages des notifications">
            <button type="button" disabled={page <= 1 || read.isPending} onClick={() => setPage(value => value - 1)}>Précédent</button>
            <span>Page {page} sur {totalPages}</span>
            <button type="button" disabled={page >= totalPages || read.isPending} onClick={() => setPage(value => value + 1)}>Suivant</button>
          </nav>}
        </>}
      </div>
    </section>
  );
}
