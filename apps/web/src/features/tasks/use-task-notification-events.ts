import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../auth/auth.context";

export function useTaskNotificationEvents(enabled: boolean): void {
  const { user } = useAuth();
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled || !user) return;
    const refresh = () => { void client.invalidateQueries({
      queryKey: ["tasks", "notifications", user.tenantId, user.id],
    }); };
    const stream = typeof EventSource === "undefined" ? null : new EventSource(
      api.getUri({ url: "/tasks/notifications/events" }), { withCredentials: true },
    );
    stream?.addEventListener("tasks-changed", refresh);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stream?.removeEventListener("tasks-changed", refresh);
      stream?.close();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled, user?.tenantId, user?.id, client]);
}
