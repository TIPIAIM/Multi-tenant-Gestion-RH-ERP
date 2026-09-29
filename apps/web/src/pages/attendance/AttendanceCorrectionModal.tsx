import { useState } from "react";
import {
  CalendarClock,
  LoaderCircle,
  PencilLine,
  X,
} from "lucide-react";
import type {
  Attendance,
  AttendanceStatus,
  UpdateAttendanceInput,
} from "../../features/attendance/attendance.types";
import {
  attendanceStatusLabels,
  toDateTimeLocalInput,
  toIsoFromDateTimeLocal,
} from "../../features/attendance/attendance.utils";

type AttendanceCorrectionModalProps = {
  attendance: Attendance;

  isSubmitting: boolean;
  errorMessage: string | null;

  onClose: () => void;

  onSubmit: (
    input: UpdateAttendanceInput,
  ) => Promise<void>;
};

export default function AttendanceCorrectionModal({
  attendance,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: AttendanceCorrectionModalProps) {
  const [status, setStatus] = useState<AttendanceStatus>(
    attendance.status,
  );

  const [checkInAt, setCheckInAt] = useState(
    toDateTimeLocalInput(attendance.checkInAt),
  );

  const [checkOutAt, setCheckOutAt] = useState(
    toDateTimeLocalInput(attendance.checkOutAt),
  );

  const [note, setNote] = useState(attendance.note ?? "");

  const [clientError, setClientError] = useState<
    string | null
  >(null);

  function handleSubmit(): void {
    setClientError(null);

    const checkInIso = toIsoFromDateTimeLocal(checkInAt);
    const checkOutIso =
      toIsoFromDateTimeLocal(checkOutAt);

    if (
      checkInIso &&
      checkOutIso &&
      new Date(checkOutIso).getTime() <
        new Date(checkInIso).getTime()
    ) {
      setClientError(
        "L’heure de départ ne peut pas être antérieure à l’heure d’arrivée.",
      );

      return;
    }

    void onSubmit({
      status,
      checkInAt: checkInIso,
      checkOutAt: checkOutIso,
      note: note.trim(),
    });
  }

  return (
    <div className="attendance-modal-layer">
      <button
        className="attendance-modal-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <section
        className="attendance-modal attendance-correction-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-correction-title"
      >
        <header className="attendance-modal-header">
          <div>
            <p>CORRECTION ADMINISTRATIVE</p>

            <h3 id="attendance-correction-title">
              Corriger le pointage
            </h3>
          </div>

          <button
            className="attendance-icon-button"
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <X size={20} />
          </button>
        </header>

        {(clientError || errorMessage) && (
          <div className="attendance-inline-error">
            <span>{clientError ?? errorMessage}</span>
          </div>
        )}

        <div className="attendance-correction-summary">
          <CalendarClock size={19} />

          <div>
            <span>Date concernée</span>
            <strong>{attendance.attendanceDate}</strong>
          </div>
        </div>

        <div className="attendance-form-grid attendance-correction-grid">
          <label className="attendance-form-field">
            <span>Statut</span>

            <select
              value={status}
              disabled={isSubmitting}
              onChange={(event) =>
                setStatus(
                  event.target.value as AttendanceStatus,
                )
              }
            >
              {Object.entries(attendanceStatusLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="attendance-form-field">
            <span>Heure d’arrivée</span>

            <input
              type="datetime-local"
              value={checkInAt}
              disabled={isSubmitting}
              onChange={(event) =>
                setCheckInAt(event.target.value)
              }
            />
          </label>

          <label className="attendance-form-field">
            <span>Heure de départ</span>

            <input
              type="datetime-local"
              min={checkInAt || undefined}
              value={checkOutAt}
              disabled={isSubmitting}
              onChange={(event) =>
                setCheckOutAt(event.target.value)
              }
            />
          </label>

          <label className="attendance-form-field attendance-form-field-full">
            <span>Motif ou observation</span>

            <textarea
              rows={4}
              value={note}
              disabled={isSubmitting}
              placeholder="Ex. Heure rectifiée après vérification de la feuille de présence."
              onChange={(event) =>
                setNote(event.target.value)
              }
            />
          </label>
        </div>

        <footer className="attendance-modal-footer">
          <button
            className="attendance-cancel-button"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Annuler
          </button>

          <button
            className="attendance-primary-button"
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle
                  size={17}
                  className="is-spinning"
                />
                <span>Correction...</span>
              </>
            ) : (
              <>
                <PencilLine size={17} />
                <span>Enregistrer la correction</span>
              </>
            )}
          </button>
        </footer>
      </section>
    </div>
  );
}