import type {
    HydratedDocument,
    Types,
  } from "mongoose";
  
  export const attendanceStatuses = [
    "PRESENT",
    "LATE",
    "ABSENT",
    "ON_LEAVE",
    "REMOTE",
    "BUSINESS_TRIP",
    "EXCUSED",
  ] as const;
  
  export const attendanceSources = [
    "SELF_SERVICE",
    "MANUAL",
  ] as const;
  
  export const attendanceEventActions = [
    "CHECKED_IN",
    "CHECKED_OUT",
    "MANUAL_CREATED",
    "CORRECTED",
  ] as const;
  
  export type AttendanceStatus =
    (typeof attendanceStatuses)[number];
  
  export type AttendanceSource =
    (typeof attendanceSources)[number];
  
  export type AttendanceEventAction =
    (typeof attendanceEventActions)[number];
  
  export interface Attendance {
    tenantId: Types.ObjectId;
  
    agentId: Types.ObjectId;
  
    directionId: Types.ObjectId;
    serviceId: Types.ObjectId | null;
  
    /**
     * Format stable : YYYY-MM-DD
     * Exemple : 2026-07-04
     */
    attendanceDate: string;
  
    status: AttendanceStatus;
  
    checkInAt?: Date;
    checkOutAt?: Date;
  
    checkInSource?: AttendanceSource;
    checkOutSource?: AttendanceSource;
  
    scheduleStartMinutes: number;
    scheduleEndMinutes: number;
    graceMinutes: number;
  
    lateMinutes: number;
    workedMinutes: number;
    overtimeMinutes: number;
    earlyDepartureMinutes: number;
  
    note?: string;
  
    createdByUserId: Types.ObjectId;
    lastUpdatedByUserId?: Types.ObjectId;
  
    createdAt?: Date;
    updatedAt?: Date;
  }
  
  export interface AttendanceEvent {
    tenantId: Types.ObjectId;
    attendanceId: Types.ObjectId;
    agentId: Types.ObjectId;
  
    actorUserId: Types.ObjectId;
    actorName: string;
  
    action: AttendanceEventAction;
    summary: string;
  
    createdAt?: Date;
  }
  
  export type AttendanceDocument =
    HydratedDocument<Attendance>;
  
  export type AttendanceEventDocument =
    HydratedDocument<AttendanceEvent>;
  
  export type PublicAttendanceAgent = {
    id: string;
    fullName: string;
    matricule?: string;
    jobTitle?: string;
    directionId: string;
    serviceId: string | null;
  };
  
  export type PublicAttendance = {
    id: string;
  
    agentId: string;
    agent?: PublicAttendanceAgent;
  
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
  
  export type PublicAttendanceEvent = {
    id: string;
  
    attendanceId: string;
    agentId: string;
  
    actorUserId: string;
    actorName: string;
  
    action: AttendanceEventAction;
    summary: string;
  
    createdAt?: string;
  };