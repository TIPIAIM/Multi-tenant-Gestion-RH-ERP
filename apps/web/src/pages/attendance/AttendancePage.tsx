import {
    useEffect,
    useMemo,
    useState,
  } from "react";
  import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    Clock3,
    Eye,
    FileClock,
    LoaderCircle,
    Pencil,
    Plus,
    RefreshCw,
    TimerReset,
    Trash2,
    UsersRound,
  } from "lucide-react";
  import {
    useMutation,
    useQuery,
    useQueryClient,
  } from "@tanstack/react-query";
  import { useAuth } from "../../features/auth/auth.context";
  import { getApiErrorMessage } from "../../features/auth/auth.api";
  import { getAgents } from "../../features/agents/agent.api";
  import { getOrganizationTree } from "../../features/organisation/organisation.api";
  import {
    createManualAttendance,
    deleteAttendance,
    getAttendanceStats,
    getAttendances,
    updateAttendance,
  } from "../../features/attendance/attendance.api";
  import type {
    Attendance,
    AttendanceStatus,
    CreateManualAttendanceInput,
    UpdateAttendanceInput,
  } from "../../features/attendance/attendance.types";
  import {
    attendanceStatusLabels,
    formatAttendanceDate,
    formatClockTime,
    formatMinutes,
    getAttendanceStatusClass,
    getCurrentMonthRange,
  } from "../../features/attendance/attendance.utils";
  import AttendanceCorrectionModal from "./AttendanceCorrectionModal";
  import AttendanceHistoryDrawer from "./AttendanceHistoryDrawer";
  import AttendanceManualModal from "./AttendanceManualModal";
  import AttendanceTodayCard from "./AttendanceTodayCard";
  import "./attendance-page.css";
  
  type AttendanceFilters = {
    dateFrom: string;
    dateTo: string;
  
    status: "" | AttendanceStatus;
  
    directionId: string;
    serviceId: string;
    agentId: string;
  };
  
  const initialMonthRange = getCurrentMonthRange();
  
  const initialFilters: AttendanceFilters = {
    dateFrom: initialMonthRange.dateFrom,
    dateTo: initialMonthRange.dateTo,
  
    status: "",
  
    directionId: "",
    serviceId: "",
    agentId: "",
  };
  
  export default function AttendancePage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
  
    const [filters, setFilters] =
      useState<AttendanceFilters>(initialFilters);
  
    const [page, setPage] = useState(1);
  
    const [isManualModalOpen, setIsManualModalOpen] =
      useState(false);
  
    const [attendanceToCorrect, setAttendanceToCorrect] =
      useState<Attendance | null>(null);
  
    const [attendanceToView, setAttendanceToView] =
      useState<Attendance | null>(null);
  
    const currentRole = user?.role ?? "";
  
    const canViewCollectiveAttendance = [
      "TENANT_ADMIN",
      "RH_MANAGER",
      "DIRECTION",
      "SERVICE_MANAGER",
    ].includes(currentRole);
  
    const canCreateManualAttendance = [
      "TENANT_ADMIN",
      "RH_MANAGER",
    ].includes(currentRole);
  
    const canCorrectAttendance = currentRole === "TENANT_ADMIN";
    const canDeleteAttendance = currentRole === "TENANT_ADMIN";
  
    useEffect(() => {
      setPage(1);
    }, [
      filters.dateFrom,
      filters.dateTo,
      filters.status,
      filters.directionId,
      filters.serviceId,
      filters.agentId,
    ]);
  
    const organizationQuery = useQuery({
      queryKey: ["organization-tree"],
  
      queryFn: getOrganizationTree,
  
      enabled: canViewCollectiveAttendance,
  
      staleTime: 5 * 60 * 1000,
    });
  
    const agentsQuery = useQuery({
      queryKey: ["agents", "attendance"],
  
      queryFn: () =>
        getAgents({
          page: 1,
          limit: 100,
          employmentStatus: "ACTIVE",
        }),
  
      enabled: canViewCollectiveAttendance,
  
      staleTime: 60_000,
    });
  
    const statsQuery = useQuery({
      queryKey: [
        "attendance",
        "stats",
        filters.dateFrom,
        filters.dateTo,
      ],
  
      queryFn: () =>
        getAttendanceStats({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        }),
  
      staleTime: 20_000,
    });
  
    const attendancesQuery = useQuery({
      queryKey: [
        "attendance",
        "list",
        page,
        filters,
      ],
  
      queryFn: () =>
        getAttendances({
          page,
          limit: 20,
  
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
  
          status: filters.status || undefined,
  
          directionId:
            filters.directionId || undefined,
  
          serviceId: filters.serviceId || undefined,
  
          agentId: filters.agentId || undefined,
        }),
  
      staleTime: 15_000,
    });
  
    const directions = organizationQuery.data ?? [];
    const agents = agentsQuery.data?.items ?? [];
  
    const selectedDirection = directions.find(
      (direction) => direction.id === filters.directionId,
    );
  
    const availableServices =
      selectedDirection?.services.filter(
        (service) => service.status === "ACTIVE",
      ) ?? [];
  
    const agentLookup = useMemo(
      () =>
        new Map(
          agents.map((agent) => [
            agent.id,
            `${agent.fullName} · ${agent.jobTitle}`,
          ]),
        ),
      [agents],
    );
  
    const createManualMutation = useMutation({
      mutationFn: (input: CreateManualAttendanceInput) =>
        createManualAttendance(input),
  
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["attendance"],
        });
  
        setIsManualModalOpen(false);
      },
    });
  
    const correctionMutation = useMutation({
      mutationFn: ({
        attendanceId,
        input,
      }: {
        attendanceId: string;
        input: UpdateAttendanceInput;
      }) => updateAttendance(attendanceId, input),
  
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["attendance"],
        });
  
        setAttendanceToCorrect(null);
      },
    });
  
    const deleteMutation = useMutation({
      mutationFn: deleteAttendance,
  
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["attendance"],
        });
      },
    });
  
    const stats = statsQuery.data;
    const records = attendancesQuery.data?.items ?? [];
    const pagination = attendancesQuery.data?.pagination;
  
    const presentRate =
      stats && stats.total > 0
        ? Math.round((stats.present / stats.total) * 100)
        : 0;
  
    const queryError = statsQuery.isError
      ? getApiErrorMessage(statsQuery.error)
      : attendancesQuery.isError
        ? getApiErrorMessage(attendancesQuery.error)
        : null;
  
    const manualError = createManualMutation.isError
      ? getApiErrorMessage(createManualMutation.error)
      : null;
  
    const correctionError = correctionMutation.isError
      ? getApiErrorMessage(correctionMutation.error)
      : null;
  
    const deleteError = deleteMutation.isError
      ? getApiErrorMessage(deleteMutation.error)
      : null;
  
    function updateFilter(
      key: keyof AttendanceFilters,
      value: string,
    ): void {
      setFilters((currentValue) => ({
        ...currentValue,
        [key]: value,
  
        ...(key === "directionId"
          ? {
              serviceId: "",
              agentId: "",
            }
          : {}),
  
        ...(key === "serviceId"
          ? {
              agentId: "",
            }
          : {}),
      }));
    }
  
    function resetFilters(): void {
      const monthRange = getCurrentMonthRange();
  
      setFilters({
        dateFrom: monthRange.dateFrom,
        dateTo: monthRange.dateTo,
  
        status: "",
  
        directionId: "",
        serviceId: "",
        agentId: "",
      });
    }
  
    async function refreshAttendance(): Promise<void> {
      await queryClient.invalidateQueries({
        queryKey: ["attendance"],
      });
    }
  
    function applyStatusFilter(status: "" | AttendanceStatus): void {
      setFilters((currentValue) => ({
        ...currentValue,
        status,
      }));
    }
  
    function confirmDeleteAttendance(attendance: Attendance): void {
      const confirmed = window.confirm(
        `Supprimer définitivement le pointage du ${attendance.attendanceDate} ? Cette action est irréversible.`,
      );
  
      if (!confirmed) {
        return;
      }
  
      deleteMutation.mutate(attendance.id);
    }
  
    function getAgentName(attendance: Attendance): string {
      if (!canViewCollectiveAttendance) {
        return "Mon pointage";
      }
  
      return (
        agentLookup.get(attendance.agentId) ??
        "Agent non renseigné"
      );
    }
  
    return (
      <section className="attendance-page">
        <header className="attendance-hero">
          <div>
            <p className="attendance-eyebrow">
              PRÉSENCE ET TEMPS DE TRAVAIL
            </p>
  
            <h2>
              Pointage <span>intelligent.</span>
            </h2>
 
          </div>
  
          <div className="attendance-hero-actions">
            <button
              className="attendance-secondary-button"
              type="button"
              onClick={() => void refreshAttendance()}
             data-ui-action="compact" aria-label="Actualiser" title="Actualiser">
              <RefreshCw size={18} />
              <span className="ui-action-label">Actualiser</span>
            </button>
  
            {canCreateManualAttendance && (
              <button
                className="attendance-primary-button"
                type="button"
                disabled={agents.length === 0}
                onClick={() => {
                  createManualMutation.reset();
                  setIsManualModalOpen(true);
                }}
              >
                <Plus size={18} />
                <span>Pointage manuel</span>
              </button>
            )}
          </div>
        </header>
  
        <AttendanceTodayCard />
  
        {(queryError || deleteError) && (
          <div className="attendance-global-error">
            <CircleAlert size={20} />
  
            <div>
              <strong>
                Certaines données de présence sont indisponibles.
              </strong>
  
              <p>{queryError ?? deleteError}</p>
            </div>
          </div>
        )}
  
        <section className="attendance-stats-grid">
          <button
            className="attendance-stat-card is-clickable"
            type="button"
            onClick={() => applyStatusFilter("")}
          >
            <span className="attendance-stat-icon total">
              <UsersRound size={21} />
            </span>
  
            <div>
              <span>Pointages enregistrés</span>
              <strong>{stats?.total ?? "—"}</strong>
              <p>
                Du {stats?.dateFrom ?? "—"} au{" "}
                {stats?.dateTo ?? "—"}
              </p>
            </div>
          </button>
  
          <button
            className="attendance-stat-card is-clickable"
            type="button"
            onClick={() => applyStatusFilter("PRESENT")}
          >
            <span className="attendance-stat-icon present">
              <CheckCircle2 size={21} />
            </span>
  
            <div>
              <span>Taux de présence</span>
              <strong>{stats ? `${presentRate}%` : "—"}</strong>
              <p>
                {stats?.present ?? 0} présence(s)
              </p>
            </div>
          </button>
  
          <button
            className="attendance-stat-card is-clickable"
            type="button"
            onClick={() => applyStatusFilter("LATE")}
          >
            <span className="attendance-stat-icon late">
              <Clock3 size={21} />
            </span>
  
            <div>
              <span>Retards</span>
              <strong>{stats?.late ?? "—"}</strong>
              <p>
                {formatMinutes(stats?.lateMinutes ?? 0)}
              </p>
            </div>
          </button>
  
          <button
            className="attendance-stat-card is-clickable"
            type="button"
            onClick={() => applyStatusFilter("ABSENT")}
          >
            <span className="attendance-stat-icon absent">
              <AlertTriangle size={21} />
            </span>
  
            <div>
              <span>Absences</span>
              <strong>{stats?.absent ?? "—"}</strong>
              <p>
                Congés : {stats?.onLeave ?? 0}
              </p>
            </div>
          </button>
  
          <button
            className="attendance-stat-card is-clickable"
            type="button"
            onClick={() => applyStatusFilter("")}
          >
            <span className="attendance-stat-icon hours">
              <TimerReset size={21} />
            </span>
  
            <div>
              <span>Temps cumulé</span>
              <strong>
                {formatMinutes(stats?.workedMinutes ?? 0)}
              </strong>
              <p>
                Départs non clôturés :{" "}
                {stats?.pendingCheckOut ?? 0}
              </p>
            </div>
          </button>
  
          <button
            className="attendance-stat-card is-clickable"
            type="button"
            onClick={() => applyStatusFilter("")}
          >
            <span className="attendance-stat-icon overtime">
              <FileClock size={21} />
            </span>
  
            <div>
              <span>Heures supplémentaires</span>
              <strong>
                {formatMinutes(stats?.overtimeMinutes ?? 0)}
              </strong>
              <p>Temps validé sur la période</p>
            </div>
          </button>
        </section>
  
        <section className="attendance-filters-panel">
          <div className="attendance-filter-heading">
            <div>
              <p>CONSULTATION ET FILTRES</p>
              <h3>Historique des présences</h3>
            </div>
  
            <button
              className="attendance-reset-filters-button"
              type="button"
              onClick={resetFilters}
            >
              Réinitialiser
            </button>
          </div>
  
          <div className="attendance-filters-grid">
            <label className="attendance-filter-field">
              <span>Date de début</span>
  
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  updateFilter(
                    "dateFrom",
                    event.target.value,
                  )
                }
              />
            </label>
  
            <label className="attendance-filter-field">
              <span>Date de fin</span>
  
              <input
                type="date"
                min={filters.dateFrom}
                value={filters.dateTo}
                onChange={(event) =>
                  updateFilter(
                    "dateTo",
                    event.target.value,
                  )
                }
              />
            </label>
  
            <label className="attendance-filter-field">
              <span>Statut</span>
  
              <select
                value={filters.status}
                onChange={(event) =>
                  updateFilter(
                    "status",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Tous les statuts
                </option>
  
                {Object.entries(attendanceStatusLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
  
            {canViewCollectiveAttendance && (
              <>
                <label className="attendance-filter-field">
                  <span>Direction</span>
  
                  <select
                    value={filters.directionId}
                    onChange={(event) =>
                      updateFilter(
                        "directionId",
                        event.target.value,
                      )
                    }
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
  
                <label className="attendance-filter-field">
                  <span>Service</span>
  
                  <select
                    value={filters.serviceId}
                    disabled={!filters.directionId}
                    onChange={(event) =>
                      updateFilter(
                        "serviceId",
                        event.target.value,
                      )
                    }
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
  
                <label className="attendance-filter-field">
                  <span>Agent</span>
  
                  <select
                    value={filters.agentId}
                    onChange={(event) =>
                      updateFilter(
                        "agentId",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Tous les agents
                    </option>
  
                    {agents.map((agent) => (
                      <option
                        key={agent.id}
                        value={agent.id}
                      >
                        {agent.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </section>
  
        <section className="attendance-list-panel">
          <header className="attendance-list-header">
            <div>
              <p>REGISTRE DES PRÉSENCES</p>
  
              <h3>
                {pagination?.total ?? 0} pointage
                {(pagination?.total ?? 0) > 1 ? "s" : ""}
              </h3>
            </div>
  
            {attendancesQuery.isFetching && (
              <span className="attendance-list-refreshing">
                <LoaderCircle
                  size={16}
                  className="is-spinning"
                />
                Actualisation...
              </span>
            )}
          </header>
  
          {attendancesQuery.isLoading && (
            <div className="attendance-list-empty">
              <LoaderCircle
                size={24}
                className="is-spinning"
              />
              <span>Chargement des présences...</span>
            </div>
          )}
  
          {!attendancesQuery.isLoading &&
            !attendancesQuery.isError &&
            records.length === 0 && (
              <div className="attendance-list-empty">
                <CalendarClock size={28} />
                <strong>Aucun pointage trouvé.</strong>
                <span>
                  Ajustez les filtres ou enregistrez un pointage.
                </span>
              </div>
            )}
  
          <div className="attendance-records-list">
            {records.map((attendance) => (
              <article
                key={attendance.id}
                className="attendance-record-row"
              >
                <div className="attendance-record-date">
                  <span>
                    {formatAttendanceDate(
                      attendance.attendanceDate,
                    )}
                  </span>
  
                  <small>
                    {attendance.attendanceDate}
                  </small>
                </div>
  
                <div className="attendance-record-agent">
                  <strong>{getAgentName(attendance)}</strong>
  
                  <span>
                    Arrivée :{" "}
                    {formatClockTime(attendance.checkInAt)} · Départ :{" "}
                    {formatClockTime(attendance.checkOutAt)}
                  </span>
                </div>
  
                <div className="attendance-record-status">
                  <span
                    className={`attendance-status-badge ${getAttendanceStatusClass(
                      attendance.status,
                    )}`}
                  >
                    {attendanceStatusLabels[attendance.status]}
                  </span>
                </div>
  
                <div className="attendance-record-metric">
                  <span>Travail</span>
                  <strong>
                    {formatMinutes(attendance.workedMinutes)}
                  </strong>
                </div>
  
                <div className="attendance-record-metric">
                  <span>Retard</span>
                  <strong>
                    {formatMinutes(attendance.lateMinutes)}
                  </strong>
                </div>
  
                <div className="attendance-record-metric">
                  <span>Heures sup.</span>
                  <strong>
                    {formatMinutes(attendance.overtimeMinutes)}
                  </strong>
                </div>
  
                <div className="attendance-record-actions">
                  <button
                    type="button"
                    title="Consulter l’historique"
                    onClick={() =>
                      setAttendanceToView(attendance)
                    }
                   aria-label="Consulter l’historique">
                    <Eye size={17} />
                  </button>
  
                  {canCorrectAttendance && (
                    <button
                      className="is-edit"
                      type="button"
                      title="Corriger le pointage"
                      onClick={() => {
                        correctionMutation.reset();
                        setAttendanceToCorrect(attendance);
                      }}
                     aria-label="Corriger le pointage">
                      <Pencil size={17} />
                    </button>
                  )}
  
                  {canDeleteAttendance && (
                    <button
                      className="is-delete"
                      type="button"
                      title="Supprimer définitivement"
                      disabled={deleteMutation.isPending}
                      onClick={() => confirmDeleteAttendance(attendance)}
                     aria-label="Supprimer définitivement">
                      {deleteMutation.isPending ? (
                        <LoaderCircle
                          size={17}
                          className="is-spinning"
                        />
                      ) : (
                        <Trash2 size={17} />
                      )}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
  
          {(pagination?.totalPages ?? 1) > 1 && (
            <footer className="attendance-pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() =>
                  setPage((currentPage) =>
                    Math.max(1, currentPage - 1),
                  )
                }
              >
                Précédent
              </button>
  
              <span>
                Page {pagination?.page ?? 1} sur{" "}
                {pagination?.totalPages ?? 1}
              </span>
  
              <button
                type="button"
                disabled={
                  page >= (pagination?.totalPages ?? 1)
                }
                onClick={() =>
                  setPage((currentPage) =>
                    Math.min(
                      pagination?.totalPages ?? 1,
                      currentPage + 1,
                    ),
                  )
                }
              >
                Suivant
              </button>
            </footer>
          )}
        </section>
  
        {isManualModalOpen && (
          <AttendanceManualModal
            agents={agents}
            directions={directions}
            isSubmitting={createManualMutation.isPending}
            errorMessage={manualError}
            onClose={() => {
              createManualMutation.reset();
              setIsManualModalOpen(false);
            }}
            onSubmit={async (input) => {
              await createManualMutation.mutateAsync(input);
            }}
          />
        )}
  
        {attendanceToCorrect && (
          <AttendanceCorrectionModal
            attendance={attendanceToCorrect}
            isSubmitting={correctionMutation.isPending}
            errorMessage={correctionError}
            onClose={() => {
              correctionMutation.reset();
              setAttendanceToCorrect(null);
            }}
            onSubmit={async (input) => {
              await correctionMutation.mutateAsync({
                attendanceId: attendanceToCorrect.id,
                input,
              });
            }}
          />
        )}
  
        {attendanceToView && (
          <AttendanceHistoryDrawer
            attendance={attendanceToView}
            agentName={getAgentName(attendanceToView)}
            canManage={canCorrectAttendance}
            onClose={() => setAttendanceToView(null)}
            onCorrect={(attendance) => {
              setAttendanceToView(null);
              correctionMutation.reset();
              setAttendanceToCorrect(attendance);
            }}
          />
        )}
      </section>
    );
  }