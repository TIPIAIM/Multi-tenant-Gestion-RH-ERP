import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  Attendance,
  AttendanceEvent,
  AttendanceListParams,
  AttendanceListResult,
  AttendanceStats,
  CreateManualAttendanceInput,
  UpdateAttendanceInput,
} from "./attendance.types";

type AttendanceResponse = {
  attendance: Attendance;
};

type TodayAttendanceResponse = {
  attendance: Attendance | null;
};

type AttendanceStatsResponse = {
  stats: AttendanceStats;
};

type AttendanceEventsResponse = {
  events: AttendanceEvent[];
};

type DeleteAttendanceResponse = {
  deleted: true;
  id: string;
};

export async function getMyAttendanceToday(): Promise<
  Attendance | null
> {
  const response = await api.get<
    ApiSuccess<TodayAttendanceResponse>
  >("/attendance/me/today");

  return response.data.data.attendance;
}

export async function checkInSelf(
  note?: string,
): Promise<Attendance> {
  const response = await api.post<
    ApiSuccess<AttendanceResponse>
  >("/attendance/check-in", {
    note,
  });

  return response.data.data.attendance;
}

export async function checkOutSelf(
  note?: string,
): Promise<Attendance> {
  const response = await api.post<
    ApiSuccess<AttendanceResponse>
  >("/attendance/check-out", {
    note,
  });

  return response.data.data.attendance;
}

export async function getAttendanceStats(
  params: {
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<AttendanceStats> {
  const response = await api.get<
    ApiSuccess<AttendanceStatsResponse>
  >("/attendance/stats", {
    params,
  });

  return response.data.data.stats;
}

export async function getAttendances(
  params: AttendanceListParams,
): Promise<AttendanceListResult> {
  const response = await api.get<
    ApiSuccess<AttendanceListResult>
  >("/attendance", {
    params,
  });

  return response.data.data;
}

export async function createManualAttendance(
  input: CreateManualAttendanceInput,
): Promise<Attendance> {
  const response = await api.post<
    ApiSuccess<AttendanceResponse>
  >("/attendance/manual", input);

  return response.data.data.attendance;
}

export async function updateAttendance(
  attendanceId: string,
  input: UpdateAttendanceInput,
): Promise<Attendance> {
  const response = await api.patch<
    ApiSuccess<AttendanceResponse>
  >(`/attendance/${attendanceId}`, input);

  return response.data.data.attendance;
}

export async function getAttendanceEvents(
  attendanceId: string,
): Promise<AttendanceEvent[]> {
  const response = await api.get<
    ApiSuccess<AttendanceEventsResponse>
  >(`/attendance/${attendanceId}/events`, {
    params: {
      limit: 50,
    },
  });

  return response.data.data.events;
}
export async function deleteAttendance(
  attendanceId: string,
): Promise<void> {
  await api.delete<ApiSuccess<DeleteAttendanceResponse>>(
    `/attendance/${attendanceId}`,
  );
}
