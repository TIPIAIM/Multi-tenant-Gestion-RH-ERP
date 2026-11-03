import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../auth/auth.context";

type Subscription = { count: number; dispose: () => void };
const subscriptions = new WeakMap<QueryClient, Map<string, Subscription>>();

/** One SSE connection per account and query client, shared by panel and pop-ups. */
export function useTaskNotificationEvents(enabled: boolean): void {
  const { user } = useAuth();
  const client = useQueryClient();
  const tenantId = user?.tenantId, userId = user?.id;
  useEffect(() => {
    if (!enabled || !tenantId || !userId) return;
    let accounts = subscriptions.get(client);
    if (!accounts) { accounts = new Map(); subscriptions.set(client, accounts); }
    const key = JSON.stringify([tenantId, userId]);
    let subscription = accounts.get(key);
    if (!subscription) {
      const refresh = () => { void client.invalidateQueries({ queryKey: ["tasks", "notifications", tenantId, userId] }); };
      const stream = typeof EventSource === "undefined" ? null : new EventSource(
        api.getUri({ url: "/tasks/notifications/events" }), { withCredentials: true },
      );
      // EventSource retries temporary disconnects, including the server's periodic close.
      // HTTP authorization failures remain handled by the protected polling queries.
      const failed = () => { refresh(); };
      const visible = () => { if (document.visibilityState === "visible") refresh(); };
      stream?.addEventListener("tasks-changed", refresh);
      stream?.addEventListener("error", failed);
      document.addEventListener("visibilitychange", visible);
      subscription = { count: 0, dispose: () => {
        stream?.removeEventListener("tasks-changed", refresh);
        stream?.removeEventListener("error", failed);
        stream?.close(); document.removeEventListener("visibilitychange", visible);
      } };
      accounts.set(key, subscription);
    }
    subscription.count++;
    return () => {
      subscription.count--;
      if (subscription.count === 0) { subscription.dispose(); accounts.delete(key); }
    };
  }, [enabled, tenantId, userId, client]);
}
