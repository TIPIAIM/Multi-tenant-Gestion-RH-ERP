import { useMemo, useState, type FormEvent } from "react";
import { Link2, LoaderCircle, Plus, Save, Trash2, X } from "lucide-react";
import type { Agent } from "../../features/agents/agent.types";
import type {
  CreateEvaluationInput,
  Evaluation,
  EvaluationEvidenceLink,
  UpdateEvaluationInput,
} from "../../features/evaluations/evaluation.types";
import "./evaluation-page.css";

type EvaluationFormMode = "CREATE" | "EDIT";

type EvaluationFormModalProps = {
  mode: EvaluationFormMode;
  agents: Agent[];
  evaluation?: Evaluation | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (
    input: CreateEvaluationInput | UpdateEvaluationInput,
  ) => Promise<void>;
};

function getDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDefaultPeriod(): {
  start: string;
  end: string;
  year: number;
} {
  const now = new Date();
  const year = now.getFullYear();

  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    year,
  };
}

function formatDateInput(value?: string): string {
  return value ? value.slice(0, 10) : "";
}

function formatAgentDate(value?: string): string {
  if (!value) return "Non renseignée";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default function EvaluationFormModal({
  mode,
  agents,
  evaluation,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: EvaluationFormModalProps) {
  const defaultPeriod = useMemo(getDefaultPeriod, []);

  const [agentId, setAgentId] = useState(
    evaluation?.agentId ?? "",
  );
  const [title, setTitle] = useState(evaluation?.title ?? "");
  const [evaluationYear, setEvaluationYear] = useState(
    String(evaluation?.evaluationYear ?? defaultPeriod.year),
  );
  const [periodStartDate, setPeriodStartDate] = useState(
    formatDateInput(evaluation?.periodStartDate) || defaultPeriod.start,
  );
  const [periodEndDate, setPeriodEndDate] = useState(
    formatDateInput(evaluation?.periodEndDate) || defaultPeriod.end,
  );
  const [confidentialNote, setConfidentialNote] = useState(
    evaluation?.confidentialNote ?? "",
  );
  const [links, setLinks] = useState<EvaluationEvidenceLink[]>(
    evaluation?.evidenceLinks ?? [],
  );
  const [linkDraft, setLinkDraft] = useState<EvaluationEvidenceLink>({
    title: "",
    url: "",
    description: "",
  });
  const [clientError, setClientError] = useState<string | null>(
    null,
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === agentId),
    [agents, agentId],
  );

  const displayedAgent =
    selectedAgent ??
    (evaluation
      ? {
          fullName: evaluation.agentSnapshot.fullName,
          matricule: evaluation.agentSnapshot.matricule,
          jobTitle: evaluation.agentSnapshot.jobTitle,
          contractType: evaluation.agentSnapshot.contractType ?? "—",
          employmentStartDate:
            evaluation.agentSnapshot.employmentStartDate,
          employmentEndDate: evaluation.agentSnapshot.employmentEndDate,
        }
      : null);

  function addLink(): void {
    setClientError(null);

    if (!linkDraft.title.trim() || !linkDraft.url.trim()) {
      setClientError(
        "Le lien probant doit contenir un titre et une URL.",
      );
      return;
    }

    try {
      new URL(linkDraft.url);
    } catch {
      setClientError("L'URL du lien probant est invalide.");
      return;
    }

    setLinks((current) => [
      ...current,
      {
        title: linkDraft.title.trim(),
        url: linkDraft.url.trim(),
        description: linkDraft.description?.trim() || undefined,
      },
    ]);

    setLinkDraft({ title: "", url: "", description: "" });
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setClientError(null);

    if (mode === "CREATE" && !agentId) {
      setClientError("Veuillez sélectionner l’agent évalué.");
      return;
    }

    if (
      new Date(periodEndDate).getTime() <
      new Date(periodStartDate).getTime()
    ) {
      setClientError(
        "La date de fin ne peut pas précéder la date de début.",
      );
      return;
    }

    if (mode === "EDIT") {
      const payload: UpdateEvaluationInput = {
        title: title.trim() || undefined,
        periodStartDate,
        periodEndDate,
        evidenceLinks: links,
        confidentialNote: confidentialNote.trim() || undefined,
      };

      await onSubmit(payload);
      return;
    }

    const payload: CreateEvaluationInput = {
      agentId,
      title: title.trim() || undefined,
      evaluationYear: Number(evaluationYear) || undefined,
      periodStartDate,
      periodEndDate,
      evidenceLinks: links,
      confidentialNote: confidentialNote.trim() || undefined,
    };

    await onSubmit(payload);
  }

  const isEditMode = mode === "EDIT";

  return (
    <div className="evaluation-modal-layer" role="presentation">
      <button
        className="evaluation-modal-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <section
        className="evaluation-modal"
        role="dialog"
        aria-modal="true"
      >
        <header className="evaluation-modal-header">
          <div>
            <p>
              {isEditMode
                ? "MISE À JOUR ÉVALUATION RH"
                : "NOUVELLE ÉVALUATION RH"}
            </p>
            <h3>
              {isEditMode
                ? "Modifier la fiche d’évaluation"
                : "Créer une fiche d’évaluation intelligente"}
            </h3>
          </div>

          <button
            className="evaluation-icon-button"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <X size={20} />
          </button>
        </header>

        {(clientError || errorMessage) && (
          <div className="evaluation-error" role="alert">
            {clientError ?? errorMessage}
          </div>
        )}

        <form className="evaluation-form" onSubmit={handleSubmit}>
          <section className="evaluation-form-section">
            <h4>Cadre de l’évaluation</h4>
            <p>
              Cette fiche est alimentée par les données RH disponibles :
              tâches, pointages, congés, soldes annuels, feuilles de route,
              assiduité et informations administratives de l’agent. La RH conserve la
              maîtrise de l’appréciation finale.
            </p>

            <div className="evaluation-form-grid">
              <label className="evaluation-form-field evaluation-form-field-full">
                <span>Agent évalué</span>
                <select
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  disabled={isSubmitting || isEditMode}
                  required={!isEditMode}
                >
                  <option value="">Sélectionner un agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.fullName} · {agent.matricule} · {agent.jobTitle}
                    </option>
                  ))}
                </select>
              </label>

              {displayedAgent && (
                <article className="evaluation-selected-agent-card evaluation-form-field-full">
                  <div>
                    <span>AGENT ÉVALUÉ</span>
                    <strong>{displayedAgent.fullName}</strong>
                    <p>
                      {displayedAgent.jobTitle} · {displayedAgent.matricule}
                    </p>
                  </div>

                  <div>
                    <small>Contrat</small>
                    <b>{displayedAgent.contractType}</b>
                  </div>

                  <div>
                    <small>Prise de fonction</small>
                    <b>{formatAgentDate(displayedAgent.employmentStartDate)}</b>
                  </div>

                  <div>
                    <small>Date de fin éventuelle</small>
                    <b>{formatAgentDate(displayedAgent.employmentEndDate)}</b>
                  </div>
                </article>
              )}

              <label className="evaluation-form-field evaluation-form-field-full">
                <span>Intitulé de l’évaluation</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex. Évaluation annuelle de performance 2026"
                  disabled={isSubmitting}
                />
              </label>

              <label className="evaluation-form-field">
                <span>Année d’évaluation</span>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={evaluationYear}
                  onChange={(event) =>
                    setEvaluationYear(event.target.value)
                  }
                  disabled={isSubmitting || isEditMode}
                />
              </label>

              <label className="evaluation-form-field">
                <span>Date de début</span>
                <input
                  type="date"
                  value={periodStartDate}
                  onChange={(event) =>
                    setPeriodStartDate(
                      event.target.value || getDateKey(new Date()),
                    )
                  }
                  disabled={isSubmitting}
                  required
                />
              </label>

              <label className="evaluation-form-field">
                <span>Date de fin</span>
                <input
                  type="date"
                  min={periodStartDate}
                  value={periodEndDate}
                  onChange={(event) =>
                    setPeriodEndDate(event.target.value)
                  }
                  disabled={isSubmitting}
                  required
                />
              </label>
            </div>
          </section>

          <section className="evaluation-form-section">
            <h4>Liens probants et pièces de référence</h4>
            <p>
              Ajoutez les liens utiles : feuille de route, rapport
              d’activité, document justificatif, tableau de tâches, compte
              rendu ou support de performance.
            </p>

            <div className="evaluation-link-builder">
              <input
                value={linkDraft.title}
                onChange={(event) =>
                  setLinkDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Titre du lien"
                disabled={isSubmitting}
              />
              <input
                value={linkDraft.url}
                onChange={(event) =>
                  setLinkDraft((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
                placeholder="https://..."
                disabled={isSubmitting}
              />
              <input
                value={linkDraft.description ?? ""}
                onChange={(event) =>
                  setLinkDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Description facultative"
                disabled={isSubmitting}
              />
              <button
                className="evaluation-secondary-button"
                type="button"
                onClick={addLink}
                disabled={isSubmitting}
              >
                <Link2 size={16} />
                Ajouter le lien
              </button>
            </div>

            {links.length > 0 && (
              <div className="evaluation-links-list">
                {links.map((link, index) => (
                  <article key={`${link.url}-${index}`}>
                    <div>
                      <strong>{link.title}</strong>
                      <span>{link.url}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setLinks((current) =>
                          current.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        )
                      }
                      disabled={isSubmitting}
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="evaluation-form-section">
            <h4>Note confidentielle RH</h4>
            <textarea
              value={confidentialNote}
              onChange={(event) =>
                setConfidentialNote(event.target.value)
              }
              rows={3}
              placeholder="Observation interne non destinée à remplacer l’appréciation officielle..."
              disabled={isSubmitting}
            />
          </section>

          <footer className="evaluation-modal-footer">
            <button
              className="evaluation-cancel-button"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              className="evaluation-primary-button"
              type="submit"
              disabled={isSubmitting || (!isEditMode && !agentId)}
            >
              {isSubmitting ? (
                <LoaderCircle size={18} className="is-spinning" />
              ) : isEditMode ? (
                <Save size={18} />
              ) : (
                <Plus size={18} />
              )}
              <span>
                {isSubmitting
                  ? "Enregistrement..."
                  : isEditMode
                    ? "Enregistrer les modifications"
                    : "Créer l’évaluation"}
              </span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
