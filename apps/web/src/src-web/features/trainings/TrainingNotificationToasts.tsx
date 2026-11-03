import {useTenantSettings} from "../settings/settings.context";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, X } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../auth/auth.context";
import { getNotificationPopupPortal } from "../notifications/notification-popup-portal";
import { isTrainingPopup, mergeTrainingPopups, trainingPopupKey, trainingPopupHref, type TrainingPopup, type TrainingPopupState } from "./training-popup-state";
import "../tasks/task-notification-toasts.css";

const emptyCursor = "000000000000000000000000";
function readHidden(key: string): string[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(data) ? data.filter((v): v is string => typeof v === "string") : [];
  } catch { return []; }
}
function readState(key: string, hidden: string[]): TrainingPopupState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Partial<TrainingPopupState> | null;
    return { cursor: saved?.cursor && /^[a-f\d]{24}$/i.test(saved.cursor) ? saved.cursor : emptyCursor,
      items: mergeTrainingPopups([], Array.isArray(saved?.items) ? saved.items.filter(isTrainingPopup) : [], hidden) };
  } catch { return { cursor: emptyCursor, items: [] }; }
}
function Session({ tenantId, userId, role }: { tenantId: string; userId: string; role: string }) {
  const client = useQueryClient();
  const prefix = `fades:training-popups:${tenantId}:${userId}:${role}`;
  const hiddenKey = `${prefix}:closed`;
  const stateKey = `${prefix}:state`;
  const [hidden, setHidden] = useState(() => readHidden(hiddenKey));
  const [state, setState] = useState<TrainingPopupState>(() => readState(stateKey, readHidden(hiddenKey)));
  const cursorRef = useRef(state.cursor);
  const closeRefs = useRef(new Map<string, HTMLButtonElement>());
  const query = useQuery({
    queryKey: ["trainings", "notifications", tenantId, userId, role],
    queryFn: async ({ signal }) => {
      let cursor = cursorRef.current;
      const items: TrainingPopup[] = [];
      // Rattrapage borné par cycle pour ne pas bloquer l'interface sur un historique important.
      for (let page = 0; page < 5; page += 1) {
        const response = await api.get<{ data: { items: TrainingPopup[]; cursor: string; hasMore: boolean } }>(
          "/trainings/notifications/popups", { params: { after: cursor }, signal },
        );
        const result = response.data.data;
        items.push(...result.items.filter(isTrainingPopup));
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
    if (incoming.items.length) void client.invalidateQueries({queryKey:["trainings",tenantId,userId]});
    setState(current => ({ cursor: incoming.cursor, items: mergeTrainingPopups(current.items, incoming.items, hidden) }));
  }, [query.data, hidden, denied, client, tenantId, userId]);
  useEffect(() => {
    try { sessionStorage.setItem(stateKey, JSON.stringify(state)); } catch { /* Mémoire seule si stockage bloqué. */ }
  }, [state, stateKey]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === hiddenKey) setHidden(readHidden(hiddenKey)); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [hiddenKey]);
  function close(item: TrainingPopup): void {
    const closed = [...new Set([...readHidden(hiddenKey), ...hidden, trainingPopupKey(item)])];
    setHidden(closed);
    try { localStorage.setItem(hiddenKey, JSON.stringify(closed)); } catch { /* Mémoire seule. */ }
    const next = mergeTrainingPopups(state.items, [], closed);
    const wasFocused = document.activeElement === closeRefs.current.get(trainingPopupKey(item));
    setState(current => ({ ...current, items: mergeTrainingPopups(current.items, [], closed) }));
    if (wasFocused && next.length) requestAnimationFrame(() => closeRefs.current.get(trainingPopupKey(next[0]!))?.focus());
  }
  if (denied || !state.items.length) return null;
  return createPortal(<section className="task-popup-stack" aria-label="Notifications des formations">
    {state.items.map(item => <article key={trainingPopupKey(item)} className="task-popup">
      <span className="task-popup-announcement" role="status" aria-live="polite" aria-atomic="true">Formation : {item.message}</span>
      <span className="task-popup-icon" aria-hidden="true"><GraduationCap size={16} /></span>
      <Link className="task-popup-link" to={trainingPopupHref(item)}
        aria-label={`Consulter la notification : ${item.message}`}>
        <span className="task-popup-kind">{item.kind === "NEED_IDENTIFIED" ? "Formation · besoin exprimé" : item.kind === "OFFER_PUBLISHED" || item.kind === "SESSION_STATUS" ? "Formation · nouvelle offre" : "Formation · inscription"}</span>
        <strong>{item.title}</strong>
        <span className="task-popup-message">{item.message}</span>
        <time dateTime={item.createdAt}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
      </Link>
      <button className="task-popup-close" type="button" title="Fermer la notification" aria-label={`Fermer la notification : ${item.title}`}
        ref={node => { if (node) closeRefs.current.set(trainingPopupKey(item), node); else closeRefs.current.delete(trainingPopupKey(item)); }}
        onClick={() => close(item)}><X size={16} aria-hidden="true" /></button>
    </article>)}
  </section>, getNotificationPopupPortal());
}
export default function TrainingNotificationToasts() {
  const { user } = useAuth();
  const {settings}=useTenantSettings();
  if (!user) return null;
  if (!settings?.featureFlags.training || !settings.notifications?.enabled || !settings.notifications.inAppEnabled || !settings.notifications.trainingPopupEnabled) return null;
  return <Session key={`${user.tenantId}:${user.id}:${user.role}`} tenantId={user.tenantId} userId={user.id} role={user.role} />;
}
