import type {
  LeaveRequestStatus,
  LeaveType,
} from "./leave.types";

export const leaveTypeLabels: Record<LeaveType, string> = {
  ANNUAL_LEAVE: "Congé annuel",
  SICK_LEAVE: "Congé maladie",
  MATERNITY_LEAVE: "Congé maternité",
  PATERNITY_LEAVE: "Congé paternité",
  SPECIAL_LEAVE: "Congé exceptionnel",
  UNPAID_LEAVE: "Congé sans solde",
  TRAINING_LEAVE: "Congé formation",
  OTHER: "Autre absence",
};

export const leaveStatusLabels: Record<
  LeaveRequestStatus,
  string
> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumise",
  MANAGER_APPROVED: "Validation hiérarchique",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
};

export const leaveActivityLabels: Record<string, string> = {
  CREATED: "Demande créée",
  UPDATED: "Demande modifiée",
  SUBMITTED: "Demande soumise",
  MANAGER_APPROVED: "Validation hiérarchique",
  APPROVED: "Décision RH favorable",
  REJECTED: "Demande refusée",
  CANCELLED: "Demande annulée",
  BALANCE_CREATED: "Solde créé",
  BALANCE_ADJUSTED: "Solde ajusté",
  BALANCE_CONSUMED: "Solde consommé",
  BALANCE_RESTORED: "Solde rétabli",
};

export function getCurrentYear(): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Conakry",
      year: "numeric",
    }).format(new Date()),
  );
}

export function formatLeaveDate(value?: string): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Conakry",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatLeaveDateTime(value?: string): string {
  if (!value) {
    return "Non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Conakry",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDays(value: number): string {
  return `${value} jour${value > 1 ? "s" : ""}`;
}

export function getLeaveStatusClass(
  status: LeaveRequestStatus,
): string {
  return status.toLowerCase().replace("_", "-");
}

export function calculateWorkingDaysPreview(
  startDate: string,
  endDate: string,
): number {
  if (!startDate || !endDate || endDate < startDate) {
    return 0;
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  let count = 0;

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.getUTCDay();

    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }

  return count;
}
