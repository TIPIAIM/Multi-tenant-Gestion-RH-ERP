import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  getAgentOptionsForUserLink,
} from "../../features/users/user-management.api";
import type {
  CreateManagedUserInput,
  ManagedUser,
  UpdateManagedUserInput,
  UserManagementRole,
} from "../../features/users/user-management.types";
import { userManagementRoles } from "../../features/users/user-management.types";

type FormState = {
  fullName: string;
  email: string;
  role: UserManagementRole;
  agentId: string;
  password: string;
  isActive: boolean;
  mustChangePassword: boolean;
};

type Props = {
  user?: ManagedUser | null;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSave: (
    input: CreateManagedUserInput | UpdateManagedUserInput,
  ) => Promise<void>;
};

const roleLabels: Record<UserManagementRole, string> = {
  TENANT_ADMIN: "Administrateur",
  DIRECTION: "Chef de département",
  RH_MANAGER: "RH",
  SERVICE_MANAGER: "Chef de service",
  AGENT: "Agent",
};

function buildInitialState(user?: ManagedUser | null): FormState {
  return {
    fullName: user?.fullName ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "AGENT",
    agentId: user?.agentId ?? user?.linkedAgent?.id ?? "",
    password: "",
    isActive: user?.isActive ?? true,
    mustChangePassword: user?.mustChangePassword ?? true,
  };
}

export default function UserFormModal({
  user,
  isSubmitting = false,
  errorMessage,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(user));
  const [clientError, setClientError] = useState<string | null>(null);

  const isEdition = Boolean(user);

  useEffect(() => {
    setForm(buildInitialState(user));
    setClientError(null);
  }, [user]);

  const agentsQuery = useQuery({
    queryKey: ["users", "agent-options"],
    queryFn: getAgentOptionsForUserLink,
    staleTime: 60_000,
  });

  const selectedAgent = useMemo(
    () => agentsQuery.data?.find((agent) => agent.id === form.agentId),
    [agentsQuery.data, form.agentId],
  );

  function updateField<K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ): void {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submit(): Promise<void> {
    setClientError(null);

    if (form.fullName.trim().length < 2) {
      setClientError("Le nom complet est obligatoire.");
      return;
    }

    if (!form.email.includes("@")) {
      setClientError("L’adresse email est invalide.");
      return;
    }

    if (!isEdition && form.password && form.password.length < 8) {
      setClientError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    const payload: CreateManagedUserInput | UpdateManagedUserInput = {
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      agentId: form.agentId || null,
      isActive: form.isActive,
      mustChangePassword: form.mustChangePassword,
    };

    if (!isEdition && form.password.trim()) {
      (payload as CreateManagedUserInput).password = form.password.trim();
    }

    await onSave(payload);
  }

  return (
    <div className="users-modal-layer">
      <button
        className="users-modal-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <section className="users-modal" role="dialog" aria-modal="true">
        <header className="users-modal-header">
          <div>
            <p>{isEdition ? "MODIFICATION" : "NOUVEAU COMPTE"}</p>
            <h3>{isEdition ? "Modifier l’utilisateur" : "Créer un utilisateur"}</h3>
          </div>

          <button type="button" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        {(clientError || errorMessage) && (
          <div className="users-error">{clientError || errorMessage}</div>
        )}

        <div className="users-form-grid">
          <label>
            <span>Nom complet</span>
            <input
              value={form.fullName}
              onChange={(event) => updateField("fullName", event.target.value)}
              placeholder="Ex. Mamadou Diallo"
            />
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="nom@g.gov.gn"
            />
          </label>

          <label>
            <span>Rôle</span>
            <select
              value={form.role}
              onChange={(event) =>
                updateField("role", event.target.value as UserManagementRole)
              }
            >
              {userManagementRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Agent RH lié</span>
            <select
              value={form.agentId}
              onChange={(event) => updateField("agentId", event.target.value)}
              disabled={agentsQuery.isLoading}
            >
              <option value="">Aucun Agent lié</option>

              {agentsQuery.data?.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.fullName}
                  {agent.matricule ? ` · ${agent.matricule}` : ""}
                </option>
              ))}
            </select>

            <small>
              {agentsQuery.isLoading
                ? "Chargement des Agents actifs..."
                : agentsQuery.isError
                  ? "Impossible de charger la liste des Agents. Vérifiez /admin-users/options/agents."
                  : (agentsQuery.data?.length ?? 0) === 0
                    ? "Aucun Agent actif trouvé."
                    : "Le même Agent peut être affecté à plusieurs comptes utilisateurs."}
            </small>
          </label>

          {!isEdition && (
            <label>
              <span>Mot de passe initial facultatif</span>
              <input
                type="text"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                placeholder="Laisser vide pour générer automatiquement"
              />
            </label>
          )}

          <label className="users-checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => updateField("isActive", event.target.checked)}
            />
            <span>Compte actif</span>
          </label>

          <label className="users-checkbox">
            <input
              type="checkbox"
              checked={form.mustChangePassword}
              onChange={(event) =>
                updateField("mustChangePassword", event.target.checked)
              }
            />
            <span>Changer le mot de passe à la prochaine connexion</span>
          </label>
        </div>

        {selectedAgent && (
          <div className="users-agent-preview">
            <strong>{selectedAgent.fullName}</strong>
            <span>
              {selectedAgent.directionName || "Direction non renseignée"}
              {selectedAgent.serviceName ? ` · ${selectedAgent.serviceName}` : ""}
            </span>
          </div>
        )}

        <footer className="users-modal-actions">
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button type="button" disabled={isSubmitting} onClick={() => void submit()}>
            {isSubmitting && <LoaderCircle className="is-spinning" size={16} />}
            {isEdition ? "Enregistrer" : "Créer le compte"}
          </button>
        </footer>
      </section>
    </div>
  );
}
