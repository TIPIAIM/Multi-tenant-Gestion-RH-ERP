import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, X } from "lucide-react";
import {
  getManagedUserActivities,
  getManagedUserSessions,
} from "../../features/users/user-management.api";
import type { ManagedUser } from "../../features/users/user-management.types";

type Props = {
  user: ManagedUser;
  onClose: () => void;
};

const roleLabels: Record<string, string> = {
  TENANT_ADMIN: "Administrateur",
  DIRECTION: "Chef de département",
  RH_MANAGER: "RH",
  SERVICE_MANAGER: "Chef de service",
  AGENT: "Agent",
};

function formatDate(value?: string | null): string {
  if (!value) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UserDetailsDrawer({ user, onClose }: Props) {
  const sessionsQuery = useQuery({
    queryKey: ["admin-users", user.id, "sessions"],
    queryFn: () => getManagedUserSessions(user.id),
    staleTime: 20_000,
  });

  const activitiesQuery = useQuery({
    queryKey: ["admin-users", user.id, "activities"],
    queryFn: () => getManagedUserActivities(user.id),
    staleTime: 20_000,
  });

  return (
    <div className="users-drawer-layer">
      <button
        className="users-drawer-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <aside className="users-drawer" role="dialog" aria-modal="true">
        <header className="users-drawer-header">
          <div>
            <p>PROFIL UTILISATEUR</p>
            <h3>{user.fullName}</h3>
            <span>{user.email}</span>
          </div>

          <button type="button" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        <section className="users-detail-grid">
          <article>
            <span>Rôle</span>
            <strong>{roleLabels[user.role] ?? user.role}</strong>
          </article>

          <article>
            <span>Statut</span>
            <strong>{user.isActive ? "Actif" : "Inactif"}</strong>
          </article>

          <article>
            <span>Email vérifié</span>
            <strong>{user.emailVerifiedAt ? "Oui" : "Non"}</strong>
          </article>

          <article>
            <span>Dernière connexion</span>
            <strong>{formatDate(user.lastLoginAt)}</strong>
          </article>
        </section>

        <section className="users-drawer-section">
          <h4>Agent RH lié</h4>

          {user.linkedAgent ? (
            <div className="users-linked-agent-card">
              <strong>{user.linkedAgent.fullName}</strong>
              <span>
                {user.linkedAgent.matricule ? `${user.linkedAgent.matricule} · ` : ""}
                {user.linkedAgent.directionName || "Direction non renseignée"}
                {user.linkedAgent.serviceName ? ` · ${user.linkedAgent.serviceName}` : ""}
              </span>
              <small>
                Cette liaison est réutilisable : le même Agent peut être affecté à plusieurs comptes.
              </small>
            </div>
          ) : (
            <p className="users-muted">Aucun Agent RH lié à ce compte.</p>
          )}
        </section>

        <section className="users-drawer-section">
          <h4>Sessions</h4>

          {sessionsQuery.isLoading && (
            <div className="users-inline-loader">
              <LoaderCircle className="is-spinning" size={17} />
              Chargement...
            </div>
          )}

          <div className="users-session-list">
            {sessionsQuery.data?.map((session) => (
              <article key={session.id}>
                <strong>{session.isRevoked ? "Révoquée" : "Active / historique"}</strong>
                <span>{formatDate(session.createdAt)}</span>
                <small>{session.ip || "IP non disponible"}</small>
              </article>
            ))}

            {!sessionsQuery.isLoading && sessionsQuery.data?.length === 0 && (
              <p className="users-muted">Aucune session récente.</p>
            )}
          </div>
        </section>

        <section className="users-drawer-section">
          <h4>Historique administratif</h4>

          {activitiesQuery.isLoading && (
            <div className="users-inline-loader">
              <LoaderCircle className="is-spinning" size={17} />
              Chargement...
            </div>
          )}

          <div className="users-activity-list">
            {activitiesQuery.data?.map((activity) => (
              <article key={activity.id}>
                <span />
                <div>
                  <strong>{activity.message}</strong>
                  <small>
                    {activity.actorName} · {formatDate(activity.createdAt)}
                  </small>
                </div>
              </article>
            ))}

            {!activitiesQuery.isLoading && activitiesQuery.data?.length === 0 && (
              <p className="users-muted">Aucune activité enregistrée.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
