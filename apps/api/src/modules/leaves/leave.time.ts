import { AppError } from "../../core/errors/app-error.js";

export const LEAVE_TIMEZONE = "Africa/Conakry";

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getConakryDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAVE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") {
        result[part.type] = part.value;
      }

      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getCalendarYear(dateKey: string): number {
  return Number(dateKey.slice(0, 4));
}

export function assertLeaveDateRange(input: {
  startDate: string;
  endDate: string;
}): void {
  if (!isValidDateKey(input.startDate)) {
    throw new AppError(
      "La date de début est invalide.",
      400,
      "LEAVE_START_DATE_INVALID",
    );
  }

  if (!isValidDateKey(input.endDate)) {
    throw new AppError(
      "La date de fin est invalide.",
      400,
      "LEAVE_END_DATE_INVALID",
    );
  }

  if (input.endDate < input.startDate) {
    throw new AppError(
      "La date de fin ne peut pas précéder la date de début.",
      400,
      "LEAVE_DATE_RANGE_INVALID",
    );
  }

  if (
    getCalendarYear(input.startDate) !==
    getCalendarYear(input.endDate)
  ) {
    throw new AppError(
      "Une demande ne peut pas chevaucher deux années administratives. Créez une demande par année.",
      400,
      "LEAVE_CROSS_YEAR_NOT_SUPPORTED",
    );
  }
}

export function calculateWorkingDays(input: {
  startDate: string;
  endDate: string;
}): number {
  assertLeaveDateRange(input);

  const start = new Date(`${input.startDate}T00:00:00Z`);
  const end = new Date(`${input.endDate}T00:00:00Z`);

  let total = 0;

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.getUTCDay();

    if (day !== 0 && day !== 6) {
      total += 1;
    }
  }

  if (!total) {
    throw new AppError(
      "La période demandée ne contient aucun jour ouvré.",
      400,
      "LEAVE_NO_WORKING_DAY",
    );
  }

  return total;
}
