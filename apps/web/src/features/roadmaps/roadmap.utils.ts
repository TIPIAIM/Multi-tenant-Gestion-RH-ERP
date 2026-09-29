import type {
  KpiReviewStatus,
  RoadmapStatus,
  UserRole,
} from "./roadmap.types";

export const roadmapStatusLabels: Record<RoadmapStatus, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "En validation",
  PARTIALLY_APPROVED: "Validation partielle",
  APPROVED: "Validée",
  RETURNED: "Retournée",
  CLOSED: "Clôturée",
};

export const kpiReviewLabels: Record<KpiReviewStatus, string> = {
  NOT_SUBMITTED: "KPI non déposé",
  PENDING_REVIEW: "KPI à vérifier",
  VALIDATED: "KPI validé",
  NEEDS_DISCUSSION: "À discuter",
};

export const roadmapRoleLabels: Record<UserRole, string> = {
  TENANT_ADMIN: "Administrateur",
  DIRECTION: "Chef de département",
  RH_MANAGER: "Responsable RH",
  SERVICE_MANAGER: "Chef de service",
  AGENT: "Agent",
};

export function statusClass(value: string): string {
  return value.toLowerCase().replaceAll("_", "-");
}

export function formatRoadmapDate(value?: string): string {
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

export function formatRoadmapDateOnly(value?: string): string {
  if (!value) {
    return "Non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Conakry",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} Ko`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function getApprovalHelp(ownerRole: UserRole): string {
  if (ownerRole === "SERVICE_MANAGER") {
    return "Circuit : validation du chef de département.";
  }

  if (ownerRole === "DIRECTION") {
    return "Circuit : validation RH.";
  }

  if (ownerRole === "AGENT") {
    return "Circuit : validation du responsable hiérarchique direct.";
  }

  if (ownerRole === "RH_MANAGER") {
    return "Circuit : validation administrative par l'administrateur.";
  }

  return "Circuit : validation par un autre compte habilité.";
}

export function getRoadmapProgressLabel(progress: number): string {
  if (progress <= 0) {
    return "Non démarrée";
  }

  if (progress < 50) {
    return "En démarrage";
  }

  if (progress < 100) {
    return "En progression";
  }

  return "Finalisée";
}
