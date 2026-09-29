import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEventHandler,
} from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  FileText,
  Hash,
  LoaderCircle,
  Plus,
  Tags,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { Agent } from "../../features/agents/agent.types";
import type {
  CreateTaskInput,
  Task,
  TaskKpiDefinitionInput,
  TaskKpiKind,
  TaskPriority,
  TaskStatus,
} from "../../features/tasks/task.types";
import type {
  OrganizationTreeDirection,
} from "../../features/organisation/organisation.types";
import "./task-kpi.css";

type AgentWithOrg = Agent & {
  directionId?: string | null;
  serviceId?: string | null;
  userId?: string | null;
  jobTitle?: string | null;
};

type TaskFormModalProps = {
  task?: Task | null;
  directions: OrganizationTreeDirection[];
  agents: AgentWithOrg[];
  currentUserRole?: string;
  currentAgentDirectionId?: string | null;
  currentAgentServiceId?: string | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (
    input: CreateTaskInput,
  ) => Promise<void>;
};

type TaskFormState = {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  progressPercentage: string;
  startDate: string;
  dueDate: string;
  directionId: string;
  serviceId: string;
  assignedToAgentId: string;
  tagsText: string;
  kpis: TaskKpiDefinitionInput[];
};

const priorityLabels: Record<TaskPriority, string> = {
  LOW: "Faible",
  MEDIUM: "Normale",
  HIGH: "Élevée",
  CRITICAL: "Critique",
};

const statusLabels: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloquée",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

const kpiKindLabels: Record<TaskKpiKind, string> = {
  FILE: "Fichier / pièce justificative",
  NUMBER: "Valeur chiffrée",
  TEXT: "Texte / compte rendu",
};

function formatDateInput(value?: string): string {
  return value ? value.slice(0, 10) : "";
}

function sameId(
  first?: string | null,
  second?: string | null,
): boolean {
  return Boolean(
    first &&
      second &&
      String(first) === String(second),
  );
}

function createEmptyKpi(): TaskKpiDefinitionInput {
  return {
    label: "",
    kind: "FILE",
    required: true,
    instructions: "",
  };
}

function buildInitialState(input: {
  task?: Task | null;
  isServiceManager: boolean;
  isDirection: boolean;
  currentAgentDirectionId?: string | null;
  currentAgentServiceId?: string | null;
}): TaskFormState {
  const {
    task,
    isServiceManager,
    isDirection,
    currentAgentDirectionId,
    currentAgentServiceId,
  } = input;

  const shouldUseCurrentDirection =
    isServiceManager || isDirection;

  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    priority: task?.priority ?? "MEDIUM",
    status: task?.status ?? "TODO",
    progressPercentage: String(
      task?.progressPercentage ?? 0,
    ),
    startDate: formatDateInput(task?.startDate),
    dueDate: formatDateInput(task?.dueDate),
    directionId: shouldUseCurrentDirection
      ? currentAgentDirectionId ??
        task?.directionId ??
        ""
      : task?.directionId ?? "",
    serviceId: isServiceManager
      ? currentAgentServiceId ??
        task?.serviceId ??
        ""
      : task?.serviceId ?? "",
    assignedToAgentId:
      task?.assignedToAgentId ?? "",
    tagsText: task?.tags.join(", ") ?? "",
    kpis:
      task?.kpis.map((kpi) => ({
        id: kpi.id,
        label: kpi.label,
        kind: kpi.kind,
        required: kpi.required,
        instructions: kpi.instructions,
        targetNumber: kpi.targetNumber,
        unit: kpi.unit,
      })) ?? [],
  };
}

export default function TaskFormModal({
  task,
  directions,
  agents,
  currentUserRole,
  currentAgentDirectionId,
  currentAgentServiceId,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: TaskFormModalProps) {
  const isServiceManager =
    currentUserRole === "SERVICE_MANAGER";

  const isDirection =
    currentUserRole === "DIRECTION";

  const shouldLockDirection =
    (isServiceManager || isDirection) &&
    Boolean(currentAgentDirectionId);

  const shouldLockService =
    isServiceManager &&
    Boolean(currentAgentDirectionId) &&
    Boolean(currentAgentServiceId);

  const [formState, setFormState] =
    useState<TaskFormState>(() =>
      buildInitialState({
        task,
        isServiceManager,
        isDirection,
        currentAgentDirectionId,
        currentAgentServiceId,
      }),
    );

  useEffect(() => {
    if (!shouldLockDirection) return;

    setFormState((currentValue) => {
      const nextDirectionId =
        currentAgentDirectionId ?? "";

      const nextServiceId = shouldLockService
        ? currentAgentServiceId ?? ""
        : currentValue.serviceId;

      if (
        currentValue.directionId ===
          nextDirectionId &&
        currentValue.serviceId === nextServiceId
      ) {
        return currentValue;
      }

      return {
        ...currentValue,
        directionId: nextDirectionId,
        serviceId: nextServiceId,
        assignedToAgentId: "",
      };
    });
  }, [
    shouldLockDirection,
    shouldLockService,
    currentAgentDirectionId,
    currentAgentServiceId,
  ]);

  const activeDirections = useMemo(
    () =>
      directions.filter(
        (direction) =>
          direction.status === "ACTIVE",
      ),
    [directions],
  );

  const selectedDirection = useMemo(
    () =>
      directions.find(
        (direction) =>
          direction.id === formState.directionId,
      ),
    [directions, formState.directionId],
  );

  const availableServices = useMemo(
    () =>
      selectedDirection?.services.filter(
        (service) => service.status === "ACTIVE",
      ) ?? [],
    [selectedDirection],
  );

  const filteredAgents = useMemo(() => {
    if (!formState.serviceId) return [];

    return agents.filter((agent) =>
      sameId(
        agent.serviceId,
        formState.serviceId,
      ),
    );
  }, [agents, formState.serviceId]);

  useEffect(() => {
    if (!formState.assignedToAgentId) return;

    const stillAvailable =
      filteredAgents.some(
        (agent) =>
          agent.id ===
          formState.assignedToAgentId,
      );

    if (!stillAvailable) {
      setFormState((currentValue) => ({
        ...currentValue,
        assignedToAgentId: "",
      }));
    }
  }, [
    filteredAgents,
    formState.assignedToAgentId,
  ]);

  function handleChange(
    event: ChangeEvent<
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
    >,
  ): void {
    const { name, value } = event.target;

    setFormState((currentValue) => ({
      ...currentValue,
      [name]: value,
    }));
  }

  function handleDirectionChange(
    event: ChangeEvent<HTMLSelectElement>,
  ): void {
    if (shouldLockDirection) return;

    setFormState((currentValue) => ({
      ...currentValue,
      directionId: event.target.value,
      serviceId: "",
      assignedToAgentId: "",
    }));
  }

  function handleServiceChange(
    event: ChangeEvent<HTMLSelectElement>,
  ): void {
    if (shouldLockService) return;

    setFormState((currentValue) => ({
      ...currentValue,
      serviceId: event.target.value,
      assignedToAgentId: "",
    }));
  }

  function addKpi(): void {
    setFormState((currentValue) => ({
      ...currentValue,
      kpis: [
        ...currentValue.kpis,
        createEmptyKpi(),
      ],
    }));
  }

  function updateKpi(
    index: number,
    patch: Partial<TaskKpiDefinitionInput>,
  ): void {
    setFormState((currentValue) => ({
      ...currentValue,
      kpis: currentValue.kpis.map(
        (item, itemIndex) =>
          itemIndex === index
            ? { ...item, ...patch }
            : item,
      ),
    }));
  }

  function removeKpi(index: number): void {
    const currentKpi = formState.kpis[index];

    const submitted = Boolean(
      currentKpi?.id &&
        task?.kpis.find(
          (item) => item.id === currentKpi.id,
        )?.isSubmitted,
    );

    if (submitted) return;

    setFormState((currentValue) => ({
      ...currentValue,
      kpis: currentValue.kpis.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    }));
  }

  const handleSubmit:
    FormEventHandler<HTMLFormElement> =
    async (event) => {
      event.preventDefault();

      const tags = Array.from(
        new Set(
          formState.tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ).slice(0, 8);

      const kpis = formState.kpis.map(
        (kpi) => ({
          ...kpi,
          label: kpi.label.trim(),
          instructions:
            kpi.instructions?.trim() ||
            undefined,
          unit:
            kpi.kind === "NUMBER"
              ? kpi.unit?.trim() || undefined
              : undefined,
          targetNumber:
            kpi.kind === "NUMBER"
              ? kpi.targetNumber
              : undefined,
        }),
      );

      try {
        await onSubmit({
          title: formState.title.trim(),
          description:
            formState.description.trim() ||
            undefined,
          priority: formState.priority,
          status: formState.status,
          progressPercentage: Number(
            formState.progressPercentage || "0",
          ),
          startDate:
            formState.startDate || undefined,
          dueDate:
            formState.dueDate || undefined,
          directionId:
            formState.directionId,
          serviceId:
            formState.serviceId || null,
          assignedToAgentId:
            formState.assignedToAgentId,
          tags,
          kpis,
        });
      } catch {
        // L'erreur est affichée dans la modale.
      }
    };

  const canSubmit =
    !isSubmitting &&
    Boolean(formState.title.trim()) &&
    Boolean(formState.directionId) &&
    Boolean(formState.serviceId) &&
    Boolean(formState.assignedToAgentId) &&
    formState.kpis.every(
      (kpi) => kpi.label.trim().length >= 2,
    );

  return (
    <div className="task-modal-layer" role="presentation">
      <button
        className="task-modal-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <section
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <header className="task-modal-header">
          <div>
            <p>
              {task
                ? "MISE À JOUR"
                : "NOUVELLE TÂCHE"}
            </p>

            <h3 id="task-modal-title">
              {task
                ? `Modifier ${task.reference}`
                : "Créer une tâche"}
            </h3>
          </div>

          <button
            className="task-icon-button"
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <X size={20} />
          </button>
        </header>

        {errorMessage && (
          <div className="task-form-error">
            {errorMessage}
          </div>
        )}

        <form
          className="task-form"
          onSubmit={handleSubmit}
        >
          <section className="task-form-section">
            <div className="task-form-section-heading">
              <Tags size={18} />
              <div>
                <strong>
                  Informations de la tâche
                </strong>
                <span>
                  Objet, priorité et état
                  d’avancement.
                </span>
              </div>
            </div>

            <div className="task-form-grid">
              <label className="task-form-field task-form-field-full">
                <span>Titre de la tâche</span>
                <input
                  name="title"
                  value={formState.title}
                  onChange={handleChange}
                  placeholder="Ex. Préparer le rapport mensuel"
                  disabled={isSubmitting}
                  required
                />
              </label>

              <label className="task-form-field task-form-field-full">
                <span>Description</span>
                <textarea
                  name="description"
                  rows={4}
                  value={formState.description}
                  onChange={handleChange}
                  placeholder="Objectif, livrables, contexte et résultat attendu..."
                  disabled={isSubmitting}
                />
              </label>

              <label className="task-form-field">
                <span>Priorité</span>
                <select
                  name="priority"
                  value={formState.priority}
                  onChange={handleChange}
                  disabled={isSubmitting}
                >
                  {Object.entries(
                    priorityLabels,
                  ).map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="task-form-field">
                <span>Statut</span>
                <select
                  name="status"
                  value={formState.status}
                  onChange={handleChange}
                  disabled={isSubmitting}
                >
                  {Object.entries(
                    statusLabels,
                  ).map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="task-form-field">
                <span>Progression (%)</span>
                <input
                  name="progressPercentage"
                  type="number"
                  min="0"
                  max="100"
                  value={
                    formState.progressPercentage
                  }
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </label>

              <label className="task-form-field">
                <span>Étiquettes</span>
                <input
                  name="tagsText"
                  value={formState.tagsText}
                  onChange={handleChange}
                  placeholder="rapport, contrôle, terrain..."
                  disabled={isSubmitting}
                />
              </label>
            </div>
          </section>

          <section className="task-form-section">
            <div className="task-form-section-heading">
              <Building2 size={18} />
              <div>
                <strong>
                  Responsabilité
                </strong>
                <span>
                  Périmètre et Agent chargé de
                  l’exécution.
                </span>
              </div>
            </div>

            <div className="task-form-grid">
              <label className="task-form-field">
                <span>Direction</span>
                <select
                  value={formState.directionId}
                  onChange={
                    handleDirectionChange
                  }
                  disabled={
                    isSubmitting ||
                    shouldLockDirection
                  }
                  required
                >
                  <option value="">
                    Sélectionner une Direction
                  </option>

                  {activeDirections.map(
                    (direction) => (
                      <option
                        key={direction.id}
                        value={direction.id}
                      >
                        {direction.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="task-form-field">
                <span>Service</span>
                <select
                  value={formState.serviceId}
                  onChange={
                    handleServiceChange
                  }
                  disabled={
                    isSubmitting ||
                    shouldLockService ||
                    !formState.directionId
                  }
                  required
                >
                  <option value="">
                    Sélectionner un Service
                  </option>

                  {availableServices.map(
                    (service) => (
                      <option
                        key={service.id}
                        value={service.id}
                      >
                        {service.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="task-form-field task-form-field-full">
                <span>
                  Agent responsable
                </span>

                <select
                  name="assignedToAgentId"
                  value={
                    formState.assignedToAgentId
                  }
                  onChange={handleChange}
                  disabled={
                    isSubmitting ||
                    !formState.serviceId
                  }
                  required
                >
                  <option value="">
                    {formState.serviceId
                      ? "Sélectionner un membre du Service"
                      : "Sélectionnez d’abord un Service"}
                  </option>

                  {filteredAgents.map(
                    (agent) => (
                      <option
                        key={agent.id}
                        value={agent.id}
                      >
                        {agent.fullName}
                        {agent.jobTitle
                          ? ` · ${agent.jobTitle}`
                          : ""}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </section>

          <section className="task-form-section task-kpi-form-section">
            <div className="task-kpi-form-heading">
              <div className="task-form-section-heading">
                <BarChart3 size={18} />
                <div>
                  <strong>
                    KPI / résultat attendu
                  </strong>
                  <span>
                    Définissez les preuves à fournir
                    par l’Agent après traitement de la
                    tâche.
                  </span>
                </div>
              </div>

              <button
                className="task-kpi-add-button"
                type="button"
                onClick={addKpi}
                disabled={
                  isSubmitting ||
                  formState.kpis.length >= 10
                }
              >
                <Plus size={16} />
                <span>Ajouter un KPI</span>
              </button>
            </div>

            {formState.kpis.length === 0 && (
              <div className="task-kpi-empty">
                <BarChart3 size={22} />
                <div>
                  <strong>
                    Aucun KPI demandé
                  </strong>
                  <p>
                    Ajoutez un fichier, une valeur
                    chiffrée ou un texte que
                    l’Agent devra fournir comme
                    résultat.
                  </p>
                </div>
              </div>
            )}

            <div className="task-kpi-definition-list">
              {formState.kpis.map(
                (kpi, index) => {
                  const submitted = Boolean(
                    kpi.id &&
                      task?.kpis.find(
                        (item) =>
                          item.id === kpi.id,
                      )?.isSubmitted,
                  );

                  return (
                    <article
                      key={
                        kpi.id ??
                        `new-kpi-${index}`
                      }
                      className={
                        submitted
                          ? "task-kpi-definition-card is-locked"
                          : "task-kpi-definition-card"
                      }
                    >
                      <header>
                        <div>
                          {kpi.kind ===
                          "FILE" ? (
                            <FileText
                              size={17}
                            />
                          ) : kpi.kind ===
                            "NUMBER" ? (
                            <Hash size={17} />
                          ) : (
                            <Type size={17} />
                          )}

                          <strong>
                            KPI {index + 1}
                          </strong>
                        </div>

                        <button
                          type="button"
                          className="task-kpi-remove-button"
                          onClick={() =>
                            removeKpi(index)
                          }
                          disabled={
                            isSubmitting ||
                            submitted
                          }
                          title={
                            submitted
                              ? "Ce KPI possède déjà un résultat."
                              : "Retirer ce KPI"
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </header>

                      {submitted && (
                        <div className="task-kpi-lock-note">
                          Ce KPI possède déjà un
                          résultat. Sa définition est
                          verrouillée pour préserver
                          la traçabilité.
                        </div>
                      )}

                      <div className="task-form-grid">
                        <label className="task-form-field task-form-field-full">
                          <span>
                            Libellé du KPI
                          </span>
                          <input
                            value={kpi.label}
                            onChange={(event) =>
                              updateKpi(index, {
                                label:
                                  event.target
                                    .value,
                              })
                            }
                            placeholder="Ex. Rapport final signé, nombre de dossiers traités..."
                            disabled={
                              isSubmitting ||
                              submitted
                            }
                            required
                          />
                        </label>

                        <label className="task-form-field">
                          <span>
                            Type de résultat
                          </span>
                          <select
                            value={kpi.kind}
                            onChange={(event) =>
                              updateKpi(index, {
                                kind:
                                  event.target
                                    .value as TaskKpiKind,
                                targetNumber:
                                  undefined,
                                unit: undefined,
                              })
                            }
                            disabled={
                              isSubmitting ||
                              submitted
                            }
                          >
                            {Object.entries(
                              kpiKindLabels,
                            ).map(
                              ([
                                value,
                                label,
                              ]) => (
                                <option
                                  key={value}
                                  value={value}
                                >
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>

                        <label className="task-kpi-required-field">
                          <input
                            type="checkbox"
                            checked={
                              kpi.required
                            }
                            onChange={(event) =>
                              updateKpi(index, {
                                required:
                                  event.target
                                    .checked,
                              })
                            }
                            disabled={
                              isSubmitting ||
                              submitted
                            }
                          />
                          <span>
                            Obligatoire avant
                            clôture
                          </span>
                        </label>

                        {kpi.kind ===
                          "NUMBER" && (
                          <>
                            <label className="task-form-field">
                              <span>
                                Valeur cible
                              </span>
                              <input
                                type="number"
                                step="any"
                                value={
                                  kpi.targetNumber ??
                                  ""
                                }
                                onChange={(
                                  event,
                                ) =>
                                  updateKpi(
                                    index,
                                    {
                                      targetNumber:
                                        event
                                          .target
                                          .value ===
                                        ""
                                          ? undefined
                                          : Number(
                                              event
                                                .target
                                                .value,
                                            ),
                                    },
                                  )
                                }
                                disabled={
                                  isSubmitting ||
                                  submitted
                                }
                              />
                            </label>

                            <label className="task-form-field">
                              <span>
                                Unité
                              </span>
                              <input
                                value={
                                  kpi.unit ?? ""
                                }
                                onChange={(
                                  event,
                                ) =>
                                  updateKpi(
                                    index,
                                    {
                                      unit:
                                        event
                                          .target
                                          .value,
                                    },
                                  )
                                }
                                placeholder="%, dossiers, GNF..."
                                disabled={
                                  isSubmitting ||
                                  submitted
                                }
                              />
                            </label>
                          </>
                        )}

                        <label className="task-form-field task-form-field-full">
                          <span>
                            Instructions
                          </span>
                          <textarea
                            rows={2}
                            value={
                              kpi.instructions ??
                              ""
                            }
                            onChange={(event) =>
                              updateKpi(index, {
                                instructions:
                                  event.target
                                    .value,
                              })
                            }
                            placeholder="Précisez le document, le chiffre ou le contenu attendu."
                            disabled={
                              isSubmitting ||
                              submitted
                            }
                          />
                        </label>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          </section>

          <section className="task-form-section">
            <div className="task-form-section-heading">
              <CalendarDays size={18} />
              <div>
                <strong>
                  Planification
                </strong>
                <span>
                  Dates de démarrage et échéance
                  prévue.
                </span>
              </div>
            </div>

            <div className="task-form-grid">
              <label className="task-form-field">
                <span>Date de début</span>
                <input
                  name="startDate"
                  type="date"
                  value={formState.startDate}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </label>

              <label className="task-form-field">
                <span>Échéance</span>
                <input
                  name="dueDate"
                  type="date"
                  min={formState.startDate}
                  value={formState.dueDate}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </label>
            </div>
          </section>

          <footer className="task-modal-footer">
            <button
              className="task-cancel-button"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annuler
            </button>

            <button
              className="task-primary-button"
              type="submit"
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle
                    size={17}
                    className="is-spinning"
                  />
                  <span>
                    Enregistrement...
                  </span>
                </>
              ) : (
                <span>
                  {task
                    ? "Enregistrer"
                    : "Créer la tâche"}
                </span>
              )}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
