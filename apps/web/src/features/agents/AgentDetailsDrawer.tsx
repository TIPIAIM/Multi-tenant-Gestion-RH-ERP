import AgentDocumentsPanel from "./AgentDocumentsPanel";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  BriefcaseBusiness,
  
  FileText,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  
  UserRound,
  X,
} from "lucide-react";
import type {
  AddAgentHistoryInput,
  Agent,
  AgentContractType,
  AgentEmploymentStatus,
  AgentHistoryEventType,
} from "./agent.types";
type AgentDetailsDrawerProps = {
  agent?: Agent;
  isLoading: boolean;
  canManageAgents: boolean;
  isAddingHistory: boolean;
  historyError: string | null;
  getDirectionName: (directionId: string) => string;
  getServiceName: (serviceId: string | null) => string;
  getSupervisorName: (supervisorAgentId: string | null) => string;
  onClose: () => void;
  onEdit: (agent: Agent) => void;
  onAddHistory: (input: AddAgentHistoryInput) => Promise<void>;
};

const statusLabels: Record<AgentEmploymentStatus, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  ON_LEAVE: "En congé",
  SUSPENDED: "Suspendu",
  LEFT: "Sorti",
};

const contractLabels: Record<AgentContractType, string> = {
  PERMANENT: "CDI",
  FIXED_TERM: "CDD",
  INTERNSHIP: "Stage",
  CONSULTING: "Consultance",
  SECONDMENT: "Mise à disposition",
  OTHER: "Autre statut",
};

const historyLabels: Record<AgentHistoryEventType, string> = {
  CREATED: "Création du dossier",
  PROMOTION: "Promotion",
  SANCTION: "Sanction",
  MUTATION: "Mutation",
  TRAINING: "Formation",
  OBSERVATION: "Observation",
  OTHER: "Autre événement",
};

function formatDate(value?: string): string {
  if (!value) {
    return "Non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getInitials(fullName: string): string {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item.charAt(0).toUpperCase())
      .join("") || "A"
  );
}

function getTodayDate(): string {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function AgentDetailsDrawer({
  agent,
  isLoading,
  canManageAgents,
  isAddingHistory,
  historyError,
  getDirectionName,
  getServiceName,
  getSupervisorName,
  onClose,
  onEdit,
  onAddHistory,
}: AgentDetailsDrawerProps) {
  const [isHistoryFormOpen, setIsHistoryFormOpen] = useState(false);

  const [historyForm, setHistoryForm] = useState<AddAgentHistoryInput>({
    eventType: "OBSERVATION",
    eventDate: getTodayDate(),
    description: "",
    note: "",
  });

  useEffect(() => {
    setIsHistoryFormOpen(false);

    setHistoryForm({
      eventType: "OBSERVATION",
      eventDate: getTodayDate(),
      description: "",
      note: "",
    });
  }, [agent?.id]);

  const history = useMemo(
    () =>
      [...(agent?.history ?? [])].sort(
        (first, second) =>
          new Date(second.eventDate).getTime() -
          new Date(first.eventDate).getTime()
      ),
    [agent?.history]
  );

  function handleHistoryChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ): void {
    const { name, value } = event.target;

    setHistoryForm((currentValue) => ({
      ...currentValue,
      [name]: value,
    }));
  }

  async function handleAddHistory(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    try {
      await onAddHistory({
        ...historyForm,
        description: historyForm.description.trim(),
        note: historyForm.note?.trim() || undefined,
      });

      setHistoryForm({
        eventType: "OBSERVATION",
        eventDate: getTodayDate(),
        description: "",
        note: "",
      });

      setIsHistoryFormOpen(false);
    } catch {
      // L'erreur reste affichée dans le drawer.
    }
  }

  return (
    <div className="agent-drawer-layer" role="presentation">
      <button
        className="agent-drawer-backdrop"
        type="button"
        aria-label="Fermer les détails"
        onClick={onClose}
      />

      <aside
        className="agent-details-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Détails de l'agent"
      >
        <header className="agent-drawer-header">
          <div>
            <p>DOSSIER AGENT</p>
            <h3>Détails et suivi administratif</h3>
          </div>

          <button
            className="agent-icon-button"
            type="button"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        {isLoading && (
          <div className="agent-drawer-loading">
            <LoaderCircle size={24} className="is-spinning" />
            <span>Chargement du dossier agent...</span>
          </div>
        )}

        {!isLoading && agent && (
          <>
            <section className="agent-drawer-identity">
              <span className="agent-drawer-avatar">
                {getInitials(agent.fullName)}
              </span>

              <div>
                <span className="agent-status-label">
                  {statusLabels[agent.employmentStatus]}
                </span>

                <h4>{agent.fullName}</h4>

                <p>
                  {agent.jobTitle} · {agent.matricule}
                </p>
              </div>

              {canManageAgents && (
                <button
                  className="agent-drawer-edit-button"
                  type="button"
                  onClick={() => onEdit(agent)}
                >
                  <Pencil size={16} />
                  <span>Modifier</span>
                </button>
              )}
            </section>

            <section className="agent-drawer-section">
              <div className="agent-drawer-section-heading">
                <UserRound size={18} />
                <h5>Identité et contact</h5>
              </div>

              <dl className="agent-detail-list">
                <div>
                  <dt>Matricule</dt>
                  <dd>{agent.matricule}</dd>
                </div>

                <div>
                  <dt>Téléphone</dt>
                  <dd>{agent.phone}</dd>
                </div>

                <div>
                  <dt>Email</dt>
                  <dd>{agent.email || "Non renseigné"}</dd>
                </div>

                <div>
                  <dt>Adresse</dt>
                  <dd>{agent.address || "Non renseignée"}</dd>
                </div>
              </dl>
            </section>

            <section className="agent-drawer-section">
              <div className="agent-drawer-section-heading">
                <BriefcaseBusiness size={18} />
                <h5>Situation professionnelle</h5>
              </div>

              <dl className="agent-detail-list">
                <div>
                  <dt>Direction</dt>
                  <dd>{getDirectionName(agent.directionId)}</dd>
                </div>

                <div>
                  <dt>Service</dt>
                  <dd>{getServiceName(agent.serviceId)}</dd>
                </div>

                <div>
                  <dt>Supérieur hiérarchique</dt>
                  <dd>{getSupervisorName(agent.supervisorAgentId)}</dd>
                </div>

                <div>
                  <dt>Grade</dt>
                  <dd>{agent.grade || "Non renseigné"}</dd>
                </div>

                <div>
                  <dt>Contrat</dt>
                  <dd>{contractLabels[agent.contractType]}</dd>
                </div>

                <div>
                  <dt>Prise de fonction</dt>
                  <dd>{formatDate(agent.employmentStartDate)}</dd>
                </div>

                <div>
                  <dt>Date de fin éventuelle</dt>
                  <dd>{formatDate(agent.employmentEndDate)}</dd>
                </div>
              </dl>
            </section>

            <section className="agent-drawer-section">
              <div className="agent-drawer-section-heading">
                <FileText size={18} />
                <h5>Documents RH sécurisés</h5>
              </div>

              <AgentDocumentsPanel
                agentId={agent.id}
                canManageAgents={canManageAgents}
              />
            </section>


            <section className="agent-drawer-section">
              <div className="agent-drawer-section-heading history-heading">
                <div>
                  <History size={18} />
                  <h5>Historique administratif</h5>
                </div>

                {canManageAgents && (
                  <button
                    className="agent-history-add-button"
                    type="button"
                    onClick={() =>
                      setIsHistoryFormOpen((currentValue) => !currentValue)
                    }
                  >
                    <Plus size={15} />
                    <span>Événement</span>
                  </button>
                )}
              </div>

              {isHistoryFormOpen && (
                <form
                  className="agent-history-form"
                  onSubmit={handleAddHistory}
                >
                  {historyError && (
                    <div className="agent-form-error">
                      <span>{historyError}</span>
                    </div>
                  )}

                  <label className="agent-form-field">
                    <span>Type d’événement</span>
                    <select
                      name="eventType"
                      value={historyForm.eventType}
                      onChange={handleHistoryChange}
                      disabled={isAddingHistory}
                    >
                      {Object.entries(historyLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="agent-form-field">
                    <span>Date</span>
                    <input
                      name="eventDate"
                      type="date"
                      value={historyForm.eventDate}
                      onChange={handleHistoryChange}
                      disabled={isAddingHistory}
                      required
                    />
                  </label>

                  <label className="agent-form-field">
                    <span>Description</span>
                    <textarea
                      name="description"
                      rows={3}
                      value={historyForm.description}
                      onChange={handleHistoryChange}
                      placeholder="Décrivez l'événement..."
                      disabled={isAddingHistory}
                      required
                    />
                  </label>

                  <label className="agent-form-field">
                    <span>Note complémentaire</span>
                    <textarea
                      name="note"
                      rows={2}
                      value={historyForm.note}
                      onChange={handleHistoryChange}
                      placeholder="Information facultative..."
                      disabled={isAddingHistory}
                    />
                  </label>

                  <button
                    className="agent-primary-button"
                    type="submit"
                    disabled={
                      isAddingHistory || !historyForm.description.trim()
                    }
                  >
                    {isAddingHistory ? (
                      <>
                        <LoaderCircle size={17} className="is-spinning" />
                        <span>Ajout...</span>
                      </>
                    ) : (
                      <span>Ajouter à l’historique</span>
                    )}
                  </button>
                </form>
              )}

              {history.length === 0 ? (
                <p className="agent-history-empty">
                  Aucun événement administratif enregistré.
                </p>
              ) : (
                <div className="agent-history-timeline">
                  {history.map((entry, index) => (
                    <article
                      key={`${entry.eventDate}-${index}`}
                      className="agent-history-item"
                    >
                      <span className="agent-history-marker" />

                      <div>
                        <div className="agent-history-item-top">
                          <strong>{historyLabels[entry.eventType]}</strong>

                          <span>{formatDate(entry.eventDate)}</span>
                        </div>

                        <p>{entry.description}</p>

                        {entry.note && <small>{entry.note}</small>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
