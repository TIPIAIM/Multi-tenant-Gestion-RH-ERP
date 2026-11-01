import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, X } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../auth/auth.context";
import { getNotificationPopupPortal } from "../notifications/notification-popup-portal";
import { taskPopupKey } from "../tasks/task-popup-state";
import { isRoadmapPopup, mergeRoadmapPopups, type RoadmapPopup, type RoadmapPopupState } from "./roadmap-popup-state";
import "../tasks/task-notification-toasts.css";

const emptyCursor = "000000000000000000000000";
function readHidden(key: string): string[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(data) ? data.filter((v): v is string => typeof v === "string") : [];
  } catch { return []; }
}
function readState(key: string, hidden: string[]): RoadmapPopupState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Partial<RoadmapPopupState> | null;
    return { cursor: saved?.cursor && /^[a-f\d]{24}$/i.test(saved.cursor) ? saved.cursor : emptyCursor,
      items: mergeRoadmapPopups([], Array.isArray(saved?.items) ? saved.items.filter(isRoadmapPopup) : [], hidden) };
  } catch { return { cursor: emptyCursor, items: [] }; }
}
function Session({ tenantId, userId }: { tenantId: string; userId: string }) {
  const prefix = `fades:roadmap-popups:${tenantId}:${userId}`;
  const hiddenKey = `${prefix}:closed`;
  const stateKey = `${prefix}:state`;
  const [hidden, setHidden] = useState(() => readHidden(hiddenKey));
  const [state, setState] = useState<RoadmapPopupState>(() => readState(stateKey, readHidden(hiddenKey)));
  const cursorRef = useRef(state.cursor);
  const closeRefs = useRef(new Map<string, HTMLButtonElement>());
  const query = useQuery({
    queryKey: ["roadmaps", "notifications", tenantId, userId],
    queryFn: async ({ signal }) => {
      let cursor = cursorRef.current;
      const items: RoadmapPopup[] = [];
      // Rattrapage borné par cycle pour ne pas bloquer l'interface sur un historique important.
      for (let page = 0; page < 5; page += 1) {
        const response = await api.get<{ data: { items: RoadmapPopup[]; cursor: string; hasMore: boolean } }>(
          "/roadmaps/notifications/popups", { params: { after: cursor }, signal },
        );
        const result = response.data.data;
        items.push(...result.items.filter(isRoadmapPopup));
        const before = cursor;
        cursor = result.cursor;
        if (!result.hasMore || before === cursor) break;
      }
      return { cursor, items };
    },
    retry: false,
    staleTime: 1000,
    refetchInterval: current => {
      const status = (current.state.error as { response?: { status?: number } } | null)?.response?.status;
      return status === 401 || status === 403 ? false : 5000;
    },
    refetchOnWindowFocus: "always",
  });
  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;
  const denied = status === 401 || status === 403;
  useEffect(() => {
    if (denied) { setState({ cursor: emptyCursor, items: [] }); return; }
    const incoming = query.data;
    if (!incoming) return;
    cursorRef.current = incoming.cursor;
    setState(current => ({ cursor: incoming.cursor, items: mergeRoadmapPopups(current.items, incoming.items, hidden) }));
  }, [query.data, hidden, denied]);
  useEffect(() => {
    try { sessionStorage.setItem(stateKey, JSON.stringify(state)); } catch { /* Mémoire seule si stockage bloqué. */ }
  }, [state, stateKey]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === hiddenKey) setHidden(readHidden(hiddenKey)); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [hiddenKey]);
  function close(item: RoadmapPopup): void {
    const closed = [...new Set([...readHidden(hiddenKey), ...hidden, taskPopupKey(item)])];
    setHidden(closed);
    try { localStorage.setItem(hiddenKey, JSON.stringify(closed)); } catch { /* Mémoire seule. */ }
    const next = mergeRoadmapPopups(state.items, [], closed);
    const wasFocused = document.activeElement === closeRefs.current.get(taskPopupKey(item));
    setState(current => ({ ...current, items: mergeRoadmapPopups(current.items, [], closed) }));
    if (wasFocused && next.length) requestAnimationFrame(() => closeRefs.current.get(taskPopupKey(next[0]!))?.focus());
  }
  if (denied || !state.items.length) return null;
  return createPortal(<section className="task-popup-stack" aria-label="Notifications des objectifs de feuille de route">
    {state.items.map(item => <article key={taskPopupKey(item)} className="task-popup">
      <span className="task-popup-announcement" role="status" aria-live="polite" aria-atomic="true">Objectif réalisé : {item.message}</span>
      <span className="task-popup-icon" aria-hidden="true"><ListChecks size={16} /></span>
      <Link className="task-popup-link" to={`/roadmaps?roadmap=${encodeURIComponent(item.taskId)}&item=${encodeURIComponent(item.itemId)}`}
        aria-label={`Consulter l’objectif réalisé : ${item.message}`}>
        <span className="task-popup-kind">Feuille de route · réalisation soumise</span>
        <strong>{item.title}</strong>
        <span className="task-popup-message">{item.message}</span>
        <time dateTime={item.createdAt}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
      </Link>
      <button className="task-popup-close" type="button" title="Fermer la notification" aria-label={`Fermer la notification : ${item.title}`}
        ref={node => { if (node) closeRefs.current.set(taskPopupKey(item), node); else closeRefs.current.delete(taskPopupKey(item)); }}
        onClick={() => close(item)}><X size={16} aria-hidden="true" /></button>
    </article>)}
  </section>, getNotificationPopupPortal());
}
export default function RoadmapNotificationToasts() {
  const { user } = useAuth();
  if (!user || (user.role !== "RH_MANAGER" && user.role !== "TENANT_ADMIN")) return null;
  return <Session key={`${user.tenantId}:${user.id}`} tenantId={user.tenantId} userId={user.id} />;
}
