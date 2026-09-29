import type {
    AttendanceEventAction,
    AttendanceStatus,
  } from "./attendance.types";
  
  export const attendanceTimezone = "Africa/Conakry";
  
  export const attendanceStatusLabels: Record<
    AttendanceStatus,
    string
  > = {
    PRESENT: "Présent",
    LATE: "En retard",
    ABSENT: "Absent",
    ON_LEAVE: "En congé",
    REMOTE: "Télétravail",
    BUSINESS_TRIP: "Mission",
    EXCUSED: "Absence justifiée",
  };
  
  export const attendanceEventLabels: Record<
    AttendanceEventAction,
    string
  > = {
    CHECKED_IN: "Arrivée enregistrée",
    CHECKED_OUT: "Départ enregistré",
    MANUAL_CREATED: "Pointage manuel créé",
    CORRECTED: "Pointage corrigé",
  };
  
  function getConakryParts(
    date: Date,
  ): Record<string, string> {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: attendanceTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .reduce<Record<string, string>>((result, part) => {
        if (part.type !== "literal") {
          result[part.type] = part.value;
        }
  
        return result;
      }, {});
  }
  
  export function getConakryDateKey(
    date = new Date(),
  ): string {
    const parts = getConakryParts(date);
  
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  
  export function getCurrentMonthRange(): {
    dateFrom: string;
    dateTo: string;
  } {
    const currentDate = getConakryDateKey();
    const [year, month] = currentDate.split("-").map(Number);
  
    const lastDay = new Date(
      Date.UTC(year, month, 0),
    ).getUTCDate();
  
    return {
      dateFrom: `${year}-${String(month).padStart(2, "0")}-01`,
      dateTo: `${year}-${String(month).padStart(2, "0")}-${String(
        lastDay,
      ).padStart(2, "0")}`,
    };
  }
  
  export function formatAttendanceDate(
    value?: string,
  ): string {
    if (!value) {
      return "Non renseignée";
    }
  
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: attendanceTimezone,
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00Z`));
  }
  
  export function formatDateTime(
    value?: string,
  ): string {
    if (!value) {
      return "Non renseignée";
    }
  
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: attendanceTimezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }
  
  export function formatClockTime(
    value?: string,
  ): string {
    if (!value) {
      return "—";
    }
  
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: attendanceTimezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  }
  
  export function formatLiveClock(
    value: Date,
  ): string {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: attendanceTimezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(value);
  }
  
  export function formatMinutes(
    minutes: number,
  ): string {
    if (!minutes) {
      return "0 min";
    }
  
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
  
    if (!hours) {
      return `${remainingMinutes} min`;
    }
  
    if (!remainingMinutes) {
      return `${hours} h`;
    }
  
    return `${hours} h ${remainingMinutes} min`;
  }
  
  export function getAttendanceStatusClass(
    status: AttendanceStatus,
  ): string {
    return status.toLowerCase().replace("_", "-");
  }
  
  export function toDateTimeLocalInput(
    value?: string,
  ): string {
    if (!value) {
      return "";
    }
  
    const date = new Date(value);
  
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(
      2,
      "0",
    );
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(
      2,
      "0",
    );
  
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  
  export function toIsoFromDateTimeLocal(
    value?: string,
  ): string | undefined {
    if (!value) {
      return undefined;
    }
  
    const date = new Date(value);
  
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
  
    return date.toISOString();
  }