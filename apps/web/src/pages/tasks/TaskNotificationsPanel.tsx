import {
  useEffect,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
} from "lucide-react";
import { useAuth } from "../../features/auth/auth.context";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { api } from "../../lib/api";
import "./task-notifications.css";

type TaskNotification = {
  id: string;
  taskId: string;
  kind: "ASSIGNED" | "COMPLETED";
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

type TaskNotificationsResponse = {
  items: TaskNotification[];
  total: number;
  unreadCount: number;
  openTasks: number;
  asOf: string;
  page: number;
  limit: number;
};

export default function TaskNotificationsPanel() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [expanded, setExpanded] =
    useState(false);
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] =
    useState(true);

  useEffect(() => {
    const params = new URLSearchParams(
      location.search,
    );

    if (params.get("notifications") === "1") {
      setExpanded(true);
    }
  }, [
    location.key,
    location.search,
  ]);

  const queryKey = [
    "tasks",
    "notifications",
    user?.tenantId,
    user?.id,
  ];

  const notificationsQuery = useQuery({
    queryKey: [
      ...queryKey,
      "list",
      page,
      onlyUnread,
    ],
    queryFn: async () => {
      const response = await api.get<{
        data: TaskNotificationsResponse;
      }>("/tasks/notifications", {
        params: {
          page,
          unread: onlyUnread ? "1" : "0",
        },
      });

      return response.data.data;
    },
    enabled: Boolean(user),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
  });

  const readMutation = useMutation({
    mutationFn: (
      notification: TaskNotification | null,
    ) => {
      if (notification) {
        return api.patch(
          "/tasks/notifications/" +
            notification.id +
            "/read",
        );
      }

      return api.patch(
        "/tasks/notifications/read-all",
        {
          before:
            notificationsQuery.data?.asOf,
        },
      );
    },
    onSuccess: async (
      _response,
      notification,
    ) => {
      setPage(1);

      await queryClient.invalidateQueries({
        queryKey,
      });

      if (notification) {
        setExpanded(false);
        navigate(
          "/tasks?task=" +
            notification.taskId,
        );
      }
    },
  });

  const error =
    notificationsQuery.error ||
    readMutation.error;

  return (
    <aside className="task-notices">
      <div className="task-notices-heading">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="task-notices-list"
          onClick={() =>
            setExpanded((value) => !value)
          }
        >
          <Bell size={18} />
          <span>Notifications tâches</span>
          <span className="task-notices-count">
            {notificationsQuery.data
              ?.unreadCount ?? "…"}
          </span>
        </button>

        {expanded &&
          Boolean(
            notificationsQuery.data
              ?.unreadCount,
          ) && (
            <button
              type="button"
              disabled={
                readMutation.isPending
              }
              onClick={() =>
                readMutation.mutate(null)
              }
            >
              <CheckCheck size={17} />
              Tout marquer comme lu
            </button>
          )}
      </div>

      {expanded && (
        <div id="task-notices-list">
          <label className="task-notices-filter">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(event) => {
                setOnlyUnread(
                  event.target.checked,
                );
                setPage(1);
              }}
            />
            Non lues uniquement
          </label>

          {error && (
            <p role="alert">
              {getApiErrorMessage(error)}

              {notificationsQuery.isError && (
                <button
                  type="button"
                  onClick={() =>
                    void notificationsQuery.refetch()
                  }
                >
                  Réessayer
                </button>
              )}
            </p>
          )}

          {notificationsQuery.isPending && (
            <p role="status">
              Chargement des notifications…
            </p>
          )}

          {notificationsQuery.data?.items
            .length === 0 && (
            <p>
              Aucune notification à afficher.
            </p>
          )}

          <ul>
            {notificationsQuery.data?.items.map(
              (notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    disabled={
                      readMutation.isPending
                    }
                    className={
                      notification.readAt
                        ? ""
                        : "is-unread"
                    }
                    onClick={() =>
                      readMutation.mutate(
                        notification,
                      )
                    }
                  >
                    <strong>
                      {notification.kind ===
                      "COMPLETED"
                        ? "Tâche terminée"
                        : "Nouvelle attribution"}
                    </strong>

                    <span>
                      {notification.message}
                    </span>

                    <time
                      dateTime={
                        notification.createdAt
                      }
                    >
                      {new Date(
                        notification.createdAt,
                      ).toLocaleString(
                        "fr-FR",
                      )}
                    </time>
                  </button>
                </li>
              ),
            )}
          </ul>

          {notificationsQuery.data &&
            notificationsQuery.data.total >
              20 && (
              <nav aria-label="Pages des notifications">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() =>
                    setPage(
                      (value) => value - 1,
                    )
                  }
                >
                  Précédent
                </button>

                <span>Page {page}</span>

                <button
                  type="button"
                  disabled={
                    page * 20 >=
                    notificationsQuery.data
                      .total
                  }
                  onClick={() =>
                    setPage(
                      (value) => value + 1,
                    )
                  }
                >
                  Suivant
                </button>
              </nav>
            )}
        </div>
      )}
    </aside>
  );
}