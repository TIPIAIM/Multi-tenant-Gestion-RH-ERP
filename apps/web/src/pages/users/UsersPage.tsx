import { getApiErrorMessage } from "../../features/auth/auth.api";
import { lazy, Suspense, useEffect, useState } from "react";
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
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createManagedUser,
  deleteManagedUser,
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
const UserDetailsDrawer = lazy(() => import("./UserDetailsDrawer"));
const UserFormModal = lazy(() => import("./UserFormModal"));
const UserPasswordResetModal = lazy(() => import("./UserPasswordResetModal"));
import "./users-page.css";
import "./users-ui.css";
import { useAuth } from "../../features/auth/auth.context";
import { useUserDialog } from "./use-user-dialog";

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

const getErrorMessage = getApiErrorMessage;

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
      setPage(1);
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

  const deleteMutation = useMutation({
    mutationFn: deleteManagedUser,
    onSuccess: async (_, id) => {
      setUserToDelete(null);
      if (selectedUser?.id === id) setSelectedUser(null);
      if (passwordUser?.id === id) setPasswordUser(null);
      setPage(1);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["agents"] }),
        queryClient.invalidateQueries({ queryKey: ["agent"] }),
      ]);
    },
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

  useUserDialog(
    deleteMutation.isPending,
    () => setUserToDelete(null),
    ".users-delete-modal",
    Boolean(userToDelete),
  );

  return (
    <section className="users-page">
      <header className="users-hero">
        <div>
          <p>ADMINISTRATION</p>
          <h2>
            Utilisateurs <span>et accès</span>
          </h2>
        </div>

        <div className="users-hero-actions">
          <button
            type="button"
            onClick={() => void refresh()}
            className="users-header-icon-button"
            aria-label="Actualiser les utilisateurs"
            title="Actualiser les utilisateurs"
          >
            <RefreshCw size={20} aria-hidden="true" />
            <span>Actualiser</span>
          </button>

          <button
            type="button"
            className="users-header-icon-button"
            aria-label="Nouvel utilisateur"
            title="Nouvel utilisateur"
            onClick={() => {
              setEditingUser(null);
              setIsFormOpen(true);
            }}
          >
            <Plus size={20} aria-hidden="true" />
            <span>Nouvel utilisateur</span>
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
          <span className="users-search-label">Rechercher</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            autoComplete="off"
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

        <label className="users-filter-field">
          <span>Rôle</span>
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
        </label>

        <label className="users-filter-field">
          <span>Statut</span>
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
        </label>

        <label className="users-filter-field">
          <span>Dossier agent</span>
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
        </label>
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
          <>
            <p className="users-table-scroll-hint">
              Faites défiler le tableau horizontalement pour accéder à toutes
              les colonnes.
            </p>
            <div
              className="users-table-wrap"
              role="region"
              aria-label="Registre des utilisateurs"
              tabIndex={0}
            >
              <table className="users-table">
                <caption className="users-table-caption">
                  Comptes utilisateurs et accès
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Utilisateur</th>
                    <th scope="col">Rôle</th>
                    <th scope="col">Dossier agent associé</th>
                    <th scope="col">Statut</th>
                    <th scope="col">Dernière connexion</th>
                    <th scope="col">Actions</th>
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
                            className="users-view-button"
                            title="Consulter le compte"
                            onClick={() => setSelectedUser(managedUser)}
                            aria-label={`Consulter le compte de ${managedUser.fullName}`}
                          >
                            <Eye size={20} aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            title="Modifier"
                            onClick={() => {
                              setEditingUser(managedUser);
                              setIsFormOpen(true);
                            }}
                            aria-label={`Modifier le compte de ${managedUser.fullName}`}
                          >
                            <Edit3 size={16} />
                          </button>

                          {!managedUser.emailVerifiedAt && (
                            <button
                              type="button"
                              title="Vérifier l’email"
                              disabled={verifyMutation.isPending}
                              onClick={() =>
                                verifyMutation.mutate(managedUser.id)
                              }
                              aria-label="Vérifier l’email"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          )}

                          <button
                            type="button"
                            title="Réinitialiser mot de passe"
                            onClick={() => setPasswordUser(managedUser)}
                            aria-label={`Réinitialiser le mot de passe de ${managedUser.fullName}`}
                          >
                            <KeyRound size={16} />
                          </button>

                          <button
                            type="button"
                            title="Forcer déconnexion"
                            disabled={logoutMutation.isPending}
                            onClick={() =>
                              logoutMutation.mutate(managedUser.id)
                            }
                            aria-label={`Déconnecter les sessions de ${managedUser.fullName}`}
                          >
                            <LogOut size={16} />
                          </button>

                          <button
                            type="button"
                            title={
                              managedUser.isActive ? "Désactiver" : "Activer"
                            }
                            disabled={statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({
                                id: managedUser.id,
                                isActive: !managedUser.isActive,
                              })
                            }
                            aria-label={
                              managedUser.isActive ? "Désactiver" : "Activer"
                            }
                          >
                            <Power size={16} />
                          </button>
                          {currentUser?.role === "TENANT_ADMIN" &&
                            managedUser.id !== currentUser.id && (
                              <button
                                type="button"
                                className="users-delete-trigger"
                                aria-label={`Supprimer ${managedUser.fullName}`}
                                disabled={
                                  deleteMutation.isPending ||
                                  (managedUser.role === "TENANT_ADMIN" &&
                                    managedUser.isActive)
                                }
                                title={
                                  managedUser.role === "TENANT_ADMIN" &&
                                  managedUser.isActive
                                    ? "Désactivez cet administrateur avant de le supprimer."
                                    : "Supprimer ce compte"
                                }
                                onClick={() => {
                                  deleteMutation.reset();
                                  setUserToDelete(managedUser);
                                }}
                              >
                                <Trash2 size={17} />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
        <Suspense
          fallback={
            <div className="users-dialog-loading" role="status">
              Chargement de la fenêtre…
            </div>
          }
        >
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
        </Suspense>
      )}

      {passwordUser && (
        <Suspense
          fallback={
            <div className="users-dialog-loading" role="status">
              Chargement de la fenêtre…
            </div>
          }
        >
          <UserPasswordResetModal
            userName={passwordUser.fullName}
            isSubmitting={resetMutation.isPending}
            errorMessage={
              resetMutation.isError
                ? getErrorMessage(resetMutation.error)
                : null
            }
            onClose={() => setPasswordUser(null)}
            onConfirm={async (password) => {
              await resetMutation.mutateAsync({
                id: passwordUser.id,
                password,
              });
            }}
          />
        </Suspense>
      )}

      {selectedUser && (
        <Suspense
          fallback={
            <div className="users-dialog-loading" role="status">
              Chargement de la fenêtre…
            </div>
          }
        >
          <UserDetailsDrawer
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
          />
        </Suspense>
      )}

      {userToDelete && (
        <div className="users-modal-layer">
          <button
            type="button"
            className="users-modal-backdrop"
            aria-label="Fermer la confirmation"
            disabled={deleteMutation.isPending}
            onClick={() => setUserToDelete(null)}
          />
          <section
            className="users-modal users-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="users-delete-title"
          >
            <header className="users-modal-header">
              <div>
                <p>SUPPRESSION DU COMPTE</p>
                <h3 id="users-delete-title">Supprimer cet utilisateur ?</h3>
              </div>
            </header>
            <p className="users-delete-identity">
              <strong>{userToDelete.fullName}</strong>
              <br />
              {userToDelete.email}
            </p>
            <p>
              Ce compte sera supprimé et ses sessions seront révoquées. La fiche
              RH de l’agent lié et les historiques seront conservés. Cette
              action est irréversible.
            </p>
            {deleteMutation.isError && (
              <div className="users-alert" role="alert">
                {getErrorMessage(deleteMutation.error)}
              </div>
            )}
            <footer className="users-modal-footer">
              <button
                type="button"
                className="users-cancel-button"
                disabled={deleteMutation.isPending}
                onClick={() => setUserToDelete(null)}
              >
                Conserver le compte
              </button>
              <button
                type="button"
                className="users-danger-button"
                disabled={deleteMutation.isPending}
                aria-busy={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(userToDelete.id)}
              >
                {deleteMutation.isPending ? (
                  <LoaderCircle size={18} className="is-spinning" />
                ) : (
                  <Trash2 size={18} />
                )}
                Supprimer le compte
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
