import {
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  History,
  LockKeyhole,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  Target,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import {
  approveRoadmap,
  closeRoadmap,
  deleteRoadmap,
  downloadRoadmapKpiFile,
  getRoadmapActivities,
  returnRoadmap,
  reviewItemKpi,
  submitItemKpi,
  submitRoadmap,
} from "../../features/roadmaps/roadmap.api";
import type {
  KpiReviewDecision,
  Roadmap,
  RoadmapActivity,
  RoadmapItem,
} from "../../features/roadmaps/roadmap.types";
import {
  formatFileSize,
  formatRoadmapDate,
  formatRoadmapDateOnly,
  getApprovalHelp,
  kpiReviewLabels,
  roadmapRoleLabels,
  roadmapStatusLabels,
  statusClass,
} from "../../features/roadmaps/roadmap.utils";

type RoadmapDetailsDrawerProps = {
  roadmap: Roadmap;
  role?: string;
  currentUserId?: string;
  onClose: () => void;
  onEdit?: (roadmap: Roadmap) => void;
  onChanged: () => Promise<void>;
  onRoadmapUpdated?: (roadmap: Roadmap) => void;
};

type KpiDraft = {
  kpiText: string;
  file: File | null;
};

const activityLabels: Record<string, string> = {
  CREATED: "Création",
  UPDATED: "Mise à jour",
  SUBMITTED: "Soumission",
  DEPARTMENT_APPROVED: "Validation hiérarchique",
  RH_APPROVED: "Validation RH",
  APPROVED: "Validation finale",
  RETURNED: "Retour pour correction",
  CLOSED: "Clôture",
  ITEM_COMPLETED: "Réalisation déposée",
  KPI_REVIEWED: "Contrôle KPI",
  KPI_ADMIN_UPDATED: "Correction KPI",
};

function getItemStatusText(
  item: RoadmapItem,
): string {
  if (
    item.reviewStatus ===
    "VALIDATED"
  ) {
    return "Mission validée";
  }

  if (
    item.reviewStatus ===
    "PENDING_REVIEW"
  ) {
    return "En validation";
  }

  if (
    item.reviewStatus ===
    "NEEDS_DISCUSSION"
  ) {
    return "À reprendre";
  }

  if (item.status === "DONE") {
    return "Réalisée";
  }

  return "À réaliser";
}

export default function RoadmapDetailsDrawer({
  roadmap,
  //role,
  currentUserId,
  onClose,
  onEdit,
  onChanged,
  onRoadmapUpdated,
}: RoadmapDetailsDrawerProps) {
  const queryClient = useQueryClient();

  const [reviewComment, setReviewComment] =
    useState("");
  const [returnComment, setReturnComment] =
    useState("");
  const [kpiDrafts, setKpiDrafts] =
    useState<Record<string, KpiDraft>>({});
  const [
    kpiReviewComments,
    setKpiReviewComments,
  ] = useState<Record<string, string>>({});

  const isOwner =
    roadmap.createdByUserId ===
    currentUserId;

  const permissions =
    roadmap.permissions;

  const activitiesQuery = useQuery({
    queryKey: [
      "roadmaps",
      roadmap.id,
      "activity",
    ],
    queryFn: () =>
      getRoadmapActivities(
        roadmap.id,
      ),
    enabled: Boolean(roadmap.id),
    staleTime: 20_000,
    retry: false,
  });

  async function refresh(
    updated?: Roadmap,
  ): Promise<void> {
    if (updated) {
      onRoadmapUpdated?.(updated);
    }

    await Promise.all([
      onChanged(),
      queryClient.invalidateQueries({
        queryKey: [
          "roadmaps",
          roadmap.id,
          "activity",
        ],
      }),
    ]);
  }

  const submitMutation =
    useMutation({
      mutationFn: submitRoadmap,
      onSuccess: async (
        updated,
      ) => refresh(updated),
    });

  const approveMutation =
    useMutation({
      mutationFn: ({
        id,
        comment,
      }: {
        id: string;
        comment?: string;
      }) =>
        approveRoadmap(
          id,
          comment,
        ),
      onSuccess: async (
        updated,
      ) => refresh(updated),
    });

  const returnMutation =
    useMutation({
      mutationFn: ({
        id,
        comment,
      }: {
        id: string;
        comment?: string;
      }) =>
        returnRoadmap(
          id,
          comment,
        ),
      onSuccess: async (
        updated,
      ) => refresh(updated),
    });

  const closeMutation =
    useMutation({
      mutationFn: closeRoadmap,
      onSuccess: async (
        updated,
      ) => refresh(updated),
    });

  const deleteMutation =
    useMutation({
      mutationFn: deleteRoadmap,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["roadmaps"],
        });
        await onChanged();
        onClose();
      },
    });

  const submitKpiMutation =
    useMutation({
      mutationFn: submitItemKpi,
      onSuccess: async (
        updated,
      ) => refresh(updated),
    });

  const reviewKpiMutation =
    useMutation({
      mutationFn: reviewItemKpi,
      onSuccess: async (
        updated,
      ) => refresh(updated),
    });

  const downloadMutation =
    useMutation({
      mutationFn: ({
        itemId,
        fileName,
      }: {
        itemId: string;
        fileName: string;
      }) =>
        downloadRoadmapKpiFile(
          roadmap.id,
          itemId,
          fileName,
        ),
    });

  const displayedError =
    submitMutation.isError
      ? getApiErrorMessage(
          submitMutation.error,
        )
      : approveMutation.isError
        ? getApiErrorMessage(
            approveMutation.error,
          )
        : returnMutation.isError
          ? getApiErrorMessage(
              returnMutation.error,
            )
          : closeMutation.isError
            ? getApiErrorMessage(
                closeMutation.error,
              )
            : deleteMutation.isError
              ? getApiErrorMessage(
                  deleteMutation.error,
                )
              : submitKpiMutation.isError
                ? getApiErrorMessage(
                    submitKpiMutation.error,
                  )
                : reviewKpiMutation.isError
                  ? getApiErrorMessage(
                      reviewKpiMutation.error,
                    )
                  : downloadMutation.isError
                    ? getApiErrorMessage(
                        downloadMutation.error,
                      )
                    : null;

  const pendingActivities =
    useMemo<RoadmapActivity[]>(
      () =>
        activitiesQuery.data ??
        [],
      [activitiesQuery.data],
    );

  function updateKpiText(
    itemId: string,
    value: string,
  ): void {
    setKpiDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {
          kpiText: "",
          file: null,
        }),
        kpiText: value,
      },
    }));
  }

  function updateKpiFile(
    itemId: string,
    file: File | null,
  ): void {
    setKpiDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {
          kpiText: "",
          file: null,
        }),
        file,
      },
    }));
  }

  function updateReviewComment(
    itemId: string,
    value: string,
  ): void {
    setKpiReviewComments(
      (current) => ({
        ...current,
        [itemId]: value,
      }),
    );
  }

  async function submitKpi(
    item: RoadmapItem,
  ): Promise<void> {
    if (
      !item.permissions
        .canSubmitKpi
    ) {
      return;
    }

    const draft =
      kpiDrafts[item.id] ?? {
        kpiText: "",
        file: null,
      };

    await submitKpiMutation.mutateAsync({
      roadmapId: roadmap.id,
      itemId: item.id,
      kpiText:
        draft.kpiText,
      file: draft.file,
    });

    setKpiDrafts(
      (current) => ({
        ...current,
        [item.id]: {
          kpiText: "",
          file: null,
        },
      }),
    );
  }

  async function reviewKpi(
    item: RoadmapItem,
    decision: KpiReviewDecision,
  ): Promise<void> {
    if (
      !item.permissions
        .canReviewKpi
    ) {
      return;
    }

    await reviewKpiMutation.mutateAsync({
      roadmapId: roadmap.id,
      itemId: item.id,
      decision,
      comment:
        kpiReviewComments[
          item.id
        ]?.trim() ||
        undefined,
    });
  }

  async function deleteCurrentRoadmap(): Promise<void> {
    const confirmed =
      window.confirm(
        `Supprimer définitivement la feuille de route ${roadmap.reference} ? Cette action est irréversible.`,
      );

    if (!confirmed) {
      return;
    }

    await deleteMutation.mutateAsync(
      roadmap.id,
    );
  }

  const showRoadmapActions =
    permissions.canEdit ||
    permissions.canSubmit ||
    permissions.canApprove ||
    permissions.canReturn ||
    permissions.canClose ||
    permissions.canDelete;

  return (
    <div
      className="roadmap-drawer-layer"
      role="presentation"
    >
      <button
        className="roadmap-drawer-backdrop"
        type="button"
        aria-label="Fermer les détails"
        onClick={onClose}
      />

      <aside
        className="roadmap-details-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Détails de la feuille de route"
      >
        <header className="roadmap-drawer-header">
          <div>
            <p>
              {roadmap.reference}
            </p>
            <h3>
              {roadmap.title}
            </h3>
            <span>
              {roadmap.calendarYear}
              {" · "}
              {
                roadmapRoleLabels[
                  roadmap.ownerRole
                ]
              }
            </span>
          </div>

          <button
            className="roadmap-icon-button"
            type="button"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        {displayedError && (
          <div
            className="roadmap-form-error"
            role="alert"
          >
            {displayedError}
          </div>
        )}

        {!isOwner && (
          <div
            className={`roadmap-access-banner ${
              permissions.canApprove
                ? "review"
                : "readonly"
            }`}
          >
            <ShieldCheck size={18} />
            <div>
              <strong>
                {permissions.canApprove
                  ? "Validation hiérarchique"
                  : "Consultation uniquement"}
              </strong>

              <p>
                {permissions.canApprove
                  ? "Vous pouvez valider ou retourner cette feuille. Vous pouvez consulter et télécharger les preuves KPI, mais vous ne pouvez pas modifier les objectifs ni renseigner les réalisations du propriétaire."
                  : "Vous pouvez consulter cette feuille et télécharger les pièces KPI disponibles. Aucune modification des objectifs ou réalisations d’une autre personne n’est autorisée."}
              </p>
            </div>
          </div>
        )}

        {isOwner &&
          !permissions.canEdit &&
          roadmap.status !==
            "DRAFT" && (
            <div className="roadmap-access-banner owner-lock">
              <LockKeyhole
                size={18}
              />
              <div>
                <strong>
                  Feuille protégée après soumission
                </strong>
                <p>
                  La structure de votre feuille ne peut plus être modifiée. Une correction générale redevient possible uniquement si elle vous est retournée. Les réalisations KPI peuvent être renseignées après validation du plan.
                </p>
              </div>
            </div>
          )}

        <section className="roadmap-drawer-identity">
          <span
            className={`roadmap-status ${statusClass(
              roadmap.status,
            )}`}
          >
            {
              roadmapStatusLabels[
                roadmap.status
              ]
            }
          </span>

          <div>
            <strong>
              {
                roadmap.progressPercentage
              }
              %
            </strong>
            <span>
              {
                roadmap.completedItemCount
              }
              /
              {roadmap.itemCount}{" "}
              ligne(s) réalisées
            </span>
          </div>

          <div className="roadmap-progress-track">
            <i
              style={{
                width: `${roadmap.progressPercentage}%`,
              }}
            />
          </div>

          <p>
            {getApprovalHelp(
              roadmap.ownerRole,
            )}
          </p>
        </section>

        {showRoadmapActions && (
          <section className="roadmap-drawer-actions">
            {permissions.canEdit &&
              onEdit && (
                <button
                  className="roadmap-secondary-action"
                  type="button"
                  onClick={() =>
                    onEdit(roadmap)
                  }
                >
                  <Pencil
                    size={16}
                  />
                  <span>
                    Modifier
                  </span>
                </button>
              )}

            {permissions.canSubmit && (
              <button
                className="roadmap-primary-button"
                type="button"
                disabled={
                  submitMutation.isPending
                }
                onClick={() =>
                  submitMutation.mutate(
                    roadmap.id,
                  )
                }
              >
                <Send size={16} />
                <span>
                  Soumettre
                </span>
              </button>
            )}

            {permissions.canApprove && (
              <>
                <label className="roadmap-inline-comment">
                  <span>
                    Commentaire de validation
                  </span>
                  <textarea
                    rows={2}
                    value={
                      reviewComment
                    }
                    onChange={(
                      event,
                    ) =>
                      setReviewComment(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Commentaire facultatif..."
                  />
                </label>

                <button
                  className="roadmap-primary-button"
                  type="button"
                  disabled={
                    approveMutation.isPending
                  }
                  onClick={() =>
                    approveMutation.mutate({
                      id: roadmap.id,
                      comment:
                        reviewComment.trim() ||
                        undefined,
                    })
                  }
                >
                  <ShieldCheck
                    size={16}
                  />
                  <span>
                    Valider
                  </span>
                </button>
              </>
            )}

            {permissions.canReturn && (
              <>
                <label className="roadmap-inline-comment">
                  <span>
                    Motif du retour
                  </span>
                  <textarea
                    rows={2}
                    value={
                      returnComment
                    }
                    onChange={(
                      event,
                    ) =>
                      setReturnComment(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Précisez la correction attendue..."
                  />
                </label>

                <button
                  className="roadmap-danger-button"
                  type="button"
                  disabled={
                    returnMutation.isPending
                  }
                  onClick={() =>
                    returnMutation.mutate({
                      id: roadmap.id,
                      comment:
                        returnComment.trim() ||
                        "À reprendre après échange avec le responsable.",
                    })
                  }
                >
                  <RotateCcw
                    size={16}
                  />
                  <span>
                    Retourner
                  </span>
                </button>
              </>
            )}

            {permissions.canClose && (
              <button
                className="roadmap-secondary-action"
                type="button"
                disabled={
                  closeMutation.isPending
                }
                onClick={() =>
                  closeMutation.mutate(
                    roadmap.id,
                  )
                }
              >
                <CheckCircle2
                  size={16}
                />
                <span>
                  Clôturer
                </span>
              </button>
            )}

            {permissions.canDelete && (
              <button
                className="roadmap-danger-button"
                type="button"
                disabled={
                  deleteMutation.isPending
                }
                onClick={() =>
                  void deleteCurrentRoadmap()
                }
                title="Supprimer définitivement cette feuille de route"
               aria-label="Supprimer définitivement cette feuille de route">
                {deleteMutation.isPending ? (
                  <LoaderCircle
                    size={16}
                    className="is-spinning"
                  />
                ) : (
                  <Trash2
                    size={16}
                  />
                )}
                <span>
                  Supprimer
                </span>
              </button>
            )}
          </section>
        )}

        {roadmap.overview && (
          <section className="roadmap-drawer-section">
            <div className="roadmap-drawer-section-heading">
              <FileText
                size={18}
              />
              <h4>
                Présentation générale
              </h4>
            </div>
            <p>
              {roadmap.overview}
            </p>
          </section>
        )}

        <section className="roadmap-drawer-section">
          <div className="roadmap-drawer-section-heading">
            <Target size={18} />
            <h4>
              Lignes et KPI
            </h4>
          </div>

          <div className="roadmap-items-list">
            {roadmap.items.map(
              (item) => {
                const draft =
                  kpiDrafts[
                    item.id
                  ] ?? {
                    kpiText: "",
                    file: null,
                  };

                const canSubmitKpi =
                  item.permissions
                    .canSubmitKpi;

                const showKpiReview =
                  item.permissions
                    .canReviewKpi;

                const isValidated =
                  item.reviewStatus ===
                  "VALIDATED";

                const needsDiscussion =
                  item.reviewStatus ===
                  "NEEDS_DISCUSSION";

                return (
                  <article
                    className={`roadmap-item-card ${
                      isValidated
                        ? "is-validated"
                        : needsDiscussion
                          ? "needs-discussion"
                          : ""
                    }`}
                    key={
                      item.id
                    }
                  >
                    <header>
                      <div>
                        <span>
                          {getItemStatusText(
                            item,
                          )}
                        </span>
                        <h5>
                          {
                            item.title
                          }
                        </h5>
                      </div>

                      <span
                        className={`roadmap-kpi-status ${statusClass(
                          item.reviewStatus,
                        )}`}
                      >
                        {
                          kpiReviewLabels[
                            item
                              .reviewStatus
                          ]
                        }
                      </span>
                    </header>

                    {item.description && (
                      <p>
                        {
                          item.description
                        }
                      </p>
                    )}

                    <dl className="roadmap-item-meta">
                      <div>
                        <dt>
                          KPI attendu
                        </dt>
                        <dd>
                          {
                            item.kpiLabel
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Période
                        </dt>
                        <dd>
                          {item.plannedPeriod ||
                            "Non renseignée"}
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Échéance
                        </dt>
                        <dd>
                          {formatRoadmapDateOnly(
                            item.dueDate,
                          )}
                        </dd>
                      </div>
                    </dl>

                    {(item.kpiText ||
                      item.kpiFile) && (
                      <div className="roadmap-kpi-proof">
                        <strong>
                          Preuve KPI déposée
                        </strong>

                        {item.kpiText && (
                          <p>
                            {
                              item.kpiText
                            }
                          </p>
                        )}

                        {item.kpiFile && (
                          <>
                            {item.permissions
                              .canDownloadKpiFile ? (
                              <button
                                type="button"
                                disabled={
                                  downloadMutation.isPending
                                }
                                onClick={() =>
                                  downloadMutation.mutate({
                                    itemId:
                                      item.id,
                                    fileName:
                                      item
                                        .kpiFile
                                        ?.originalFileName ??
                                      "kpi",
                                  })
                                }
                              >
                                <Download
                                  size={15}
                                />
                                <span>
                                  {
                                    item
                                      .kpiFile
                                      .originalFileName
                                  }
                                  {" · "}
                                  {formatFileSize(
                                    item
                                      .kpiFile
                                      .sizeBytes,
                                  )}
                                </span>
                              </button>
                            ) : (
                              <small>
                                Pièce non accessible.
                              </small>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {item.review && (
                      <div className="roadmap-kpi-review">
                        <strong>
                          Contrôle :{" "}
                          {
                            kpiReviewLabels[
                              item.review
                                .status
                            ]
                          }
                        </strong>
                        <p>
                          {
                            item.review
                              .reviewedByName
                          }
                          {" · "}
                          {formatRoadmapDate(
                            item.review
                              .reviewedAt,
                          )}
                        </p>
                        {item.review
                          .comment && (
                          <span>
                            {
                              item.review
                                .comment
                            }
                          </span>
                        )}
                      </div>
                    )}

                    {isValidated && (
                      <div className="roadmap-item-lock-note validated">
                        <LockKeyhole
                          size={16}
                        />
                        <span>
                          Mission validée : la réalisation et sa preuve sont verrouillées.
                        </span>
                      </div>
                    )}

                    {item.reviewStatus ===
                      "PENDING_REVIEW" &&
                      isOwner && (
                        <div className="roadmap-item-lock-note pending">
                          <ShieldCheck
                            size={16}
                          />
                          <span>
                            Réalisation envoyée. Elle reste verrouillée pendant le contrôle hiérarchique.
                          </span>
                        </div>
                      )}

                    {needsDiscussion &&
                      isOwner && (
                        <div className="roadmap-item-lock-note discussion">
                          <MessageSquareText
                            size={16}
                          />
                          <span>
                            Votre responsable demande un échange. Cette mission est rouverte uniquement pour vous permettre de corriger puis renvoyer le KPI.
                          </span>
                        </div>
                      )}

                    {canSubmitKpi && (
                      <div className="roadmap-kpi-submit-box">
                        <label>
                          <span>
                            {needsDiscussion
                              ? "Correction / réponse au responsable"
                              : "Commentaire de réalisation"}
                          </span>
                          <textarea
                            rows={2}
                            value={
                              draft.kpiText
                            }
                            onChange={(
                              event,
                            ) =>
                              updateKpiText(
                                item.id,
                                event
                                  .target
                                  .value,
                              )
                            }
                            placeholder="Résultat obtenu, référence ou observation..."
                          />
                        </label>

                        <label className="roadmap-file-picker">
                          <UploadCloud
                            size={17}
                          />
                          <span>
                            {draft.file
                              ? draft
                                  .file
                                  .name
                              : item.kpiFile
                                ? "Remplacer la pièce KPI"
                                : "Joindre une preuve KPI facultative"}
                          </span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                            onChange={(
                              event: ChangeEvent<HTMLInputElement>,
                            ) =>
                              updateKpiFile(
                                item.id,
                                event
                                  .target
                                  .files?.[0] ??
                                  null,
                              )
                            }
                          />
                        </label>

                        <button
                          className="roadmap-primary-button"
                          type="button"
                          disabled={
                            submitKpiMutation.isPending
                          }
                          onClick={() =>
                            void submitKpi(
                              item,
                            )
                          }
                        >
                          {submitKpiMutation.isPending ? (
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
                            {needsDiscussion
                              ? "Renvoyer la réalisation"
                              : "Marquer réalisée"}
                          </span>
                        </button>
                      </div>
                    )}

                    {showKpiReview && (
                      <div className="roadmap-kpi-submit-box roadmap-review-only-box">
                        <div className="roadmap-review-role-note">
                          <ShieldCheck
                            size={16}
                          />
                          <span>
                            Vous contrôlez la réalisation. Vous ne pouvez pas modifier la preuve déposée par son propriétaire.
                          </span>
                        </div>

                        <label>
                          <span>
                            Commentaire de contrôle
                          </span>
                          <textarea
                            rows={2}
                            value={
                              kpiReviewComments[
                                item.id
                              ] ??
                              ""
                            }
                            onChange={(
                              event,
                            ) =>
                              updateReviewComment(
                                item.id,
                                event
                                  .target
                                  .value,
                              )
                            }
                            placeholder="Observation facultative..."
                          />
                        </label>

                        <div className="roadmap-kpi-review-actions">
                          <button
                            className="roadmap-primary-button"
                            type="button"
                            disabled={
                              reviewKpiMutation.isPending
                            }
                            onClick={() =>
                              void reviewKpi(
                                item,
                                "VALIDATED",
                              )
                            }
                          >
                            <ShieldCheck
                              size={16}
                            />
                            <span>
                              Valider KPI
                            </span>
                          </button>

                          <button
                            className="roadmap-secondary-action"
                            type="button"
                            disabled={
                              reviewKpiMutation.isPending
                            }
                            onClick={() =>
                              void reviewKpi(
                                item,
                                "NEEDS_DISCUSSION",
                              )
                            }
                          >
                            <MessageSquareText
                              size={16}
                            />
                            <span>
                              À discuter
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              },
            )}
          </div>
        </section>

        <section className="roadmap-drawer-section">
          <div className="roadmap-drawer-section-heading">
            <History size={18} />
            <h4>
              Historique
            </h4>
          </div>

          {activitiesQuery.isLoading && (
            <div className="roadmap-empty">
              <LoaderCircle
                size={20}
                className="is-spinning"
              />
              Chargement de l’historique...
            </div>
          )}

          {!activitiesQuery.isLoading &&
            pendingActivities.length ===
              0 && (
              <div className="roadmap-empty">
                Aucune activité enregistrée.
              </div>
            )}

          <div className="roadmap-activity-list">
            {pendingActivities.map(
              (activity) => (
                <article
                  key={
                    activity.id
                  }
                >
                  <span />
                  <div>
                    <strong>
                      {activityLabels[
                        activity
                          .action
                      ] ??
                        activity.action}
                    </strong>
                    <p>
                      {
                        activity.summary
                      }
                    </p>
                    <small>
                      {
                        activity.actorName
                      }
                      {" · "}
                      {formatRoadmapDate(
                        activity.createdAt,
                      )}
                    </small>
                  </div>
                </article>
              ),
            )}
          </div>
        </section>

        <footer className="roadmap-drawer-footer">
          <CalendarClock
            size={16}
          />
          <span>
            Dernière mise à jour :{" "}
            {formatRoadmapDate(
              roadmap.updatedAt,
            )}
          </span>
        </footer>
      </aside>
    </div>
  );
}
