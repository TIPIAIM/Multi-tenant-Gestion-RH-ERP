import {
    Activity,
    
    CircleAlert,
    Clock3,
    LoaderCircle,
    Pencil,
    X,
  } from "lucide-react";
  import { useQuery } from "@tanstack/react-query";
  import { getApiErrorMessage } from "../../features/auth/auth.api";
  import { getAttendanceEvents } from "../../features/attendance/attendance.api";
  import type { Attendance } from "../../features/attendance/attendance.types";
  import {
    attendanceEventLabels,
    attendanceStatusLabels,
    formatAttendanceDate,
    formatClockTime,
    formatDateTime,
    formatMinutes,
    getAttendanceStatusClass,
  } from "../../features/attendance/attendance.utils";
  import "./attendance-page.css";
  
  type AttendanceHistoryDrawerProps = {
    attendance: Attendance;
    agentName: string;
  
    canManage: boolean;
  
    onClose: () => void;
    onCorrect: (attendance: Attendance) => void;
  };
  
  export default function AttendanceHistoryDrawer({
    attendance,
    agentName,
    canManage,
    onClose,
    onCorrect,
  }: AttendanceHistoryDrawerProps) {
    const eventsQuery = useQuery({
      queryKey: [
        "attendance",
        "events",
        attendance.id,
      ],
  
      queryFn: () => getAttendanceEvents(attendance.id),
  
      staleTime: 20_000,
    });
  
    return (
      <div className="attendance-drawer-layer">
        <button
          className="attendance-drawer-backdrop"
          type="button"
          aria-label="Fermer"
          onClick={onClose}
        />
  
        <aside
          className="attendance-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Historique du pointage"
        >
          <header className="attendance-drawer-header">
            <div>
              <p>HISTORIQUE DU POINTAGE</p>
              <h3>{agentName}</h3>
            </div>
  
            <button
              className="attendance-icon-button"
              type="button"
              aria-label="Fermer"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </header>
  
          <section className="attendance-history-summary">
            <div>
              <span>Date</span>
              <strong>
                {formatAttendanceDate(
                  attendance.attendanceDate,
                )}
              </strong>
            </div>
  
            <span
              className={`attendance-status-badge ${getAttendanceStatusClass(
                attendance.status,
              )}`}
            >
              {attendanceStatusLabels[attendance.status]}
            </span>
          </section>
  
          <section className="attendance-history-metrics">
            <article>
              <span>Arrivée</span>
              <strong>
                {formatClockTime(attendance.checkInAt)}
              </strong>
            </article>
  
            <article>
              <span>Départ</span>
              <strong>
                {formatClockTime(attendance.checkOutAt)}
              </strong>
            </article>
  
            <article>
              <span>Temps travaillé</span>
              <strong>
                {formatMinutes(attendance.workedMinutes)}
              </strong>
            </article>
  
            <article>
              <span>Heures supplémentaires</span>
              <strong>
                {formatMinutes(attendance.overtimeMinutes)}
              </strong>
            </article>
          </section>
  
          {attendance.note && (
            <section className="attendance-history-note">
              <CircleAlert size={17} />
  
              <div>
                <strong>Observation</strong>
                <p>{attendance.note}</p>
              </div>
            </section>
          )}
  
          {canManage && (
            <button
              className="attendance-edit-record-button"
              type="button"
              onClick={() => onCorrect(attendance)}
            >
              <Pencil size={16} />
              <span>Corriger ce pointage</span>
            </button>
          )}
  
          <section className="attendance-history-section">
            <div className="attendance-history-heading">
              <Activity size={18} />
              <h4>Traçabilité des opérations</h4>
            </div>
  
            {eventsQuery.isLoading && (
              <div className="attendance-history-loading">
                <LoaderCircle
                  size={21}
                  className="is-spinning"
                />
                <span>Chargement de l’historique...</span>
              </div>
            )}
  
            {eventsQuery.isError && (
              <div className="attendance-inline-error">
                <CircleAlert size={17} />
                <span>
                  {getApiErrorMessage(eventsQuery.error)}
                </span>
              </div>
            )}
  
            {!eventsQuery.isLoading &&
              !eventsQuery.isError &&
              (eventsQuery.data?.length ?? 0) === 0 && (
                <p className="attendance-history-empty">
                  Aucun événement enregistré.
                </p>
              )}
  
            <div className="attendance-timeline">
              {eventsQuery.data?.map((event) => (
                <article key={event.id}>
                  <span className="attendance-timeline-dot" />
  
                  <div>
                    <strong>
                      {attendanceEventLabels[event.action]}
                    </strong>
  
                    <p>{event.summary}</p>
  
                    <small>
                      {event.actorName} ·{" "}
                      {formatDateTime(event.createdAt)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </section>
  
          <section className="attendance-history-section">
            <div className="attendance-history-heading">
              <Clock3 size={18} />
              <h4>Informations techniques</h4>
            </div>
  
            <dl className="attendance-technical-list">
              <div>
                <dt>Source arrivée</dt>
                <dd>
                  {attendance.checkInSource === "SELF_SERVICE"
                    ? "Pointage personnel"
                    : attendance.checkInSource === "MANUAL"
                      ? "Correction administrative"
                      : "Non renseignée"}
                </dd>
              </div>
  
              <div>
                <dt>Source départ</dt>
                <dd>
                  {attendance.checkOutSource === "SELF_SERVICE"
                    ? "Pointage personnel"
                    : attendance.checkOutSource === "MANUAL"
                      ? "Correction administrative"
                      : "Non renseignée"}
                </dd>
              </div>
  
              <div>
                <dt>Départ anticipé</dt>
                <dd>
                  {formatMinutes(
                    attendance.earlyDepartureMinutes,
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    );
  }