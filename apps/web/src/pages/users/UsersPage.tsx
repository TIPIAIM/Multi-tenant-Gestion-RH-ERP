import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Eye,
  KeyRound,
  Link2,
  LoaderCircle,
  LogOut,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createManagedUser,
  forceLogoutManagedUser,
  getManagedUserStats,
  getManagedUsers,
  resetManagedUserPassword,
  toggleManagedUserStatus,
  updateManagedUser,
  verifyManagedUserEmail,
} from "../../features/users/user-management.api";
import type {
  CreateManagedUserInput,
  ManagedUser,
  UpdateManagedUserInput,
  UserManagementRole,
} from "../../features/users/user-management.types";
import UserDetailsDrawer from "./UserDetailsDrawer";
import UserFormModal from "./UserFormModal";
import UserPasswordResetModal from "./UserPasswordResetModal";
import "./users-page.css";

type Filters = {
  search: string;
  role: "ALL" | UserManagementRole;
  status: "ALL" | "ACTIVE" | "INACTIVE";
  linked: "ALL" | "LINKED" | "UNLINKED";
};

const defaultFilters: Filters = {
  search: "",
  role: "ALL",
  status: "ALL",
  linked: "ALL",
};

const roleLabels: Record<UserManagementRole, string> = {
  TENANT_ADMIN: "Administrateur",
  DIRECTION: "Chef de département",
  RH_MANAGER: "RH",
  SERVICE_MANAGER: "Chef de service",
  AGENT: "Agent",
};

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (error as {
      response?: { data?: { message?: string; error?: string } };
    }).response;

    return (
      response?.data?.message ||
      response?.data?.error ||
      "Une erreur est survenue."
    );
  }

  if (error instanceof Error) return error.message;
  return "Une erreur est survenue.";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UsersPage() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters.role, filters.status, filters.linked]);

  const statsQuery = useQuery({
    queryKey: ["admin-users", "stats"],
    queryFn: getManagedUserStats,
    staleTime: 20_000,
  });

  const usersQuery = useQuery({
    queryKey: [
      "admin-users",
      "list",
      page,
      debouncedSearch,
      filters.role,
      filters.status,
      filters.linked,
    ],
    queryFn: () =>
      getManagedUsers({
        page,
        limit: 15,
        search: debouncedSearch || undefined,
        role: filters.role,
        status: filters.status,
        linked: filters.linked,
        sort: "CREATED_DESC",
      }),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  const createMutation = useMutation({
    mutationFn: createManagedUser,
    onSuccess: async (result) => {
      setTemporaryPassword(result.temporaryPassword ?? null);
      setSelectedUser(result.user);
      setIsFormOpen(false);
      setEditingUser(null);
      await refresh();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateManagedUserInput;
    }) => updateManagedUser(id, input),
    onSuccess: async (user) => {
      setSelectedUser(user);
      setIsFormOpen(false);
      setEditingUser(null);
      await refresh();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleManagedUserStatus({ id, isActive }),
    onSuccess: async () => refresh(),
  });

  const verifyMutation = useMutation({
    mutationFn: verifyManagedUserEmail,
    onSuccess: async () => refresh(),
  });

  const logoutMutation = useMutation({
    mutationFn: forceLogoutManagedUser,
    onSuccess: async () => refresh(),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) =>
      resetManagedUserPassword(id, { password, mustChangePassword: true }),
    onSuccess: async (result) => {
      setTemporaryPassword(result.temporaryPassword);
      setPasswordUser(null);
      setSelectedUser(result.user);
      await refresh();
    },
  });

  const users = usersQuery.data?.items ?? [];
  const pagination = usersQuery.data?.pagination;

  const formError = createMutation.isError
    ? getErrorMessage(createMutation.error)
    : updateMutation.isError
      ? getErrorMessage(updateMutation.error)
      : null;

  const pageError = usersQuery.isError
    ? getErrorMessage(usersQuery.error)
    : statsQuery.isError
      ? getErrorMessage(statsQuery.error)
      : statusMutation.isError
        ? getErrorMessage(statusMutation.error)
        : verifyMutation.isError
          ? getErrorMessage(verifyMutation.error)
          : logoutMutation.isError
            ? getErrorMessage(logoutMutation.error)
            : resetMutation.isError
              ? getErrorMessage(resetMutation.error)
              : null;

  async function saveUser(
    input: CreateManagedUserInput | UpdateManagedUserInput,
  ): Promise<void> {
    if (editingUser) {
      await updateMutation.mutateAsync({
        id: editingUser.id,
        input: input as UpdateManagedUserInput,
      });
      return;
    }

    await createMutation.mutateAsync(input as CreateManagedUserInput);
  }

  return (
    <section className="users-page">
      <header className="users-hero">
        <div>
          <p>ADMINISTRATION</p>
          <h2>Utilisateurs & accès</h2>
          <span>
            Gestion des comptes, rôles, sessions et liaison Agent RH réutilisable.
          </span>
        </div>

        <div className="users-hero-actions">
          <button type="button" onClick={() => void refresh()}>
            <RefreshCw size={18} />
            Actualiser
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingUser(null);
              setIsFormOpen(true);
            }}
          >
            <Plus size={18} />
            Nouvel utilisateur
          </button>
        </div>
      </header>

      {pageError && (
        <div className="users-error">
          <AlertTriangle size={18} />
          {pageError}
        </div>
      )}

      {temporaryPassword && (
        <div className="users-temp-password">
          <strong>Mot de passe temporaire :</strong>
          <code>{temporaryPassword}</code>
          <button type="button" onClick={() => setTemporaryPassword(null)}>
            Fermer
          </button>
        </div>
      )}

      <section className="users-stats-grid">
        <article>
          <UsersRound size={21} />
          <span>Total</span>
          <strong>{statsQuery.data?.total ?? "—"}</strong>
        </article>

        <article>
          <Power size={21} />
          <span>Actifs</span>
          <strong>{statsQuery.data?.active ?? "—"}</strong>
        </article>

        <article>
          <Link2 size={21} />
          <span>Liés à un Agent</span>
          <strong>{statsQuery.data?.linkedToAgent ?? "—"}</strong>
        </article>

        <article>
          <ShieldCheck size={21} />
          <span>Rôles</span>
          <strong>{statsQuery.data?.byRole?.length ?? "—"}</strong>
        </article>
      </section>

      <section className="users-filters-panel">
        <label className="users-search-field">
          <Search size={18} />
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                search: event.target.value,
              }))
            }
            placeholder="Rechercher par nom ou email..."
          />
        </label>

        <select
          value={filters.role}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              role: event.target.value as Filters["role"],
            }))
          }
        >
          <option value="ALL">Tous les rôles</option>
          {Object.entries(roleLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              status: event.target.value as Filters["status"],
            }))
          }
        >
          <option value="ALL">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="INACTIVE">Inactifs</option>
        </select>

        <select
          value={filters.linked}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              linked: event.target.value as Filters["linked"],
            }))
          }
        >
          <option value="ALL">Tous les liens Agent</option>
          <option value="LINKED">Avec Agent lié</option>
          <option value="UNLINKED">Sans Agent lié</option>
        </select>
      </section>

      <section className="users-table-card">
        <header>
          <div>
            <p>REGISTRE DES COMPTES</p>
            <h3>{pagination?.total ?? 0} utilisateur(s)</h3>
          </div>

          {usersQuery.isFetching && (
            <span>
              <LoaderCircle className="is-spinning" size={16} />
              Actualisation...
            </span>
          )}
        </header>

        {usersQuery.isLoading ? (
          <div className="users-empty">
            <LoaderCircle className="is-spinning" size={22} />
            Chargement des utilisateurs...
          </div>
        ) : users.length === 0 ? (
          <div className="users-empty">Aucun utilisateur trouvé.</div>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Agent RH lié</th>
                  <th>Statut</th>
                  <th>Dernière connexion</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((managedUser) => (
                  <tr key={managedUser.id}>
                    <td data-label="Utilisateur">
                      <strong>{managedUser.fullName}</strong>
                      <span>{managedUser.email}</span>
                    </td>

                    <td data-label="Rôle">
                      <span className="users-role-badge">
                        {roleLabels[managedUser.role] ?? managedUser.role}
                      </span>
                    </td>

                    <td data-label="Agent RH lié">
                      {managedUser.linkedAgent ? (
                        <span className="users-agent-badge">
                          {managedUser.linkedAgent.fullName}
                        </span>
                      ) : (
                        <span className="users-muted">Aucun</span>
                      )}
                    </td>

                    <td data-label="Statut">
                      <span
                        className={`users-status ${
                          managedUser.isActive ? "is-active" : "is-inactive"
                        }`}
                      >
                        {managedUser.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>

                    <td data-label="Dernière connexion">
                      {formatDate(managedUser.lastLoginAt)}
                    </td>

                    <td data-label="Actions">
                      <div className="users-actions">
                        <button
                          type="button"
                          title="Voir"
                          onClick={() => setSelectedUser(managedUser)}
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          type="button"
                          title="Modifier"
                          onClick={() => {
                            setEditingUser(managedUser);
                            setIsFormOpen(true);
                          }}
                        >
                          <Edit3 size={16} />
                        </button>

                        {!managedUser.emailVerifiedAt && (
                          <button
                            type="button"
                            title="Vérifier l’email"
                            disabled={verifyMutation.isPending}
                            onClick={() => verifyMutation.mutate(managedUser.id)}
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}

                        <button
                          type="button"
                          title="Réinitialiser mot de passe"
                          onClick={() => setPasswordUser(managedUser)}
                        >
                          <KeyRound size={16} />
                        </button>

                        <button
                          type="button"
                          title="Forcer déconnexion"
                          disabled={logoutMutation.isPending}
                          onClick={() => logoutMutation.mutate(managedUser.id)}
                        >
                          <LogOut size={16} />
                        </button>

                        <button
                          type="button"
                          title={managedUser.isActive ? "Désactiver" : "Activer"}
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            statusMutation.mutate({
                              id: managedUser.id,
                              isActive: !managedUser.isActive,
                            })
                          }
                        >
                          <Power size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(pagination?.totalPages ?? 1) > 1 && (
          <footer className="users-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Précédent
            </button>

            <span>
              Page {pagination?.page} sur {pagination?.totalPages}
            </span>

            <button
              type="button"
              disabled={page >= (pagination?.totalPages ?? 1)}
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination?.totalPages ?? 1, current + 1),
                )
              }
            >
              Suivant
            </button>
          </footer>
        )}
      </section>

      {isFormOpen && (
        <UserFormModal
          user={editingUser}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          errorMessage={formError}
          onClose={() => {
            setIsFormOpen(false);
            setEditingUser(null);
          }}
          onSave={saveUser}
        />
      )}

      {passwordUser && (
        <UserPasswordResetModal
          userName={passwordUser.fullName}
          isSubmitting={resetMutation.isPending}
          errorMessage={resetMutation.isError ? getErrorMessage(resetMutation.error) : null}
          onClose={() => setPasswordUser(null)}
          onConfirm={async (password) => {
            await resetMutation.mutateAsync({ id: passwordUser.id, password });
          }}
        />
      )}

      {selectedUser && (
        <UserDetailsDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </section>
  );
}
