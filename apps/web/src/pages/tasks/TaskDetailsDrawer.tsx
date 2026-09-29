import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEventHandler,
} from "react";
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Download,
  FileCheck2,
  FileText,
  Hash,
  History,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Send,
  ShieldCheck,
  Target,
  Type,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { useAuth } from "../../features/auth/auth.context";
import {
  addTaskComment,
  downloadTaskKpiFile,
  getTaskActivities,
  getTaskComments,
  submitTaskKpiValue,
  updateTaskProgress,
  uploadTaskKpiFile,
} from "../../features/tasks/task.api";
import type {
  Task,
  TaskKpi,
  TaskStatus,
} from "../../features/tasks/task.types";
import "./task-kpi.css";

type TaskDetailsDrawerProps = {
  task: Task;

  assigneeName: string;
  directionName: string;
  serviceName: string;

  canManage: boolean;
  canUpdateProgress: boolean;

  onClose: () => void;
  onEdit: (task: Task) => void;
};

const statusLabels: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloquée",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

function formatDate(value?: string): string {
  if (!value) return "Non renseignée";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value?: string): string {
  if (!value) return "Non renseignée";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} o`;

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} Ko`;
  }

  return `${(
    value /
    (1024 * 1024)
  ).toFixed(1)} Mo`;
}

function getStatusClass(
  status: TaskStatus,
): string {
  return status
    .toLowerCase()
    .replace("_", "-");
}

function KpiIcon({
  kpi,
}: {
  kpi: TaskKpi;
}) {
  if (kpi.kind === "FILE") {
    return <FileText size={17} />;
  }

  if (kpi.kind === "NUMBER") {
    return <Hash size={17} />;
  }

  return <Type size={17} />;
}

export default function TaskDetailsDrawer({
  task,
  assigneeName,
  directionName,
  serviceName,
  canManage,
  canUpdateProgress,
  onClose,
  onEdit,
}: TaskDetailsDrawerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const role = user?.role ?? "";

  /**
   * RH_MANAGER conserve strictement la lecture seule.
   */
  const isHrReadOnly =
    role === "RH_MANAGER";

  const effectiveCanManage =
    !isHrReadOnly &&
    (task.permissions?.canManage ??
      canManage);

  const effectiveCanUpdateProgress =
    !isHrReadOnly &&
    (task.permissions
      ?.canUpdateProgress ??
      canUpdateProgress);

  const canSubmitKpi =
    !isHrReadOnly &&
    Boolean(
      task.permissions?.canSubmitKpi,
    );

  const canComment =
    !isHrReadOnly &&
    Boolean(
      task.permissions?.canComment ??
        true,
    );

  const [progress, setProgress] =
    useState(
      String(
        task.progressPercentage,
      ),
    );

  const [progressNote, setProgressNote] =
    useState("");

  const [comment, setComment] =
    useState("");

  const [kpiValues, setKpiValues] =
    useState<Record<string, string>>(
      () =>
        Object.fromEntries(
          task.kpis.map((kpi) => [
            kpi.id,
            kpi.kind === "NUMBER"
              ? kpi.resultNumber?.toString() ??
                ""
              : kpi.resultText ?? "",
          ]),
        ),
    );

  const [kpiFiles, setKpiFiles] =
    useState<
      Record<string, File | null>
    >({});

  const commentsQuery = useQuery({
    queryKey: [
      "task-comments",
      task.id,
    ],
    queryFn: () =>
      getTaskComments(task.id),
    staleTime: 15_000,
  });

  const activitiesQuery = useQuery({
    queryKey: [
      "task-activities",
      task.id,
    ],
    queryFn: () =>
      getTaskActivities(task.id),
    staleTime: 15_000,
  });

  async function invalidateTaskData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["task", task.id],
      }),

      queryClient.invalidateQueries({
        queryKey: ["tasks"],
      }),

      queryClient.invalidateQueries({
        queryKey: ["task-stats"],
      }),

      queryClient.invalidateQueries({
        queryKey: [
          "task-activities",
          task.id,
        ],
      }),
    ]);
  }

  const progressMutation =
    useMutation({
      mutationFn: () =>
        updateTaskProgress(
          task.id,
          {
            progressPercentage:
              Number(progress),

            note:
              progressNote.trim() ||
              undefined,
          },
        ),

      onSuccess: async () => {
        setProgressNote("");
        await invalidateTaskData();
      },
    });

  const commentMutation =
    useMutation({
      mutationFn: () =>
        addTaskComment(
          task.id,
          comment.trim(),
        ),

      onSuccess: async () => {
        setComment("");

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [
              "task-comments",
              task.id,
            ],
          }),

          invalidateTaskData(),
        ]);
      },
    });

  const scalarKpiMutation =
    useMutation({
      mutationFn: async ({
        kpi,
      }: {
        kpi: TaskKpi;
      }) => {
        const rawValue =
          kpiValues[kpi.id] ?? "";

        return submitTaskKpiValue(
          task.id,
          kpi.id,
          kpi.kind === "NUMBER"
            ? Number(rawValue)
            : rawValue.trim(),
        );
      },

      onSuccess: async () => {
        await invalidateTaskData();
      },
    });

  const fileKpiMutation =
    useMutation({
      mutationFn: async ({
        kpi,
      }: {
        kpi: TaskKpi;
      }) => {
        const file =
          kpiFiles[kpi.id];

        if (!file) {
          throw new Error(
            "Sélectionnez le fichier KPI à transmettre.",
          );
        }

        return uploadTaskKpiFile(
          task.id,
          kpi.id,
          file,
        );
      },

      onSuccess: async (
        _,
        variables,
      ) => {
        setKpiFiles(
          (current) => ({
            ...current,
            [variables.kpi.id]:
              null,
          }),
        );

        await invalidateTaskData();
      },
    });

  const downloadKpiMutation =
    useMutation({
      mutationFn: async ({
        kpi,
      }: {
        kpi: TaskKpi;
      }) => {
        if (!kpi.file) return;

        await downloadTaskKpiFile(
          task.id,
          kpi.id,
          kpi.file.originalName,
        );
      },
    });

  const progressError =
    progressMutation.isError
      ? getApiErrorMessage(
          progressMutation.error,
        )
      : null;

  const commentError =
    commentMutation.isError
      ? getApiErrorMessage(
          commentMutation.error,
        )
      : null;

  const kpiError = useMemo(() => {
    const error =
      scalarKpiMutation.error ??
      fileKpiMutation.error ??
      downloadKpiMutation.error;

    return error
      ? getApiErrorMessage(error)
      : null;
  }, [
    scalarKpiMutation.error,
    fileKpiMutation.error,
    downloadKpiMutation.error,
  ]);

  const handleProgressSubmit:
    FormEventHandler<HTMLFormElement> =
    async (event) => {
      event.preventDefault();

      try {
        await progressMutation.mutateAsync();
      } catch {
        // L'erreur est affichée dans le drawer.
      }
    };

  const handleCommentSubmit:
    FormEventHandler<HTMLFormElement> =
    async (event) => {
      event.preventDefault();

      if (!comment.trim()) {
        return;
      }

      try {
        await commentMutation.mutateAsync();
      } catch {
        // L'erreur est affichée dans le drawer.
      }
    };

  const requiredKpis =
    task.kpis.filter(
      (kpi) => kpi.required,
    );

  const completedKpis =
    task.kpis.filter(
      (kpi) => kpi.isSubmitted,
    );

  const pendingRequiredKpis =
    requiredKpis.filter(
      (kpi) => !kpi.isSubmitted,
    );

  return (
    <div
      className="task-drawer-layer"
      role="presentation"
      onMouseDown={(event) => {
        /**
         * Fermeture uniquement si le clic touche réellement
         * la zone extérieure au drawer.
         *
         * Aucun backdrop absolu n'est placé devant l'interface :
         * boutons, slider, inputs, upload et téléchargement
         * restent donc nativement interactifs.
         */
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        className="task-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Détails ${task.reference}`}
      >
        {/* Même organisation visuelle que Roadmap */}
        <header className="task-drawer-header">
          <div>
            <p>{task.reference}</p>

            <h3>{task.title}</h3>

            <span>
              {directionName}
              {" · "}
              {serviceName}
            </span>
          </div>

          <button
            className="task-icon-button"
            type="button"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        {isHrReadOnly && (
          <div
            className="task-rh-readonly-banner"
            role="status"
          >
            <ShieldCheck size={18} />

            <div>
              <strong>
                Consultation RH —
                lecture seule
              </strong>

              <p>
                Consultation autorisée.
                Modification, validation,
                commentaire et saisie KPI
                désactivés. Les pièces KPI
                peuvent être consultées et
                téléchargées.
              </p>
            </div>
          </div>
        )}

        {/* Identité : transposition directe de roadmap-drawer-identity */}
        <section className="task-drawer-identity">
          <span
            className={`task-status-pill ${getStatusClass(
              task.status,
            )}`}
          >
            {statusLabels[task.status]}
          </span>

          <div>
            <strong>
              {task.progressPercentage}%
            </strong>

            <span>
              Progression de la tâche
            </span>
          </div>

          <div className="task-progress-track">
            <i
              style={{
                width: `${task.progressPercentage}%`,
              }}
            />
          </div>

          <p>
            Responsable :{" "}
            <strong>
              {assigneeName}
            </strong>
            {" · "}
            Échéance :{" "}
            <strong>
              {formatDate(
                task.dueDate,
              )}
            </strong>
          </p>
        </section>

        {/* Actions : même principe que Roadmap */}
        {(effectiveCanManage ||
          effectiveCanUpdateProgress) && (
          <section className="task-drawer-actions">
            {effectiveCanManage && (
              <button
                className="task-secondary-action"
                type="button"
                onClick={() =>
                  onEdit(task)
                }
              >
                <Pencil size={16} />
                <span>Modifier</span>
              </button>
            )}

            {effectiveCanUpdateProgress && (
              <form
                className="task-progress-action-box"
                onSubmit={
                  handleProgressSubmit
                }
              >
                {progressError && (
                  <div
                    className="task-form-error"
                    role="alert"
                  >
                    <CircleAlert
                      size={16}
                    />
                    <span>
                      {progressError}
                    </span>
                  </div>
                )}

                <div className="task-progress-action-heading">
                  <span>
                    Mise à jour de
                    l’avancement
                  </span>

                  <strong>
                    {progress}%
                  </strong>
                </div>

                <input
                  className="task-progress-range"
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={(
                    event: ChangeEvent<HTMLInputElement>,
                  ) =>
                    setProgress(
                      event.target
                        .value,
                    )
                  }
                  disabled={
                    progressMutation.isPending
                  }
                />

                <label className="task-inline-comment">
                  <span>
                    Commentaire de mise
                    à jour
                  </span>

                  <textarea
                    rows={2}
                    value={progressNote}
                    onChange={(
                      event: ChangeEvent<HTMLTextAreaElement>,
                    ) =>
                      setProgressNote(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Ex. Rapport finalisé, contrôle terminé..."
                    disabled={
                      progressMutation.isPending
                    }
                  />
                </label>

                <button
                  className="task-primary-button"
                  type="submit"
                  disabled={
                    progressMutation.isPending
                  }
                >
                  {progressMutation.isPending ? (
                    <LoaderCircle
                      size={16}
                      className="is-spinning"
                    />
                  ) : (
                    <CheckCircle2
                      size={16}
                    />
                  )}

                  <span>
                    Enregistrer la
                    progression
                  </span>
                </button>
              </form>
            )}
          </section>
        )}

        {task.description && (
          <section className="task-drawer-section">
            <div className="task-drawer-section-heading">
              <FileText size={18} />
              <h4>
                Présentation générale
              </h4>
            </div>

            <p>
              {task.description}
            </p>
          </section>
        )}

        <section className="task-drawer-section">
          <div className="task-drawer-section-heading">
            <Target size={18} />
            <h4>
              KPI et résultats
            </h4>
          </div>

          <div className="task-kpi-summary">
            <div>
              <span>KPI</span>
              <strong>
                {task.kpis.length}
              </strong>
            </div>

            <div>
              <span>Renseignés</span>
              <strong>
                {completedKpis.length}
              </strong>
            </div>

            <div>
              <span>
                Obligatoires en attente
              </span>
              <strong>
                {
                  pendingRequiredKpis.length
                }
              </strong>
            </div>
          </div>

          {kpiError && (
            <div
              className="task-form-error"
              role="alert"
            >
              <CircleAlert size={16} />
              <span>{kpiError}</span>
            </div>
          )}

          {task.kpis.length === 0 ? (
            <div className="task-empty">
              Aucun KPI n’a été demandé
              pour cette tâche.
            </div>
          ) : (
            <div className="task-items-list">
              {task.kpis.map(
                (kpi) => {
                  const isSubmitting =
                    (scalarKpiMutation.isPending &&
                      scalarKpiMutation
                        .variables?.kpi
                        .id ===
                        kpi.id) ||
                    (fileKpiMutation.isPending &&
                      fileKpiMutation
                        .variables?.kpi
                        .id ===
                        kpi.id);

                  return (
                    <article
                      className="task-item-card"
                      key={kpi.id}
                    >
                      <header>
                        <div>
                          <span>
                            {kpi.required
                              ? "KPI obligatoire"
                              : "KPI facultatif"}
                          </span>

                          <h5>
                            <KpiIcon
                              kpi={kpi}
                            />
                            {kpi.label}
                          </h5>
                        </div>

                        <span
                          className={`task-kpi-status ${
                            kpi.isSubmitted
                              ? "validated"
                              : "pending-review"
                          }`}
                        >
                          {kpi.isSubmitted
                            ? "Renseigné"
                            : "En attente"}
                        </span>
                      </header>

                      {kpi.instructions && (
                        <p>
                          {kpi.instructions}
                        </p>
                      )}

                      <dl className="task-item-meta">
                        <div>
                          <dt>
                            Type de résultat
                          </dt>
                          <dd>
                            {kpi.kind ===
                            "FILE"
                              ? "Fichier / pièce"
                              : kpi.kind ===
                                  "NUMBER"
                                ? "Valeur chiffrée"
                                : "Texte / compte rendu"}
                          </dd>
                        </div>

                        <div>
                          <dt>
                            Exigence
                          </dt>
                          <dd>
                            {kpi.required
                              ? "Obligatoire"
                              : "Facultatif"}
                          </dd>
                        </div>

                        {kpi.kind ===
                          "NUMBER" &&
                          kpi.targetNumber !==
                            undefined && (
                            <div>
                              <dt>
                                Cible
                              </dt>
                              <dd>
                                {
                                  kpi.targetNumber
                                }
                                {kpi.unit
                                  ? ` ${kpi.unit}`
                                  : ""}
                              </dd>
                            </div>
                          )}
                      </dl>

                      {(kpi.resultText ||
                        kpi.resultNumber !==
                          undefined ||
                        kpi.file) && (
                        <div className="task-kpi-proof">
                          <strong>
                            Preuve KPI
                            déposée
                          </strong>

                          {kpi.kind ===
                            "NUMBER" &&
                            kpi.resultNumber !==
                              undefined && (
                              <p>
                                Résultat :{" "}
                                <strong>
                                  {
                                    kpi.resultNumber
                                  }
                                  {kpi.unit
                                    ? ` ${kpi.unit}`
                                    : ""}
                                </strong>
                              </p>
                            )}

                          {kpi.resultText && (
                            <p>
                              {
                                kpi.resultText
                              }
                            </p>
                          )}

                          {kpi.file && (
                            <div className="task-kpi-file-row">
                              <div>
                                <FileCheck2
                                  size={16}
                                />

                                <span>
                                  {
                                    kpi.file
                                      .originalName
                                  }
                                  {" · "}
                                  {formatBytes(
                                    kpi.file
                                      .size,
                                  )}
                                </span>
                              </div>

                              {kpi.canDownload ? (
                                <button
                                  type="button"
                                  disabled={
                                    downloadKpiMutation.isPending
                                  }
                                  onClick={() =>
                                    void downloadKpiMutation.mutateAsync(
                                      {
                                        kpi,
                                      },
                                    )
                                  }
                                >
                                  <Download
                                    size={15}
                                  />
                                  <span>
                                    Télécharger
                                  </span>
                                </button>
                              ) : (
                                <small>
                                  Téléchargement
                                  non autorisé
                                </small>
                              )}
                            </div>
                          )}

                          {kpi.submittedAt && (
                            <small>
                              Déposé le{" "}
                              {formatDateTime(
                                kpi.submittedAt,
                              )}
                            </small>
                          )}
                        </div>
                      )}

                      {canSubmitKpi && (
                        <div className="task-kpi-submit-box">
                          {kpi.kind ===
                          "FILE" ? (
                            <>
                              <label className="task-file-picker">
                                <UploadCloud
                                  size={17}
                                />

                                <span>
                                  {kpiFiles[
                                    kpi.id
                                  ]?.name ??
                                    "Joindre la preuve KPI"}
                                </span>

                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx"
                                  onChange={(
                                    event: ChangeEvent<HTMLInputElement>,
                                  ) =>
                                    setKpiFiles(
                                      (
                                        current,
                                      ) => ({
                                        ...current,
                                        [
                                          kpi.id
                                        ]:
                                          event
                                            .target
                                            .files?.[0] ??
                                          null,
                                      }),
                                    )
                                  }
                                />
                              </label>

                              <button
                                className="task-primary-button"
                                type="button"
                                disabled={
                                  isSubmitting ||
                                  !kpiFiles[
                                    kpi.id
                                  ]
                                }
                                onClick={() =>
                                  void fileKpiMutation.mutateAsync(
                                    {
                                      kpi,
                                    },
                                  )
                                }
                              >
                                {isSubmitting ? (
                                  <LoaderCircle
                                    size={16}
                                    className="is-spinning"
                                  />
                                ) : (
                                  <CheckCircle2
                                    size={16}
                                  />
                                )}

                                <span>
                                  Enregistrer
                                  le KPI
                                </span>
                              </button>
                            </>
                          ) : (
                            <>
                              <label className="task-inline-comment">
                                <span>
                                  {kpi.kind ===
                                  "NUMBER"
                                    ? "Résultat chiffré"
                                    : "Commentaire de réalisation"}
                                </span>

                                {kpi.kind ===
                                "NUMBER" ? (
                                  <input
                                    type="number"
                                    step="any"
                                    value={
                                      kpiValues[
                                        kpi.id
                                      ] ??
                                      ""
                                    }
                                    onChange={(
                                      event: ChangeEvent<HTMLInputElement>,
                                    ) =>
                                      setKpiValues(
                                        (
                                          current,
                                        ) => ({
                                          ...current,
                                          [
                                            kpi.id
                                          ]:
                                            event
                                              .target
                                              .value,
                                        }),
                                      )
                                    }
                                    placeholder="Saisir le résultat"
                                  />
                                ) : (
                                  <textarea
                                    rows={2}
                                    value={
                                      kpiValues[
                                        kpi.id
                                      ] ??
                                      ""
                                    }
                                    onChange={(
                                      event: ChangeEvent<HTMLTextAreaElement>,
                                    ) =>
                                      setKpiValues(
                                        (
                                          current,
                                        ) => ({
                                          ...current,
                                          [
                                            kpi.id
                                          ]:
                                            event
                                              .target
                                              .value,
                                        }),
                                      )
                                    }
                                    placeholder="Résultat obtenu, référence ou observation..."
                                  />
                                )}
                              </label>

                              <button
                                className="task-primary-button"
                                type="button"
                                disabled={
                                  isSubmitting ||
                                  !String(
                                    kpiValues[
                                      kpi.id
                                    ] ??
                                      "",
                                  ).trim()
                                }
                                onClick={() =>
                                  void scalarKpiMutation.mutateAsync(
                                    {
                                      kpi,
                                    },
                                  )
                                }
                              >
                                {isSubmitting ? (
                                  <LoaderCircle
                                    size={16}
                                    className="is-spinning"
                                  />
                                ) : (
                                  <CheckCircle2
                                    size={16}
                                  />
                                )}

                                <span>
                                  Enregistrer
                                  le KPI
                                </span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </article>
                  );
                },
              )}
            </div>
          )}

          {pendingRequiredKpis.length >
            0 && (
            <div className="task-kpi-warning">
              <CircleAlert size={17} />

              <span>
                {
                  pendingRequiredKpis.length
                }{" "}
                KPI obligatoire(s)
                reste(nt) à renseigner
                avant la clôture à
                100 %.
              </span>
            </div>
          )}
        </section>

        <section className="task-drawer-section">
          <div className="task-drawer-section-heading">
            <UserRound size={18} />

            <h4>
              Responsabilité
            </h4>
          </div>

          <dl className="task-item-meta task-responsibility-meta">
            <div>
              <dt>
                Agent responsable
              </dt>
              <dd>
                {assigneeName}
              </dd>
            </div>

            <div>
              <dt>Direction</dt>
              <dd>
                {directionName}
              </dd>
            </div>

            <div>
              <dt>Service</dt>
              <dd>
                {serviceName}
              </dd>
            </div>
          </dl>
        </section>

        <section className="task-drawer-section">
          <div className="task-drawer-section-heading">
            <CalendarClock
              size={18}
            />

            <h4>
              Planification
            </h4>
          </div>

          <dl className="task-item-meta task-planning-meta">
            <div>
              <dt>
                Date de début
              </dt>
              <dd>
                {formatDate(
                  task.startDate,
                )}
              </dd>
            </div>

            <div>
              <dt>Échéance</dt>
              <dd>
                {formatDate(
                  task.dueDate,
                )}
              </dd>
            </div>

            <div>
              <dt>
                Achèvement
              </dt>
              <dd>
                {formatDate(
                  task.completedAt,
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="task-drawer-section">
          <div className="task-drawer-section-heading">
            <MessageSquareText
              size={18}
            />

            <h4>
              Commentaires
            </h4>
          </div>

          {commentError && (
            <div
              className="task-form-error"
              role="alert"
            >
              {commentError}
            </div>
          )}

          {canComment && (
            <form
              className="task-kpi-submit-box"
              onSubmit={
                handleCommentSubmit
              }
            >
              <label className="task-inline-comment">
                <span>
                  Nouveau commentaire
                </span>

                <textarea
                  rows={2}
                  value={comment}
                  onChange={(
                    event: ChangeEvent<HTMLTextAreaElement>,
                  ) =>
                    setComment(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Observation de suivi..."
                  disabled={
                    commentMutation.isPending
                  }
                />
              </label>

              <button
                className="task-primary-button"
                type="submit"
                disabled={
                  commentMutation.isPending ||
                  !comment.trim()
                }
              >
                {commentMutation.isPending ? (
                  <LoaderCircle
                    size={16}
                    className="is-spinning"
                  />
                ) : (
                  <Send size={16} />
                )}

                <span>Publier</span>
              </button>
            </form>
          )}

          {commentsQuery.isLoading && (
            <div className="task-empty">
              <LoaderCircle
                size={20}
                className="is-spinning"
              />
              Chargement des
              commentaires...
            </div>
          )}

          {!commentsQuery.isLoading &&
            (commentsQuery.data
              ?.length ??
              0) === 0 && (
              <div className="task-empty">
                Aucun commentaire
                enregistré.
              </div>
            )}

          <div className="task-comments-list">
            {commentsQuery.data?.map(
              (item) => (
                <article
                  key={item.id}
                >
                  <strong>
                    {item.authorName}
                  </strong>

                  <p>
                    {item.message}
                  </p>

                  <small>
                    {formatDateTime(
                      item.createdAt,
                    )}
                  </small>
                </article>
              ),
            )}
          </div>
        </section>

        <section className="task-drawer-section">
          <div className="task-drawer-section-heading">
            <History size={18} />
            <h4>Historique</h4>
          </div>

          {activitiesQuery.isLoading && (
            <div className="task-empty">
              <LoaderCircle
                size={20}
                className="is-spinning"
              />
              Chargement de
              l’historique...
            </div>
          )}

          {!activitiesQuery.isLoading &&
            (activitiesQuery.data
              ?.length ??
              0) === 0 && (
              <div className="task-empty">
                Aucune activité
                enregistrée.
              </div>
            )}

          <div className="task-activity-list">
            {activitiesQuery.data?.map(
              (activity) => (
                <article
                  key={activity.id}
                >
                  <span />

                  <div>
                    <strong>
                      {activity.actorName}
                    </strong>

                    <p>
                      {
                        activity.summary
                      }
                    </p>

                    <small>
                      {formatDateTime(
                        activity.createdAt,
                      )}
                    </small>
                  </div>
                </article>
              ),
            )}
          </div>
        </section>

        <footer className="task-drawer-footer">
          <CalendarClock
            size={16}
          />

          <span>
            Dernière mise à jour :{" "}
            {formatDateTime(
              task.updatedAt,
            )}
          </span>
        </footer>
      </aside>
    </div>
  );
}
