import {
    useEffect,
    useState,
  } from "react";
  import {
    CheckCircle2,
    CircleAlert,
    Clock3,
    LoaderCircle,
    LogIn,
    LogOut,
    MessageSquareText,
  } from "lucide-react";
  import {
    useMutation,
    useQuery,
    useQueryClient,
  } from "@tanstack/react-query";
  import { getApiErrorMessage } from "../../features/auth/auth.api";
  import {
    checkInSelf,
    checkOutSelf,
    getMyAttendanceToday,
  } from "../../features/attendance/attendance.api";
  import {
    attendanceStatusLabels,
    formatClockTime,
    formatLiveClock,
    formatMinutes,
    getAttendanceStatusClass,
  } from "../../features/attendance/attendance.utils";
  import "./attendance-page.css";
  
  export default function AttendanceTodayCard() {
    const queryClient = useQueryClient();
  
    const [now, setNow] = useState(() => new Date());
    const [note, setNote] = useState("");
  
    useEffect(() => {
      const intervalId = window.setInterval(() => {
        setNow(new Date());
      }, 1_000);
  
      return () => {
        window.clearInterval(intervalId);
      };
    }, []);
  
    const todayQuery = useQuery({
      queryKey: ["attendance", "today"],
      queryFn: getMyAttendanceToday,
      retry: false,
      staleTime: 15_000,
    });
  
    const checkInMutation = useMutation({
      mutationFn: (message?: string) => checkInSelf(message),
  
      onSuccess: async () => {
        setNote("");
  
        await queryClient.invalidateQueries({
          queryKey: ["attendance"],
        });
      },
    });
  
    const checkOutMutation = useMutation({
      mutationFn: (message?: string) => checkOutSelf(message),
  
      onSuccess: async () => {
        setNote("");
  
        await queryClient.invalidateQueries({
          queryKey: ["attendance"],
        });
      },
    });
  
    const attendance = todayQuery.data;
  
    const actionError = checkInMutation.isError
      ? getApiErrorMessage(checkInMutation.error)
      : checkOutMutation.isError
        ? getApiErrorMessage(checkOutMutation.error)
        : todayQuery.isError
          ? getApiErrorMessage(todayQuery.error)
          : null;
  
    const isLoading =
      todayQuery.isLoading ||
      checkInMutation.isPending ||
      checkOutMutation.isPending;
  
    const hasCheckedIn = Boolean(attendance?.checkInAt);
    const hasCheckedOut = Boolean(attendance?.checkOutAt);
  
    return (
      <section className="attendance-today-card">
        <div className="attendance-today-top">
          <div>
            <p className="attendance-eyebrow">
              POINTAGE PERSONNEL
            </p>
  
            <h3>Ma journée de travail</h3>
  
            <p className="attendance-today-description">
              Enregistrez votre arrivée et votre départ depuis
              votre espace RH.
            </p>
          </div>
  
          <div className="attendance-live-clock">
            <Clock3 size={18} />
            <strong>{formatLiveClock(now)}</strong>
            <span>Conakry</span>
          </div>
        </div>
  
        {actionError && (
          <div className="attendance-inline-error">
            <CircleAlert size={17} />
            <span>{actionError}</span>
          </div>
        )}
  
        {todayQuery.isLoading && (
          <div className="attendance-today-loading">
            <LoaderCircle
              size={23}
              className="is-spinning"
            />
            <span>Chargement du pointage du jour...</span>
          </div>
        )}
  
        {!todayQuery.isLoading && !todayQuery.isError && (
          <>
            <div className="attendance-today-status">
              <div>
                <span>
                  {attendance
                    ? attendanceStatusLabels[attendance.status]
                    : "Non pointé"}
                </span>
  
                <strong>
                  {hasCheckedOut
                    ? "Journée clôturée"
                    : hasCheckedIn
                      ? "Arrivée enregistrée"
                      : "Prêt à pointer"}
                </strong>
              </div>
  
              {attendance && (
                <span
                  className={`attendance-status-badge ${getAttendanceStatusClass(
                    attendance.status,
                  )}`}
                >
                  {attendanceStatusLabels[attendance.status]}
                </span>
              )}
            </div>
  
            <div className="attendance-today-metrics">
              <article>
                <span>Arrivée</span>
                <strong>{formatClockTime(attendance?.checkInAt)}</strong>
              </article>
  
              <article>
                <span>Départ</span>
                <strong>{formatClockTime(attendance?.checkOutAt)}</strong>
              </article>
  
              <article>
                <span>Temps travaillé</span>
                <strong>
                  {formatMinutes(attendance?.workedMinutes ?? 0)}
                </strong>
              </article>
  
              <article>
                <span>Retard</span>
                <strong>
                  {formatMinutes(attendance?.lateMinutes ?? 0)}
                </strong>
              </article>
            </div>
  
            {!hasCheckedOut && (
              <div className="attendance-note-zone">
                <label>
                  <MessageSquareText size={16} />
                  <span>Note facultative</span>
                </label>
  
                <textarea
                  rows={2}
                  value={note}
                  onChange={(event) =>
                    setNote(event.target.value)
                  }
                  placeholder="Ex. Mission extérieure, réunion externe, arrivée différée..."
                  disabled={isLoading}
                />
              </div>
            )}
  
            <div className="attendance-today-actions">
              {!hasCheckedIn && (
                <button
                  className="attendance-checkin-button"
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    checkInMutation.mutate(
                      note.trim() || undefined,
                    )
                  }
                >
                  {checkInMutation.isPending ? (
                    <LoaderCircle
                      size={18}
                      className="is-spinning"
                    />
                  ) : (
                    <LogIn size={18} />
                  )}
  
                  <span>
                    {checkInMutation.isPending
                      ? "Pointage en cours..."
                      : "Enregistrer mon arrivée"}
                  </span>
                </button>
              )}
  
              {hasCheckedIn && !hasCheckedOut && (
                <button
                  className="attendance-checkout-button"
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    checkOutMutation.mutate(
                      note.trim() || undefined,
                    )
                  }
                >
                  {checkOutMutation.isPending ? (
                    <LoaderCircle
                      size={18}
                      className="is-spinning"
                    />
                  ) : (
                    <LogOut size={18} />
                  )}
  
                  <span>
                    {checkOutMutation.isPending
                      ? "Clôture en cours..."
                      : "Enregistrer mon départ"}
                  </span>
                </button>
              )}
  
              {hasCheckedOut && (
                <div className="attendance-complete-message">
                  <CheckCircle2 size={18} />
                  <span>
                    Votre présence du jour est enregistrée.
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    );
  }