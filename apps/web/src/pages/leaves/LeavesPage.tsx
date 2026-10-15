import {
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Edit3,
  FileClock,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShieldX,
  WalletCards,
  X,
} from "lucide-react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "../../features/auth/auth.context";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { getAgents } from "../../features/agents/agent.api";
import type { Agent } from "../../features/agents/agent.types";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  getLeaveActivities,
  getLeaveBalances,
  getLeaveCalendar,
  getLeaveDashboard,
  getLeaveRequestById,
  getLeaveRequests,
  reviewLeaveByManager,
  reviewLeaveFinal,
  submitLeaveRequest,
  updateLeaveRequest,
  upsertLeaveBalance,
} from "../../features/leaves/leave.api";
import type {
  CreateLeaveRequestInput,
  LeaveBalance,
  LeaveRequest,
  LeaveRequestStatus,
  LeaveReviewDecision,
  LeaveType,
  UpdateLeaveRequestInput,
  UpsertLeaveBalanceInput,
} from "../../features/leaves/leave.types";
import {
  calculateWorkingDaysPreview,
  formatDays,
  formatLeaveDate,
  formatLeaveDateTime,
  getCurrentYear,
  getLeaveStatusClass,
  leaveActivityLabels,
  leaveStatusLabels,
  leaveTypeLabels,
} from "../../features/leaves/leave.utils";
import "./leaves-page.css";

type UserRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

type RequestFilters = {
  search: string;
  status: "" | LeaveRequestStatus;
  leaveType: "" | LeaveType;
  agentId: string;
};

type ReviewAction = {
  mode: "manager" | "final" | "cancel";
  request: LeaveRequest;
};

type RequestModalProps = {
  request?: LeaveRequest | null;
  canChooseAgent: boolean;
  agents: Agent[];
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (
    input: CreateLeaveRequestInput | UpdateLeaveRequestInput,
    submitNow: boolean,
  ) => Promise<void>;
};

function LeaveRequestModal({
  request,
  canChooseAgent,
  agents,
  isSubmitting,
  errorMessage,
  onClose,
  onSave,
}: RequestModalProps) {
  const isEditing = Boolean(request);

  const [agentId, setAgentId] = useState(
    request?.agentId ?? "",
  );
  const [leaveType, setLeaveType] = useState<LeaveType>(
    request?.leaveType ?? "ANNUAL_LEAVE",
  );
  const [startDate, setStartDate] = useState(
    request?.startDate ?? "",
  );
  const [endDate, setEndDate] = useState(
    request?.endDate ?? "",
  );
  const [reason, setReason] = useState(
    request?.reason ?? "",
  );
  const [clientError, setClientError] = useState<
    string | null
  >(null);

  const requestedDays = calculateWorkingDaysPreview(
    startDate,
    endDate,
  );

  async function save(submitNow: boolean): Promise<void> {
    setClientError(null);

    if (canChooseAgent && !isEditing && !agentId) {
      setClientError("Sélectionnez l'Agent concerné.");
      return;
    }

    if (!startDate || !endDate || endDate < startDate) {
      setClientError(
        "Renseignez une période de congé valide.",
      );
      return;
    }

    if (!reason.trim() || reason.trim().length < 3) {
      setClientError(
        "Renseignez un motif d'au moins trois caractères.",
      );
      return;
    }

    await onSave(
      isEditing
        ? {
            leaveType,
            startDate,
            endDate,
            reason: reason.trim(),
          }
        : {
            ...(agentId ? { agentId } : {}),
            leaveType,
            startDate,
            endDate,
            reason: reason.trim(),
          },
      submitNow,
    );
  }

  return (
    <div className="leave-modal-layer">
      <button
        className="leave-modal-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <section
        className="leave-modal"
        role="dialog"
        aria-modal="true"
      >
        <header className="leave-modal-header">
          <div>
            <p>
              {isEditing
                ? "MISE À JOUR DU BROUILLON"
                : "NOUVELLE DEMANDE"}
            </p>
            <h3>
              {isEditing
                ? "Modifier la demande"
                : "Demande de congé ou d'absence"}
            </h3>
          </div>

          <button
            className="leave-icon-button"
            type="button"
            aria-label="Fermer"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        {(clientError || errorMessage) && (
          <div className="leave-inline-error">
            <CircleAlert size={17} />
            <span>{clientError ?? errorMessage}</span>
          </div>
        )}

        <div className="leave-form-grid">
          {canChooseAgent && !isEditing && (
            <label className="leave-form-field leave-field-full">
              <span>Agent concerné</span>
              <select
                value={agentId}
                disabled={isSubmitting}
                onChange={(event) => setAgentId(event.target.value)}
              >
                <option value="">Sélectionner un Agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.fullName} · {agent.jobTitle}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="leave-form-field">
            <span>Type d'absence</span>
            <select
              value={leaveType}
              disabled={isSubmitting}
              onChange={(event) =>
                setLeaveType(event.target.value as LeaveType)
              }
            >
              {Object.entries(leaveTypeLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <article className="leave-days-preview">
            <span>Jours ouvrés estimés</span>
            <strong>{formatDays(requestedDays)}</strong>
            <small>
              Hors samedi et dimanche. Le calcul officiel est
              effectué par le serveur.
            </small>
          </article>

          <label className="leave-form-field">
            <span>Date de début</span>
            <input
              type="date"
              value={startDate}
              disabled={isSubmitting}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label className="leave-form-field">
            <span>Date de fin</span>
            <input
              type="date"
              min={startDate || undefined}
              value={endDate}
              disabled={isSubmitting}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>

          <label className="leave-form-field leave-field-full">
            <span>Motif de la demande</span>
            <textarea
              rows={5}
              value={reason}
              disabled={isSubmitting}
              placeholder="Décrivez brièvement le motif de la demande..."
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </div>

        <footer className="leave-modal-footer">
          <button
            className="leave-cancel-button"
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Annuler
          </button>

          <button
            className="leave-secondary-action"
            type="button"
            disabled={isSubmitting}
            onClick={() => void save(false)}
          >
            {isSubmitting ? (
              <LoaderCircle size={17} className="is-spinning" />
            ) : (
              <Edit3 size={17} />
            )}
            <span>Enregistrer le brouillon</span>
          </button>

          <button
            className="leave-primary-button"
            type="button"
            disabled={isSubmitting}
            onClick={() => void save(true)}
          >
            {isSubmitting ? (
              <LoaderCircle size={17} className="is-spinning" />
            ) : (
              <Send size={17} />
            )}
            <span>Soumettre la demande</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

type DecisionModalProps = {
  action: ReviewAction;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (
    decision: LeaveReviewDecision | null,
    comment: string,
  ) => Promise<void>;
};

function LeaveDecisionModal({
  action,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: DecisionModalProps) {
  const [decision, setDecision] =
    useState<LeaveReviewDecision>("APPROVED");
  const [comment, setComment] = useState("");
  const [clientError, setClientError] = useState<string | null>(
    null,
  );

  const isCancellation = action.mode === "cancel";
  const title = isCancellation
    ? "Annuler la demande"
    : action.mode === "manager"
      ? "Validation hiérarchique"
      : "Décision finale RH";

  async function submit(): Promise<void> {
    setClientError(null);

    if (
      (isCancellation || decision === "REJECTED") &&
      comment.trim().length < 3
    ) {
      setClientError(
        isCancellation
          ? "Le motif d'annulation est requis."
          : "Un motif de refus est requis.",
      );
      return;
    }

    await onSubmit(
      isCancellation ? null : decision,
      comment.trim(),
    );
  }

  return (
    <div className="leave-modal-layer">
      <button
        className="leave-modal-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <section
        className="leave-modal leave-decision-modal"
        role="dialog"
        aria-modal="true"
      >
        <header className="leave-modal-header">
          <div>
            <p>ACTION DE VALIDATION</p>
            <h3>{title}</h3>
          </div>

          <button
            className="leave-icon-button"
            type="button"
            aria-label="Fermer"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <div className="leave-decision-summary">
          <strong>
            {action.request.agent?.fullName ?? "Agent"}
          </strong>
          <span>
            {leaveTypeLabels[action.request.leaveType]} ·{" "}
            {formatLeaveDate(action.request.startDate)} au{" "}
            {formatLeaveDate(action.request.endDate)}
          </span>
        </div>

        {(clientError || errorMessage) && (
          <div className="leave-inline-error">
            <CircleAlert size={17} />
            <span>{clientError ?? errorMessage}</span>
          </div>
        )}

        {!isCancellation && (
          <div className="leave-decision-options">
            <button
              className={
                decision === "APPROVED" ? "is-selected approve" : ""
              }
              type="button"
              onClick={() => setDecision("APPROVED")}
            >
              <CheckCircle2 size={18} />
              <span>Approuver</span>
            </button>

            <button
              className={
                decision === "REJECTED" ? "is-selected reject" : ""
              }
              type="button"
              onClick={() => setDecision("REJECTED")}
            >
              <ShieldX size={18} />
              <span>Refuser</span>
            </button>
          </div>
        )}

        <label className="leave-form-field">
          <span>
            {isCancellation
              ? "Motif d'annulation"
              : decision === "REJECTED"
                ? "Motif de refus"
                : "Commentaire facultatif"}
          </span>

          <textarea
            rows={4}
            disabled={isSubmitting}
            value={comment}
            placeholder={
              isCancellation
                ? "Expliquez le motif de l'annulation..."
                : "Ajoutez une précision destinée à l'Agent..."
            }
            onChange={(event) => setComment(event.target.value)}
          />
        </label>

        <footer className="leave-modal-footer">
          <button
            className="leave-cancel-button"
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Annuler
          </button>

          <button
            className={
              isCancellation || decision === "REJECTED"
                ? "leave-danger-button"
                : "leave-primary-button"
            }
            type="button"
            disabled={isSubmitting}
            onClick={() => void submit()}
          >
            {isSubmitting ? (
              <LoaderCircle size={17} className="is-spinning" />
            ) : isCancellation ? (
              <ShieldX size={17} />
            ) : decision === "APPROVED" ? (
              <CheckCircle2 size={17} />
            ) : (
              <ShieldX size={17} />
            )}
            <span>
              {isCancellation
                ? "Confirmer l'annulation"
                : decision === "APPROVED"
                  ? "Confirmer l'approbation"
                  : "Confirmer le refus"}
            </span>
          </button>
        </footer>
      </section>
    </div>
  );
}

type BalanceModalProps = {
  agents: Agent[];
  balance?: LeaveBalance | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (input: UpsertLeaveBalanceInput) => Promise<void>;
};

function LeaveBalanceModal({
  agents,
  balance,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: BalanceModalProps) {
  const [agentId, setAgentId] = useState(
    balance?.agentId ?? "",
  );
  const [calendarYear, setCalendarYear] = useState(
    balance?.calendarYear ?? getCurrentYear(),
  );
  const [leaveType, setLeaveType] = useState<LeaveType>(
    balance?.leaveType ?? "ANNUAL_LEAVE",
  );
  const [openingDays, setOpeningDays] = useState(
    balance?.openingDays ?? 0,
  );
  const [entitledDays, setEntitledDays] = useState(
    balance?.entitledDays ?? 0,
  );
  const [carriedOverDays, setCarriedOverDays] = useState(
    balance?.carriedOverDays ?? 0,
  );
  const [adjustmentDays, setAdjustmentDays] = useState(
    balance?.adjustmentDays ?? 0,
  );
  const [clientError, setClientError] = useState<string | null>(
    null,
  );

  const available =
    Number(openingDays) +
    Number(entitledDays) +
    Number(carriedOverDays) +
    Number(adjustmentDays) -
    (balance?.consumedDays ?? 0);

  async function submit(): Promise<void> {
    setClientError(null);

    if (!agentId) {
      setClientError("Sélectionnez un Agent.");
      return;
    }

    await onSubmit({
      agentId,
      calendarYear: Number(calendarYear),
      leaveType,
      openingDays: Number(openingDays),
      entitledDays: Number(entitledDays),
      carriedOverDays: Number(carriedOverDays),
      adjustmentDays: Number(adjustmentDays),
    });
  }

  return (
    <div className="leave-modal-layer">
      <button
        className="leave-modal-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <section className="leave-modal" role="dialog" aria-modal="true">
        <header className="leave-modal-header">
          <div>
            <p>ADMINISTRATION RH</p>
            <h3>Configurer un solde de congé</h3>
          </div>

          <button
            className="leave-icon-button"
            type="button"
            aria-label="Fermer"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        {(clientError || errorMessage) && (
          <div className="leave-inline-error">
            <CircleAlert size={17} />
            <span>{clientError ?? errorMessage}</span>
          </div>
        )}

        <div className="leave-form-grid">
          <label className="leave-form-field leave-field-full">
            <span>Agent</span>
            <select
              value={agentId}
              disabled={isSubmitting || Boolean(balance)}
              onChange={(event) => setAgentId(event.target.value)}
            >
              <option value="">Sélectionner un Agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.fullName} · {agent.jobTitle}
                </option>
              ))}
            </select>
          </label>

          <label className="leave-form-field">
            <span>Année</span>
            <input
              type="number"
              min="2020"
              max="2200"
              value={calendarYear}
              disabled={isSubmitting || Boolean(balance)}
              onChange={(event) =>
                setCalendarYear(Number(event.target.value))
              }
            />
          </label>

          <label className="leave-form-field">
            <span>Type de congé</span>
            <select
              value={leaveType}
              disabled={isSubmitting || Boolean(balance)}
              onChange={(event) =>
                setLeaveType(event.target.value as LeaveType)
              }
            >
              {Object.entries(leaveTypeLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="leave-form-field">
            <span>Solde initial</span>
            <input
              type="number"
              step="0.5"
              value={openingDays}
              disabled={isSubmitting}
              onChange={(event) =>
                setOpeningDays(Number(event.target.value))
              }
            />
          </label>

          <label className="leave-form-field">
            <span>Droits acquis</span>
            <input
              type="number"
              step="0.5"
              value={entitledDays}
              disabled={isSubmitting}
              onChange={(event) =>
                setEntitledDays(Number(event.target.value))
              }
            />
          </label>

          <label className="leave-form-field">
            <span>Report antérieur</span>
            <input
              type="number"
              step="0.5"
              value={carriedOverDays}
              disabled={isSubmitting}
              onChange={(event) =>
                setCarriedOverDays(Number(event.target.value))
              }
            />
          </label>

          <label className="leave-form-field">
            <span>Ajustement RH</span>
            <input
              type="number"
              step="0.5"
              value={adjustmentDays}
              disabled={isSubmitting}
              onChange={(event) =>
                setAdjustmentDays(Number(event.target.value))
              }
            />
          </label>
        </div>

        <div className="leave-balance-result">
          <span>Solde disponible après paramétrage</span>
          <strong>{formatDays(available)}</strong>
          <small>
            Déjà consommé : {formatDays(balance?.consumedDays ?? 0)}
          </small>
        </div>

        <footer className="leave-modal-footer">
          <button
            className="leave-cancel-button"
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Annuler
          </button>

          <button
            className="leave-primary-button"
            type="button"
            disabled={isSubmitting}
            onClick={() => void submit()}
          >
            {isSubmitting ? (
              <LoaderCircle size={17} className="is-spinning" />
            ) : (
              <WalletCards size={17} />
            )}
            <span>Enregistrer le solde</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

type LeaveDrawerProps = {
  request: LeaveRequest;
  role: UserRole;
  onClose: () => void;
  onEdit: (request: LeaveRequest) => void;
  onReview: (action: ReviewAction) => void;
};

function LeaveDetailsDrawer({
  request,
  role,
  onClose,
  onEdit,
  onReview,
}: LeaveDrawerProps) {
  const activitiesQuery = useQuery({
    queryKey: ["leaves", "activities", request.id],
    queryFn: () => getLeaveActivities(request.id),
    staleTime: 15_000,
  });

  const canReviewManager =
    ["DIRECTION", "SERVICE_MANAGER"].includes(role) &&
    request.status === "SUBMITTED";

  const canReviewFinal =
    ["TENANT_ADMIN", "RH_MANAGER"].includes(role) &&
    ["SUBMITTED", "MANAGER_APPROVED"].includes(request.status);

  const canEdit = request.status === "DRAFT";

  const canCancel =
    !["REJECTED", "CANCELLED"].includes(request.status);

  return (
    <div className="leave-drawer-layer">
      <button
        className="leave-drawer-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <aside
        className="leave-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Détails de la demande"
      >
        <header className="leave-drawer-header">
          <div>
            <p>DEMANDE D'ABSENCE</p>
            <h3>
              {request.agent?.fullName ?? "Demande de congé"}
            </h3>
          </div>

          <button
            className="leave-icon-button"
            type="button"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <section className="leave-drawer-intro">
          <span
            className={`leave-status-badge ${getLeaveStatusClass(
              request.status,
            )}`}
          >
            {leaveStatusLabels[request.status]}
          </span>

          <strong>{leaveTypeLabels[request.leaveType]}</strong>

          <p>
            {formatLeaveDate(request.startDate)} au{" "}
            {formatLeaveDate(request.endDate)} ·{" "}
            {formatDays(request.requestedDays)}
          </p>
        </section>

        <section className="leave-drawer-section">
          <div className="leave-drawer-heading">
            <ClipboardCheck size={18} />
            <h4>Motif déclaré</h4>
          </div>
          <p className="leave-reason">{request.reason}</p>
        </section>

        <section className="leave-drawer-section">
          <div className="leave-drawer-heading">
            <ShieldCheck size={18} />
            <h4>Décisions</h4>
          </div>

          <div className="leave-review-cards">
            <article>
              <span>Validation hiérarchique</span>
              <strong>
                {request.managerReview
                  ? request.managerReview.decision === "APPROVED"
                    ? "Validée"
                    : "Refusée"
                  : "En attente"}
              </strong>
              <small>
                {request.managerReview
                  ? `${request.managerReview.reviewedByName} · ${formatLeaveDateTime(
                      request.managerReview.decidedAt,
                    )}`
                  : "Aucune décision enregistrée"}
              </small>
              {request.managerReview?.comment && (
                <p>{request.managerReview.comment}</p>
              )}
            </article>

            <article>
              <span>Décision finale RH</span>
              <strong>
                {request.finalReview
                  ? request.finalReview.decision === "APPROVED"
                    ? "Approuvée"
                    : "Refusée"
                  : "En attente"}
              </strong>
              <small>
                {request.finalReview
                  ? `${request.finalReview.reviewedByName} · ${formatLeaveDateTime(
                      request.finalReview.decidedAt,
                    )}`
                  : "Aucune décision enregistrée"}
              </small>
              {request.finalReview?.comment && (
                <p>{request.finalReview.comment}</p>
              )}
            </article>
          </div>
        </section>

        {(canEdit || canReviewManager || canReviewFinal || canCancel) && (
          <section className="leave-drawer-section">
            <div className="leave-drawer-heading">
              <Activity size={18} />
              <h4>Actions</h4>
            </div>

            <div className="leave-drawer-actions">
              {canEdit && (
                <button type="button" onClick={() => onEdit(request)} data-ui-action="compact" aria-label="Modifier le brouillon" title="Modifier le brouillon">
                  <Edit3 size={16} /><span className="ui-action-label">
                  Modifier le brouillon
                </span></button>
              )}

              {canReviewManager && (
                <button
                  type="button"
                  onClick={() =>
                    onReview({ mode: "manager", request })
                  }
                >
                  <ClipboardCheck size={16} />
                  Valider hiérarchiquement
                </button>
              )}

              {canReviewFinal && (
                <button
                  type="button"
                  onClick={() =>
                    onReview({ mode: "final", request })
                  }
                >
                  <BadgeCheck size={16} />
                  Rendre la décision RH
                </button>
              )}

              {canCancel && (
                <button
                  className="is-danger"
                  type="button"
                  onClick={() =>
                    onReview({ mode: "cancel", request })
                  }
                >
                  <ShieldX size={16} />
                  Annuler la demande
                </button>
              )}
            </div>
          </section>
        )}

        <section className="leave-drawer-section">
          <div className="leave-drawer-heading">
            <Clock3 size={18} />
            <h4>Historique et traçabilité</h4>
          </div>

          {activitiesQuery.isLoading && (
            <div className="leave-inline-loading">
              <LoaderCircle size={18} className="is-spinning" />
              <span>Chargement de l'historique...</span>
            </div>
          )}

          {activitiesQuery.isError && (
            <div className="leave-inline-error">
              {getApiErrorMessage(activitiesQuery.error)}
            </div>
          )}

          <div className="leave-timeline">
            {activitiesQuery.data?.map((activity) => (
              <article key={activity.id}>
                <span />
                <div>
                  <strong>
                    {leaveActivityLabels[activity.action] ??
                      activity.action}
                  </strong>
                  <p>{activity.summary}</p>
                  <small>
                    {activity.actorName} ·{" "}
                    {formatLeaveDateTime(activity.createdAt)}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

export default function LeavesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const role = user?.role as UserRole;
  const currentYear = getCurrentYear();

  const [filters, setFilters] = useState<RequestFilters>({
    search: "",
    status: "",
    leaveType: "",
    agentId: "",
  });
  const [page, setPage] = useState(1);
  const [requestModal, setRequestModal] = useState(false);
  const [editingRequest, setEditingRequest] =
    useState<LeaveRequest | null>(null);
  const [selectedRequestId, setSelectedRequestId] =
    useState<string | null>(null);
  const [decisionAction, setDecisionAction] =
    useState<ReviewAction | null>(null);
  const [balanceModal, setBalanceModal] =
    useState<LeaveBalance | null | "new">(null);

  const canManageBalances = [
    "TENANT_ADMIN",
    "RH_MANAGER",
  ].includes(role);

  const canChooseAgent = role !== "AGENT";

  const agentsQuery = useQuery({
    queryKey: ["agents", "leaves"],
    queryFn: () =>
      getAgents({
        page: 1,
        limit: 100,
        employmentStatus: "ACTIVE",
      }),
    enabled: canChooseAgent || canManageBalances,
    staleTime: 60_000,
  });

  const dashboardQuery = useQuery({
    queryKey: ["leaves", "dashboard", currentYear],
    queryFn: () => getLeaveDashboard(currentYear),
    staleTime: 15_000,
  });

  const balancesQuery = useQuery({
    queryKey: ["leaves", "balances", currentYear],
    queryFn: () =>
      getLeaveBalances({ calendarYear: currentYear }),
    staleTime: 15_000,
  });

  const calendarQuery = useQuery({
    queryKey: ["leaves", "calendar"],
    queryFn: () => getLeaveCalendar(),
    staleTime: 15_000,
  });

  const requestsQuery = useQuery({
    queryKey: ["leaves", "requests", page, filters],
    queryFn: () =>
      getLeaveRequests({
        page,
        limit: 15,
        search: filters.search || undefined,
        status: filters.status || undefined,
        leaveType: filters.leaveType || undefined,
        agentId: filters.agentId || undefined,
        sort: "START_DATE_DESC",
      }),
    staleTime: 10_000,
  });

  const selectedRequestQuery = useQuery({
    queryKey: ["leaves", "request", selectedRequestId],
    queryFn: () => getLeaveRequestById(selectedRequestId ?? ""),
    enabled: Boolean(selectedRequestId),
    staleTime: 10_000,
  });

  async function refreshLeaves(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ["leaves"] });
  }

  const createMutation = useMutation({
    mutationFn: createLeaveRequest,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateLeaveRequestInput;
    }) => updateLeaveRequest(id, input),
  });

  const submitMutation = useMutation({
    mutationFn: submitLeaveRequest,
  });

  const reviewManagerMutation = useMutation({
    mutationFn: ({
      id,
      decision,
      comment,
    }: {
      id: string;
      decision: LeaveReviewDecision;
      comment: string;
    }) => reviewLeaveByManager(id, { decision, comment }),
  });

  const reviewFinalMutation = useMutation({
    mutationFn: ({
      id,
      decision,
      comment,
    }: {
      id: string;
      decision: LeaveReviewDecision;
      comment: string;
    }) => reviewLeaveFinal(id, { decision, comment }),
  });

  const cancelMutation = useMutation({
    mutationFn: ({
      id,
      reason,
    }: {
      id: string;
      reason: string;
    }) => cancelLeaveRequest(id, reason),
  });

  const balanceMutation = useMutation({
    mutationFn: upsertLeaveBalance,
  });

  const agents = agentsQuery.data?.items ?? [];
  const requests = requestsQuery.data?.items ?? [];
  const pagination = requestsQuery.data?.pagination;
  const dashboard = dashboardQuery.data;

  const selectedError =
    selectedRequestQuery.isError
      ? getApiErrorMessage(selectedRequestQuery.error)
      : null;

  const currentError =
    createMutation.isError
      ? getApiErrorMessage(createMutation.error)
      : updateMutation.isError
        ? getApiErrorMessage(updateMutation.error)
        : submitMutation.isError
          ? getApiErrorMessage(submitMutation.error)
          : reviewManagerMutation.isError
            ? getApiErrorMessage(reviewManagerMutation.error)
            : reviewFinalMutation.isError
              ? getApiErrorMessage(reviewFinalMutation.error)
              : cancelMutation.isError
                ? getApiErrorMessage(cancelMutation.error)
                : balanceMutation.isError
                  ? getApiErrorMessage(balanceMutation.error)
                  : null;

  const actionLoading =
    createMutation.isPending ||
    updateMutation.isPending ||
    submitMutation.isPending ||
    reviewManagerMutation.isPending ||
    reviewFinalMutation.isPending ||
    cancelMutation.isPending ||
    balanceMutation.isPending;

  const userBalances = useMemo(
    () => balancesQuery.data ?? [],
    [balancesQuery.data],
  );

  function updateFilter(
    key: keyof RequestFilters,
    value: string,
  ): void {
    setPage(1);
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveRequest(
    input: CreateLeaveRequestInput | UpdateLeaveRequestInput,
    submitNow: boolean,
  ): Promise<void> {
    let request: LeaveRequest;

    if (editingRequest) {
      request = await updateMutation.mutateAsync({
        id: editingRequest.id,
        input: input as UpdateLeaveRequestInput,
      });
    } else {
      request = await createMutation.mutateAsync(
        input as CreateLeaveRequestInput,
      );
    }

    if (submitNow) {
      await submitMutation.mutateAsync(request.id);
    }

    await refreshLeaves();
    setRequestModal(false);
    setEditingRequest(null);
  }

  async function executeDecision(
    decision: LeaveReviewDecision | null,
    comment: string,
  ): Promise<void> {
    if (!decisionAction) {
      return;
    }

    const { request, mode } = decisionAction;

    if (mode === "manager" && decision) {
      await reviewManagerMutation.mutateAsync({
        id: request.id,
        decision,
        comment,
      });
    }

    if (mode === "final" && decision) {
      await reviewFinalMutation.mutateAsync({
        id: request.id,
        decision,
        comment,
      });
    }

    if (mode === "cancel") {
      await cancelMutation.mutateAsync({
        id: request.id,
        reason: comment,
      });
    }

    await refreshLeaves();
    setDecisionAction(null);
    setSelectedRequestId(null);
  }

  async function saveBalance(
    input: UpsertLeaveBalanceInput,
  ): Promise<void> {
    await balanceMutation.mutateAsync(input);
    await refreshLeaves();
    setBalanceModal(null);
  }

  return (
    <section className="leaves-page">
      <header className="leaves-hero">
        <div>
          <p className="leaves-eyebrow">
            CONGÉS, ABSENCES ET VALIDATIONS
          </p>
          <h2>
            Absences <span>maîtrisées.</span>
          </h2>
 
        </div>

        <div className="leaves-hero-actions">
          <button
            className="leave-secondary-action"
            type="button"
            onClick={() => void refreshLeaves()}
           data-ui-action="compact" aria-label="Actualiser" title="Actualiser">
            <RefreshCw size={18} /><span className="ui-action-label">
            Actualiser
          </span></button>

          {canManageBalances && (
            <button
              className="leave-secondary-action"
              type="button"
              onClick={() => {
                balanceMutation.reset();
                setBalanceModal("new");
              }}
            >
              <WalletCards size={18} />
              Configurer un solde
            </button>
          )}

          <button
            className="leave-primary-button"
            type="button"
            onClick={() => {
              createMutation.reset();
              updateMutation.reset();
              setEditingRequest(null);
              setRequestModal(true);
            }}
           data-ui-action="compact" aria-label="Nouvelle demande" title="Nouvelle demande">
            <Plus size={18} /><span className="ui-action-label">
            Nouvelle demande
          </span></button>
        </div>
      </header>

      {(dashboardQuery.isError || requestsQuery.isError) && (
        <div className="leave-global-error">
          <CircleAlert size={20} />
          <div>
            <strong>
              Les données de congés sont momentanément indisponibles.
            </strong>
            <p>
              {dashboardQuery.isError
                ? getApiErrorMessage(dashboardQuery.error)
                : getApiErrorMessage(requestsQuery.error)}
            </p>
          </div>
        </div>
      )}

      <section className="leave-kpis">
        <article>
          <span className="leave-kpi-icon total">
            <CalendarDays size={21} />
          </span>
          <div>
            <span>Demandes {currentYear}</span>
            <strong>{dashboard?.total ?? "—"}</strong>
            <small>{formatDays(dashboard?.requestedDays ?? 0)}</small>
          </div>
        </article>

        <article>
          <span className="leave-kpi-icon pending">
            <Clock3 size={21} />
          </span>
          <div>
            <span>En attente</span>
            <strong>
              {dashboard
                ? dashboard.submitted + dashboard.managerApproved
                : "—"}
            </strong>
            <small>
              Hiérarchie et décision RH
            </small>
          </div>
        </article>

        <article>
          <span className="leave-kpi-icon approved">
            <CheckCircle2 size={21} />
          </span>
          <div>
            <span>Absences approuvées</span>
            <strong>{dashboard?.approved ?? "—"}</strong>
            <small>{formatDays(dashboard?.approvedDays ?? 0)}</small>
          </div>
        </article>

        <article>
          <span className="leave-kpi-icon rejected">
            <AlertTriangle size={21} />
          </span>
          <div>
            <span>Refusées / annulées</span>
            <strong>
              {dashboard
                ? dashboard.rejected + dashboard.cancelled
                : "—"}
            </strong>
            <small>Décisions clôturées</small>
          </div>
        </article>
      </section>

      <section className="leave-layout-grid">
        <section className="leave-panel leave-balances-panel">
          <header className="leave-panel-header">
            <div>
              <p>SOLDES DISPONIBLES</p>
              <h3>Mes droits de congé</h3>
            </div>
          </header>

          {balancesQuery.isLoading && (
            <div className="leave-inline-loading">
              <LoaderCircle size={19} className="is-spinning" />
              Chargement des soldes...
            </div>
          )}

          {!balancesQuery.isLoading && userBalances.length === 0 && (
            <div className="leave-empty-inline">
              <WalletCards size={21} />
              Aucun solde configuré pour {currentYear}.
            </div>
          )}

          <div className="leave-balance-cards">
            {userBalances.slice(0, 6).map((balance) => (
              <article key={balance.id}>
                <div>
                  <span>{leaveTypeLabels[balance.leaveType]}</span>
                  <strong>{formatDays(balance.availableDays)}</strong>
                </div>

                <small>
                  Consommé : {formatDays(balance.consumedDays)}
                </small>

                {canManageBalances && (
                  <button
                    type="button"
                    onClick={() => {
                      balanceMutation.reset();
                      setBalanceModal(balance);
                    }}
                  >
                    Ajuster
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="leave-panel leave-calendar-panel">
          <header className="leave-panel-header">
            <div>
              <p>PLANNING DE PÉRIMÈTRE</p>
              <h3>Absences à venir</h3>
            </div>
            <CalendarDays size={20} />
          </header>

          {calendarQuery.isLoading && (
            <div className="leave-inline-loading">
              <LoaderCircle size={19} className="is-spinning" />
              Chargement du planning...
            </div>
          )}

          {!calendarQuery.isLoading &&
            (calendarQuery.data?.length ?? 0) === 0 && (
              <div className="leave-empty-inline">
                <CalendarDays size={21} />
                Aucune absence à venir.
              </div>
            )}

          <div className="leave-calendar-list">
            {calendarQuery.data?.slice(0, 5).map((request) => (
              <article
                key={request.id}
                onClick={() => setSelectedRequestId(request.id)}
              >
                <span
                  className={`leave-calendar-status ${getLeaveStatusClass(
                    request.status,
                  )}`}
                />
                <div>
                  <strong>
                    {request.agent?.fullName ?? "Agent"}
                  </strong>
                  <p>
                    {formatLeaveDate(request.startDate)} ·{" "}
                    {formatDays(request.requestedDays)}
                  </p>
                </div>
                <ChevronRight size={17} />
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="leave-panel leave-requests-panel">
        <header className="leave-panel-header leave-list-header">
          <div>
            <p>REGISTRE DES DEMANDES</p>
            <h3>
              {pagination?.total ?? 0} demande
              {(pagination?.total ?? 0) > 1 ? "s" : ""}
            </h3>
          </div>
        </header>

        <div className="leave-filter-grid">
          <label className="leave-search">
            <Search size={17} />
            <input
              value={filters.search}
              placeholder="Motif, nom ou matricule..."
              onChange={(event) =>
                updateFilter("search", event.target.value)
              }
            />
          </label>

          <select
            value={filters.status}
            onChange={(event) =>
              updateFilter("status", event.target.value)
            }
          >
            <option value="">Tous les statuts</option>
            {Object.entries(leaveStatusLabels).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>

          <select
            value={filters.leaveType}
            onChange={(event) =>
              updateFilter("leaveType", event.target.value)
            }
          >
            <option value="">Tous les types</option>
            {Object.entries(leaveTypeLabels).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>

          {canChooseAgent && (
            <select
              value={filters.agentId}
              onChange={(event) =>
                updateFilter("agentId", event.target.value)
              }
            >
              <option value="">Tous les Agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.fullName}
                </option>
              ))}
            </select>
          )}
        </div>

        {requestsQuery.isLoading && (
          <div className="leave-list-empty">
            <LoaderCircle size={24} className="is-spinning" />
            Chargement des demandes...
          </div>
        )}

        {!requestsQuery.isLoading &&
          requests.length === 0 && (
            <div className="leave-list-empty">
              <FileClock size={26} />
              <strong>Aucune demande trouvée.</strong>
              <span>
                Créez une nouvelle demande ou modifiez les filtres.
              </span>
            </div>
          )}

        <div className="leave-request-list">
          {requests.map((request) => (
            <article
              key={request.id}
              className="leave-request-row"
              onClick={() => setSelectedRequestId(request.id)}
            >
              <div className="leave-request-person">
                <span className="leave-person-avatar">
                  {(request.agent?.fullName ?? "A")
                    .split(" ")
                    .slice(0, 2)
                    .map((name) => name.charAt(0))
                    .join("")}
                </span>
                <div>
                  <strong>
                    {request.agent?.fullName ?? "Agent"}
                  </strong>
                  <small>
                    {request.agent?.jobTitle ?? "—"}
                  </small>
                </div>
              </div>

              <div className="leave-request-period">
                <strong>
                  {formatLeaveDate(request.startDate)}
                </strong>
                <span>
                  au {formatLeaveDate(request.endDate)}
                </span>
              </div>

              <div className="leave-request-type">
                {leaveTypeLabels[request.leaveType]}
              </div>

              <div className="leave-request-days">
                {formatDays(request.requestedDays)}
              </div>

              <span
                className={`leave-status-badge ${getLeaveStatusClass(
                  request.status,
                )}`}
              >
                {leaveStatusLabels[request.status]}
              </span>

              <ChevronRight size={18} />
            </article>
          ))}
        </div>

        {(pagination?.totalPages ?? 1) > 1 && (
          <footer className="leave-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Précédent
            </button>
            <span>
              Page {pagination?.page ?? 1} /{" "}
              {pagination?.totalPages ?? 1}
            </span>
            <button
              type="button"
              disabled={page >= (pagination?.totalPages ?? 1)}
              onClick={() =>
                setPage((value) =>
                  Math.min(
                    pagination?.totalPages ?? 1,
                    value + 1,
                  ),
                )
              }
            >
              Suivant
            </button>
          </footer>
        )}
      </section>

      {requestModal && (
        <LeaveRequestModal
          request={editingRequest}
          canChooseAgent={canChooseAgent}
          agents={agents}
          isSubmitting={actionLoading}
          errorMessage={currentError}
          onClose={() => {
            createMutation.reset();
            updateMutation.reset();
            submitMutation.reset();
            setRequestModal(false);
            setEditingRequest(null);
          }}
          onSave={saveRequest}
        />
      )}

      {balanceModal && (
        <LeaveBalanceModal
          balance={balanceModal === "new" ? null : balanceModal}
          agents={agents}
          isSubmitting={balanceMutation.isPending}
          errorMessage={
            balanceMutation.isError
              ? getApiErrorMessage(balanceMutation.error)
              : null
          }
          onClose={() => {
            balanceMutation.reset();
            setBalanceModal(null);
          }}
          onSubmit={saveBalance}
        />
      )}

      {decisionAction && (
        <LeaveDecisionModal
          action={decisionAction}
          isSubmitting={
            reviewManagerMutation.isPending ||
            reviewFinalMutation.isPending ||
            cancelMutation.isPending
          }
          errorMessage={currentError}
          onClose={() => {
            reviewManagerMutation.reset();
            reviewFinalMutation.reset();
            cancelMutation.reset();
            setDecisionAction(null);
          }}
          onSubmit={executeDecision}
        />
      )}

      {selectedRequestId && selectedRequestQuery.isLoading && (
        <div className="leave-drawer-loading">
          <LoaderCircle size={23} className="is-spinning" />
          Chargement de la demande...
        </div>
      )}

      {selectedError && (
        <div className="leave-drawer-loading is-error">
          {selectedError}
        </div>
      )}

      {selectedRequestQuery.data && (
        <LeaveDetailsDrawer
          request={selectedRequestQuery.data}
          role={role}
          onClose={() => setSelectedRequestId(null)}
          onEdit={(request) => {
            setSelectedRequestId(null);
            updateMutation.reset();
            setEditingRequest(request);
            setRequestModal(true);
          }}
          onReview={setDecisionAction}
        />
      )}
    </section>
  );
}
