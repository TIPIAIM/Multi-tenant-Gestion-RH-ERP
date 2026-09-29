export type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "ON_LEAVE"
  | "REMOTE"
  | "BUSINESS_TRIP"
  | "EXCUSED";

export type AttendanceSource =
  | "SELF_SERVICE"
  | "MANUAL";

export type AttendanceEventAction =
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "MANUAL_CREATED"
  | "CORRECTED";

export type Attendance = {
  id: string;

  agentId: string;

  directionId: string;
  serviceId: string | null;

  attendanceDate: string;

  status: AttendanceStatus;

  checkInAt?: string;
  checkOutAt?: string;

  checkInSource?: AttendanceSource;
  checkOutSource?: AttendanceSource;

  lateMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  earlyDepartureMinutes: number;

  note?: string;

  createdByUserId: string;
  lastUpdatedByUserId?: string;

  createdAt?: string;
  updatedAt?: string;
};

export type AttendanceEvent = {
  id: string;

  attendanceId: string;
  agentId: string;

  actorUserId: string;
  actorName: string;

  action: AttendanceEventAction;
  summary: string;

  createdAt?: string;
};

export type AttendanceStats = {
  dateFrom: string;
  dateTo: string;

  total: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  remote: number;
  businessTrip: number;
  excused: number;

  pendingCheckOut: number;

  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
};

export type AttendanceListParams = {
  page?: number;
  limit?: number;

  dateFrom?: string;
  dateTo?: string;

  status?: AttendanceStatus;

  agentId?: string;
  directionId?: string;
  serviceId?: string;
};

export type AttendanceListResult = {
  items: Attendance[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CreateManualAttendanceInput = {
  agentId: string;
  attendanceDate: string;

  status: AttendanceStatus;

  checkInAt?: string;
  checkOutAt?: string;

  note?: string;
};

export type UpdateAttendanceInput = {
  status?: AttendanceStatus;

  checkInAt?: string;
  checkOutAt?: string;

  note?: string;
};