import { getNotificationPopupPortal } from "../notifications/notification-popup-portal";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellPlus, CheckCircle2, X } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../auth/auth.context";
import { useTaskNotificationEvents } from "./use-task-notification-events";
import { isTaskPopup, mergeTaskPopups, taskPopupKey, type TaskPopup } from "./task-popup-state";
import "./task-notification-toasts.css";

type PopupPage = { items: TaskPopup[]; page: number; total: number; limit: number; asOf: string };

function readArray(key: string, session: boolean): unknown[] {
  try {
    const value: unknown = JSON.parse((session ? sessionStorage : localStorage).getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function writeArray(key: string, value: unknown[], session: boolean): void {
  try { (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); }
  catch { /* Le stockage désactivé ne doit pas empêcher l'affichage en mémoire. */ }
}
async function getPopups(signal: AbortSignal): Promise<TaskPopup[]> {
  const items: TaskPopup[] = [];
  let page = 1;
  let asOf: string | undefined;
  for (;;) {
    const response = await api.get<{ data: PopupPage }>("/tasks/notifications/popups", {
      params: { page, asOf }, signal,
    });
    const result = response.data.data;
    items.push(...result.items.filter(isTaskPopup));
    asOf = result.asOf;
    if (page * result.limit >= result.total || result.items.length === 0) return items;
    page += 1;
  }
}

function TaskPopupSession({ tenantId, userId }: { tenantId: string; userId: string }) {
  const prefix = `fades:task-popups:${tenantId}:${userId}`;
  const dismissedKey = `${prefix}:dismissed`;
  const pendingKey = `${prefix}:pending`;
  const [dismissed, setDismissed] = useState<string[]>(() => readArray(dismissedKey, false).filter((v): v is string => typeof v === "string"));
  const [items, setItems] = useState<TaskPopup[]>(() => mergeTaskPopups(
    [], readArray(pendingKey, true).filter(isTaskPopup),
    readArray(dismissedKey, false).filter((v): v is string => typeof v === "string"),
  ));
  const client = useQueryClient();
  const closeFocus = useRef(new Map<string, HTMLButtonElement>());
  const query = useQuery({
    queryKey: ["tasks", "notifications", tenantId, userId, "popups"],
    queryFn: ({ signal }) => getPopups(signal),
    retry: false,
    staleTime: 1000,
    refetchInterval: (current) => {
      const status = (current.state.error as { response?: { status?: number } } | null)?.response?.status;
      return status === 401 || status === 403 ? false : 5000;
    },
    refetchOnWindowFocus: "always",
  });
  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;
  const denied = status === 401 || status === 403;
  useTaskNotificationEvents(!denied);

  useEffect(() => {
    if (denied) { setItems([]); writeArray(pendingKey, [], true); return; }
    const incoming = query.data;
    if (incoming) setItems(current => mergeTaskPopups(current, incoming, dismissed));
  }, [query.data, dismissed, denied, pendingKey]);
  useEffect(() => { writeArray(pendingKey, items, true); }, [items, pendingKey]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== dismissedKey) return;
      const hidden = readArray(dismissedKey, false).filter((v): v is string => typeof v === "string");
      setDismissed(hidden);
      setItems(current => mergeTaskPopups(current, [], hidden));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [dismissedKey]);

  function dismiss(item: TaskPopup): void {
    const key = taskPopupKey(item);
    const hidden = [...new Set([...readArray(dismissedKey, false).filter((v): v is string => typeof v === "string"), ...dismissed, key])];
    setDismissed(hidden);
    writeArray(dismissedKey, hidden, false);
    const next = items.filter(value => taskPopupKey(value) !== key);
    const wasFocused = document.activeElement === closeFocus.current.get(key);
    setItems(next);
    writeArray(pendingKey, next, true);
    if (wasFocused && next.length) requestAnimationFrame(() => closeFocus.current.get(taskPopupKey(next[0]!))?.focus());
  }

  if (!items.length || denied) return null;
  return createPortal(
    <section className="task-popup-stack" aria-label="Notifications de tâches">
      {items.map(item => {
        const key = taskPopupKey(item);
        return (
          <article key={key} className={`task-popup task-popup--${item.kind.toLowerCase()}`}>
            <div className="task-popup-announcement" role="status" aria-live="polite" aria-atomic="true">
              {item.kind === "ASSIGNED" ? "Nouvelle tâche attribuée" : "Tâche terminée"} : {item.title}
            </div>
            <span className="task-popup-icon" aria-hidden="true">
              {item.kind === "ASSIGNED" ? <BellPlus size={21} /> : <CheckCircle2 size={21} />}
            </span>
            <Link className="task-popup-link" to={`/tasks?task=${encodeURIComponent(item.taskId)}`}
              aria-label={`Ouvrir la tâche : ${item.title}`}
              onClick={() => {
                // La lecture met à jour le badge ; seule la croix ferme le pop-up.
                void api.patch(`/tasks/notifications/${item.id}/read`).then(() =>
                  client.invalidateQueries({ queryKey: ["tasks", "notifications", tenantId, userId] })
                ).catch(() => { /* La navigation reste disponible si la lecture échoue. */ });
              }}>
              <span className="task-popup-kind">{item.kind === "ASSIGNED" ? "Nouvelle attribution" : "Tâche terminée"}</span>
              <strong>{item.title}</strong>
              <span className="task-popup-message">{item.message}</span>
              <time dateTime={item.createdAt}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
            </Link>
            <button type="button" className="task-popup-close" title="Fermer la notification"
              ref={node => { if (node) closeFocus.current.set(key, node); else closeFocus.current.delete(key); }}
              aria-label={`Fermer la notification : ${item.title}`} onClick={() => dismiss(item)}>
              <X size={18} aria-hidden="true" />
            </button>
          </article>
        );
      })}
    </section>, getNotificationPopupPortal(),
  );
}

export default function TaskNotificationToasts() {
  const { user } = useAuth();
  if (!user || !["TENANT_ADMIN", "RH_MANAGER", "DIRECTION", "SERVICE_MANAGER", "AGENT"].includes(user.role)) return null;
  return <TaskPopupSession key={`${user.tenantId}:${user.id}`} tenantId={user.tenantId} userId={user.id} />;
}
