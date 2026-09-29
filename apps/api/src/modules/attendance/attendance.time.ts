export const ATTENDANCE_TIMEZONE = "Africa/Conakry";

/**
 * À déplacer plus tard dans le module Paramètres RH.
 * Pour l’instant :
 * arrivée prévue : 08h30
 * départ prévu : 17h30
 * tolérance : 5 minutes
 */
export const defaultAttendanceSchedule = {
  startMinutes: 8 * 60 + 30,
  endMinutes: 17 * 60 + 30,
  graceMinutes: 5,
} as const;

function getZonedParts(
  date: Date,
): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return formatter.formatToParts(date).reduce<
    Record<string, string>
  >((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }

    return result;
  }, {});
}

export function getAttendanceDateKey(
  date = new Date(),
): string {
  const parts = getZonedParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTimeInAttendanceTimezone(
  date: Date,
): number {
  const parts = getZonedParts(date);

  const hour = Number(parts.hour ?? "0");
  const minute = Number(parts.minute ?? "0");

  return hour * 60 + minute;
}

export function getCurrentMonthRange(): {
  dateFrom: string;
  dateTo: string;
} {
  const today = getAttendanceDateKey();
  const [yearPart, monthPart] = today.split("-");

  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error("La date courante de pointage est invalide.");
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    dateFrom: `${year}-${String(month).padStart(2, "0")}-01`,
    dateTo: `${year}-${String(month).padStart(2, "0")}-${String(
      lastDay,
    ).padStart(2, "0")}`,
  };
}

export function calculateAttendanceMetrics(input: {
  checkInAt?: Date;
  checkOutAt?: Date;

  scheduleStartMinutes?: number;
  scheduleEndMinutes?: number;
  graceMinutes?: number;
}): {
  lateMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  earlyDepartureMinutes: number;
} {
  const scheduleStartMinutes =
    input.scheduleStartMinutes ??
    defaultAttendanceSchedule.startMinutes;

  const scheduleEndMinutes =
    input.scheduleEndMinutes ??
    defaultAttendanceSchedule.endMinutes;

  const graceMinutes =
    input.graceMinutes ??
    defaultAttendanceSchedule.graceMinutes;

  const checkInMinutes = input.checkInAt
    ? getTimeInAttendanceTimezone(input.checkInAt)
    : undefined;

  let checkOutMinutes = input.checkOutAt
    ? getTimeInAttendanceTimezone(input.checkOutAt)
    : undefined;

  if (
    checkInMinutes !== undefined &&
    checkOutMinutes !== undefined &&
    checkOutMinutes < checkInMinutes
  ) {
    checkOutMinutes += 24 * 60;
  }

  const normalizedScheduleEnd =
    scheduleEndMinutes < scheduleStartMinutes
      ? scheduleEndMinutes + 24 * 60
      : scheduleEndMinutes;

  const lateMinutes =
    checkInMinutes !== undefined
      ? Math.max(
          0,
          checkInMinutes -
            scheduleStartMinutes -
            graceMinutes,
        )
      : 0;

  const workedMinutes =
    input.checkInAt && input.checkOutAt
      ? Math.max(
          0,
          Math.floor(
            (input.checkOutAt.getTime() -
              input.checkInAt.getTime()) /
              60_000,
          ),
        )
      : 0;

  const overtimeMinutes =
    checkOutMinutes !== undefined
      ? Math.max(
          0,
          checkOutMinutes - normalizedScheduleEnd,
        )
      : 0;

  const earlyDepartureMinutes =
    checkOutMinutes !== undefined
      ? Math.max(
          0,
          normalizedScheduleEnd - checkOutMinutes,
        )
      : 0;

  return {
    lateMinutes,
    workedMinutes,
    overtimeMinutes,
    earlyDepartureMinutes,
  };
}