import {
    useMemo,
    useState,
  } from "react";
  import {
    Building2,
    CalendarDays,
    LoaderCircle,
    UserRound,
    X,
  } from "lucide-react";
  import type { Agent } from "../../features/agents/agent.types";
  import type {
    OrganizationTreeDirection,
  } from "../../features/organisation/organisation.types";
  import type {
    AttendanceStatus,
    CreateManualAttendanceInput,
  } from "../../features/attendance/attendance.types";
  import {
    attendanceStatusLabels,
    getConakryDateKey,
    toIsoFromDateTimeLocal,
  } from "../../features/attendance/attendance.utils";
  
  type AttendanceManualModalProps = {
    agents: Agent[];
    directions: OrganizationTreeDirection[];
  
    isSubmitting: boolean;
    errorMessage: string | null;
  
    onClose: () => void;
  
    onSubmit: (
      input: CreateManualAttendanceInput,
    ) => Promise<void>;
  };
  
  type FormState = {
    agentId: string;
  
    directionId: string;
    serviceId: string;
  
    attendanceDate: string;
    status: AttendanceStatus;
  
    checkInAt: string;
    checkOutAt: string;
  
    note: string;
  };
  
  const initialFormState: FormState = {
    agentId: "",
  
    directionId: "",
    serviceId: "",
  
    attendanceDate: getConakryDateKey(),
    status: "PRESENT",
  
    checkInAt: "",
    checkOutAt: "",
  
    note: "",
  };
  
  export default function AttendanceManualModal({
    agents,
    directions,
    isSubmitting,
    errorMessage,
    onClose,
    onSubmit,
  }: AttendanceManualModalProps) {
    const [formState, setFormState] =
      useState<FormState>(initialFormState);
  
    const [clientError, setClientError] = useState<
      string | null
    >(null);
  
    const selectedDirection = useMemo(
      () =>
        directions.find(
          (direction) =>
            direction.id === formState.directionId,
        ),
      [directions, formState.directionId],
    );
  
    const availableServices =
      selectedDirection?.services.filter(
        (service) => service.status === "ACTIVE",
      ) ?? [];
  
    const visibleAgents = useMemo(
      () =>
        agents.filter((agent) => {
          if (
            formState.directionId &&
            agent.directionId !== formState.directionId
          ) {
            return false;
          }
  
          if (
            formState.serviceId &&
            agent.serviceId !== formState.serviceId
          ) {
            return false;
          }
  
          return true;
        }),
      [
        agents,
        formState.directionId,
        formState.serviceId,
      ],
    );
  
    const showTimeInputs = ![
      "ABSENT",
      "ON_LEAVE",
      "EXCUSED",
    ].includes(formState.status);
  
    function updateForm(
      key: keyof FormState,
      value: string,
    ): void {
      setFormState((currentValue) => ({
        ...currentValue,
        [key]: value,
      }));
    }
  
    function handleSubmit(): void {
      setClientError(null);
  
      if (!formState.agentId) {
        setClientError(
          "Veuillez sélectionner l’agent concerné.",
        );
  
        return;
      }
  
      const checkInAt = toIsoFromDateTimeLocal(
        formState.checkInAt,
      );
  
      const checkOutAt = toIsoFromDateTimeLocal(
        formState.checkOutAt,
      );
  
      if (
        checkInAt &&
        checkOutAt &&
        new Date(checkOutAt).getTime() <
          new Date(checkInAt).getTime()
      ) {
        setClientError(
          "L’heure de départ ne peut pas précéder l’heure d’arrivée.",
        );
  
        return;
      }
  
      void onSubmit({
        agentId: formState.agentId,
  
        attendanceDate: formState.attendanceDate,
        status: formState.status,
  
        checkInAt,
        checkOutAt,
  
        note: formState.note.trim() || undefined,
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
          className="attendance-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-attendance-title"
        >
          <header className="attendance-modal-header">
            <div>
              <p>POINTAGE ADMINISTRATIF</p>
              <h3 id="manual-attendance-title">
                Ajouter un pointage manuel
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
  
          <div className="attendance-modal-content">
            <section className="attendance-form-section">
              <div className="attendance-form-heading">
                <Building2 size={18} />
  
                <div>
                  <strong>Rattachement</strong>
                  <span>
                    Filtrez la Direction, le Service puis l’agent.
                  </span>
                </div>
              </div>
  
              <div className="attendance-form-grid">
                <label className="attendance-form-field">
                  <span>Direction</span>
  
                  <select
                    value={formState.directionId}
                    disabled={isSubmitting}
                    onChange={(event) => {
                      setFormState((currentValue) => ({
                        ...currentValue,
                        directionId: event.target.value,
                        serviceId: "",
                        agentId: "",
                      }));
                    }}
                  >
                    <option value="">
                      Toutes les Directions
                    </option>
  
                    {directions.map((direction) => (
                      <option
                        key={direction.id}
                        value={direction.id}
                      >
                        {direction.name}
                      </option>
                    ))}
                  </select>
                </label>
  
                <label className="attendance-form-field">
                  <span>Service</span>
  
                  <select
                    value={formState.serviceId}
                    disabled={
                      isSubmitting ||
                      !formState.directionId
                    }
                    onChange={(event) => {
                      setFormState((currentValue) => ({
                        ...currentValue,
                        serviceId: event.target.value,
                        agentId: "",
                      }));
                    }}
                  >
                    <option value="">
                      Tous les Services
                    </option>
  
                    {availableServices.map((service) => (
                      <option
                        key={service.id}
                        value={service.id}
                      >
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>
  
                <label className="attendance-form-field attendance-form-field-full">
                  <span>Agent concerné</span>
  
                  <select
                    value={formState.agentId}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      updateForm(
                        "agentId",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Sélectionner un agent
                    </option>
  
                    {visibleAgents.map((agent) => (
                      <option
                        key={agent.id}
                        value={agent.id}
                      >
                        {agent.fullName} · {agent.jobTitle}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
  
            <section className="attendance-form-section">
              <div className="attendance-form-heading">
                <CalendarDays size={18} />
  
                <div>
                  <strong>Présence et horaires</strong>
                  <span>
                    Les horaires sont calculés selon Conakry.
                  </span>
                </div>
              </div>
  
              <div className="attendance-form-grid">
                <label className="attendance-form-field">
                  <span>Date de présence</span>
  
                  <input
                    type="date"
                    value={formState.attendanceDate}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      updateForm(
                        "attendanceDate",
                        event.target.value,
                      )
                    }
                  />
                </label>
  
                <label className="attendance-form-field">
                  <span>Statut</span>
  
                  <select
                    value={formState.status}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      updateForm(
                        "status",
                        event.target.value,
                      )
                    }
                  >
                    {Object.entries(
                      attendanceStatusLabels,
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
  
                {showTimeInputs && (
                  <>
                    <label className="attendance-form-field">
                      <span>Heure d’arrivée</span>
  
                      <input
                        type="datetime-local"
                        value={formState.checkInAt}
                        disabled={isSubmitting}
                        onChange={(event) =>
                          updateForm(
                            "checkInAt",
                            event.target.value,
                          )
                        }
                      />
                    </label>
  
                    <label className="attendance-form-field">
                      <span>Heure de départ</span>
  
                      <input
                        type="datetime-local"
                        min={formState.checkInAt || undefined}
                        value={formState.checkOutAt}
                        disabled={isSubmitting}
                        onChange={(event) =>
                          updateForm(
                            "checkOutAt",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  </>
                )}
  
                <label className="attendance-form-field attendance-form-field-full">
                  <span>Observation</span>
  
                  <textarea
                    rows={3}
                    value={formState.note}
                    disabled={isSubmitting}
                    placeholder="Ex. Correction validée par la Direction, mission terrain, absence justifiée..."
                    onChange={(event) =>
                      updateForm("note", event.target.value)
                    }
                  />
                </label>
              </div>
            </section>
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
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <UserRound size={17} />
                  <span>Créer le pointage</span>
                </>
              )}
            </button>
          </footer>
        </section>
      </div>
    );
  }