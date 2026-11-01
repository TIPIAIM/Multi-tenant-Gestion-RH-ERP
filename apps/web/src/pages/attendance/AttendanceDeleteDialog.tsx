import { LoaderCircle, Trash2, X } from "lucide-react";
import type { Attendance } from "../../features/attendance/attendance.types";
import { formatAttendanceDate } from "../../features/attendance/attendance.utils";
import { useAttendanceDialog } from "./use-attendance-dialog";
export default function AttendanceDeleteDialog({
  attendance,
  agentName,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  attendance: Attendance;
  agentName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useAttendanceDialog(busy, onClose);
  return (
    <div className="attendance-modal-layer">
      <button
        type="button"
        className="attendance-modal-backdrop"
        aria-label="Fermer"
        disabled={busy}
        onClick={onClose}
      />
      <section
        className="attendance-modal attendance-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-delete-title"
        aria-describedby="attendance-delete-description"
      >
        <header className="attendance-modal-header">
          <div>
            <p>SUPPRESSION D’UN POINTAGE</p>
            <h3 id="attendance-delete-title">Supprimer ce pointage ?</h3>
          </div>
          <button
            type="button"
            className="attendance-icon-button"
            aria-label="Fermer"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="attendance-correction-summary">
          <strong>{agentName}</strong>
          <p>{formatAttendanceDate(attendance.attendanceDate)}</p>
        </div>
        <p id="attendance-delete-description">
          Ce pointage sera supprimé définitivement. Cette action est
          irréversible.
        </p>
        {error && (
          <p className="attendance-inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="attendance-modal-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            Conserver le pointage
          </button>
          <button
            type="button"
            className="attendance-primary-button"
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <LoaderCircle size={18} className="is-spinning" />
            ) : (
              <Trash2 size={18} />
            )}
            Supprimer le pointage
          </button>
        </footer>
      </section>
    </div>
  );
}
