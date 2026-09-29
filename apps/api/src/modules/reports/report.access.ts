import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { OrganizationUnitModel } from "../organisation/organization.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import type { ManagementReportDocument, ManagementReportScopeType } from "./report.types.js";

export type ReportActorRole = "TENANT_ADMIN" | "DIRECTION" | "RH_MANAGER" | "SERVICE_MANAGER" | "AGENT";
export type ReportActor = {
  userId: Types.ObjectId;
  fullName: string;
  role: ReportActorRole;
  directionId?: Types.ObjectId;
  serviceId?: Types.ObjectId | null;
  isConfigured: boolean;
  configurationMessage?: string;
};

type LeanUser = { _id: Types.ObjectId; fullName?: string; email?: string; role?: string; agentId?: Types.ObjectId | string | null };
type LeanAgent = { _id: Types.ObjectId; directionId?: Types.ObjectId; serviceId?: Types.ObjectId | null };
type LeanUnit = { _id: Types.ObjectId; parentId?: Types.ObjectId | null };

function sameId(first?: Types.ObjectId | string | null, second?: Types.ObjectId | string | null): boolean {
  return Boolean(first && second && first.toString() === second.toString());
}

function isGlobal(role: ReportActorRole): boolean {
  return role === "TENANT_ADMIN" || role === "RH_MANAGER";
}

async function findAgent(tenantId: Types.ObjectId, user: LeanUser): Promise<LeanAgent | null> {
  const byUser = (await (AgentModel as any).findOne({ tenantId, userId: user._id, employmentStatus: "ACTIVE" }).select("_id directionId serviceId").lean().exec()) as LeanAgent | null;
  if (byUser) return byUser;
  if (user.email) {
    const byEmail = (await (AgentModel as any).findOne({ tenantId, email: user.email.toLowerCase(), employmentStatus: "ACTIVE" }).select("_id directionId serviceId").lean().exec()) as LeanAgent | null;
    if (byEmail) return byEmail;
  }
  if (!user.agentId) return null;
  return (await (AgentModel as any).findOne({ tenantId, _id: user.agentId, employmentStatus: "ACTIVE" }).select("_id directionId serviceId").lean().exec()) as LeanAgent | null;
}

export async function resolveReportActor(tenant: TenantDocument, userId: string): Promise<ReportActor> {
  const tenantId = tenant._id as Types.ObjectId;
  const user = (await (UserModel as any).findOne({ _id: userId, tenantId, isActive: true }).select("_id fullName email role agentId").lean().exec()) as LeanUser | null;
  if (!user) throw new AppError("Votre session utilisateur est invalide ou inactive.", 401, "REPORT_ACTOR_NOT_FOUND");

  const role = user.role as ReportActorRole;
  if (!["TENANT_ADMIN", "DIRECTION", "RH_MANAGER", "SERVICE_MANAGER"].includes(role)) {
    throw new AppError("Votre rôle ne permet pas d'accéder au module Rapports.", 403, "REPORT_ROLE_NOT_ALLOWED");
  }

  if (isGlobal(role)) return { userId: user._id, fullName: user.fullName?.trim() || "Utilisateur ", role, isConfigured: true };

  const agent = await findAgent(tenantId, user);
  if (role === "DIRECTION") {
    const managed = (await (OrganizationUnitModel as any).findOne({ tenantId, type: "DIRECTION", status: "ACTIVE", managerUserId: user._id }).select("_id").lean().exec()) as LeanUnit | null;
    const directionId = managed?._id ?? agent?.directionId;
    return { userId: user._id, fullName: user.fullName?.trim() || "Responsable de Direction", role, directionId, serviceId: null, isConfigured: Boolean(directionId), configurationMessage: directionId ? undefined : "Ce compte Direction n'est rattaché à aucune Direction active." };
  }

  const managedService = (await (OrganizationUnitModel as any).findOne({ tenantId, type: "SERVICE", status: "ACTIVE", managerUserId: user._id }).select("_id parentId").lean().exec()) as LeanUnit | null;
  const directionId = managedService?.parentId ?? agent?.directionId;
  const serviceId = managedService?._id ?? agent?.serviceId;
  return { userId: user._id, fullName: user.fullName?.trim() || "Chef de service", role, directionId: directionId ?? undefined, serviceId: serviceId ?? null, isConfigured: Boolean(directionId && serviceId), configurationMessage: directionId && serviceId ? undefined : "Ce compte Chef de service n'est rattaché à aucun Service actif." };
}

export function assertCanUseReports(actor: ReportActor): void {
  if (actor.isConfigured || isGlobal(actor.role)) return;
  throw new AppError(actor.configurationMessage ?? "Votre périmètre Rapport n'est pas configuré.", 403, "REPORT_ACTOR_NOT_CONFIGURED");
}

export function normalizeRequestedReportScope(actor: ReportActor, input: { scopeType: ManagementReportScopeType; directionId?: string; serviceId?: string }): { scopeType: ManagementReportScopeType; directionId?: Types.ObjectId; serviceId?: Types.ObjectId | null } {
  assertCanUseReports(actor);

  if (isGlobal(actor.role)) {
    return {
      scopeType: input.scopeType,
      directionId: input.directionId ? new Types.ObjectId(input.directionId) : undefined,
      serviceId: input.serviceId ? new Types.ObjectId(input.serviceId) : null,
    };
  }

  if (actor.role === "DIRECTION") {
    if (input.scopeType === "INSTITUTION") throw new AppError("Une Direction ne peut générer qu'un rapport de sa Direction ou de l'un de ses Services.", 403, "REPORT_SCOPE_FORBIDDEN");
    if (input.directionId && !sameId(input.directionId, actor.directionId)) throw new AppError("La Direction demandée ne relève pas de votre périmètre.", 403, "REPORT_SCOPE_FORBIDDEN");
    return {
      scopeType: input.scopeType === "SERVICE" ? "SERVICE" : "DIRECTION",
      directionId: actor.directionId,
      serviceId: input.scopeType === "SERVICE" && input.serviceId ? new Types.ObjectId(input.serviceId) : null,
    };
  }

  if (input.scopeType !== "SERVICE") throw new AppError("Un Chef de service ne peut générer que le rapport de son Service.", 403, "REPORT_SCOPE_FORBIDDEN");
  if (input.serviceId && !sameId(input.serviceId, actor.serviceId)) throw new AppError("Le Service demandé ne relève pas de votre périmètre.", 403, "REPORT_SCOPE_FORBIDDEN");
  return { scopeType: "SERVICE", directionId: actor.directionId, serviceId: actor.serviceId ?? null };
}

export function getStoredReportScopeFilter(actor: ReportActor): Record<string, unknown> {
  if (isGlobal(actor.role)) return {};
  if (!actor.isConfigured) return { _id: new Types.ObjectId("000000000000000000000000") };
  if (actor.role === "DIRECTION") return { directionId: actor.directionId };
  return { directionId: actor.directionId, serviceId: actor.serviceId };
}

function canReadReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): boolean {
  if (isGlobal(actor.role)) {
    return true;
  }

  if (
    actor.role === "DIRECTION" &&
    sameId(
      report.directionId,
      actor.directionId,
    )
  ) {
    return true;
  }

  if (
    actor.role === "SERVICE_MANAGER" &&
    sameId(
      report.directionId,
      actor.directionId,
    ) &&
    sameId(
      report.serviceId,
      actor.serviceId,
    )
  ) {
    return true;
  }

  return false;
}

export function assertCanReadReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): void {
  if (canReadReport(report, actor)) {
    return;
  }

  throw new AppError(
    "Ce rapport ne relève pas de votre périmètre.",
    403,
    "REPORT_READ_FORBIDDEN",
  );
}

/**
 * La propriété d'un rapport est déterminée par le compte qui l'a créé.
 * Cela empêche tout autre compte, même RH/Admin ou rattaché au même Agent,
 * de modifier le contenu à la place du rédacteur.
 */
export function isReportCreator(
  report: ManagementReportDocument,
  actor: ReportActor,
): boolean {
  return sameId(
    report.createdByUserId,
    actor.userId,
  );
}

export function canEditReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): boolean {
  return (
    canReadReport(report, actor) &&
    isReportCreator(report, actor) &&
    ["DRAFT", "READY"].includes(
      report.status,
    )
  );
}

export function canRecomputeReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): boolean {
  return canEditReport(
    report,
    actor,
  );
}

export function assertCanEditReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): void {
  assertCanReadReport(
    report,
    actor,
  );

  if (
    !isReportCreator(
      report,
      actor,
    )
  ) {
    throw new AppError(
      "Seul le compte qui a créé ce rapport peut en modifier le contenu.",
      403,
      "REPORT_CREATOR_EDIT_ONLY",
    );
  }
}

export function assertCanRecomputeReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): void {
  assertCanReadReport(
    report,
    actor,
  );

  if (
    !isReportCreator(
      report,
      actor,
    )
  ) {
    throw new AppError(
      "Seul le créateur du rapport peut recalculer ses données.",
      403,
      "REPORT_CREATOR_RECOMPUTE_ONLY",
    );
  }
}

export function canValidateReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): boolean {
  if (
    report.status !== "READY" ||
    isReportCreator(
      report,
      actor,
    )
  ) {
    return false;
  }

  if (!canReadReport(report, actor)) {
    return false;
  }

  if (isGlobal(actor.role)) {
    return true;
  }

  return (
    actor.role === "DIRECTION" &&
    sameId(
      report.directionId,
      actor.directionId,
    )
  );
}

export function assertCanValidateReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): void {
  assertCanReadReport(
    report,
    actor,
  );

  if (
    isReportCreator(
      report,
      actor,
    )
  ) {
    throw new AppError(
      "Le rédacteur ne peut pas valider son propre rapport. La validation doit être effectuée par une personne habilitée distincte.",
      403,
      "REPORT_SELF_VALIDATION_FORBIDDEN",
    );
  }

  if (
    isGlobal(actor.role)
  ) {
    return;
  }

  if (
    actor.role === "DIRECTION" &&
    sameId(
      report.directionId,
      actor.directionId,
    )
  ) {
    return;
  }

  throw new AppError(
    "La validation du rapport est réservée à la Direction compétente, à la RH ou à l'administrateur.",
    403,
    "REPORT_VALIDATE_FORBIDDEN",
  );
}

export function canArchiveReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): boolean {
  if (
    report.status !==
    "VALIDATED"
  ) {
    return false;
  }

  if (
    isReportCreator(
      report,
      actor,
    )
  ) {
    return false;
  }

  if (!canReadReport(report, actor)) {
    return false;
  }

  if (isGlobal(actor.role)) {
    return true;
  }

  return (
    actor.role === "DIRECTION" &&
    sameId(
      report.directionId,
      actor.directionId,
    )
  );
}

export function assertCanArchiveReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): void {
  assertCanReadReport(
    report,
    actor,
  );

  if (
    isReportCreator(
      report,
      actor,
    )
  ) {
    throw new AppError(
      "L'archivage doit être effectué par une personne habilitée distincte du rédacteur.",
      403,
      "REPORT_SELF_ARCHIVE_FORBIDDEN",
    );
  }

  if (
    isGlobal(actor.role)
  ) {
    return;
  }

  if (
    actor.role === "DIRECTION" &&
    sameId(
      report.directionId,
      actor.directionId,
    )
  ) {
    return;
  }

  throw new AppError(
    "Vous ne pouvez pas archiver ce rapport.",
    403,
    "REPORT_ARCHIVE_FORBIDDEN",
  );
}

/**
 * Suppression :
 * - Administrateur : capacité de gouvernance globale.
 * - Créateur : seulement avant validation/archivage.
 * - RH : ne supprime plus le rapport d'un autre rédacteur.
 */
export function canDeleteReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): boolean {
  if (
    actor.role ===
    "TENANT_ADMIN"
  ) {
    return true;
  }

  return (
    isReportCreator(
      report,
      actor,
    ) &&
    ["DRAFT", "READY"].includes(
      report.status,
    )
  );
}

export function assertCanDeleteReport(
  report: ManagementReportDocument,
  actor: ReportActor,
): void {
  assertCanReadReport(
    report,
    actor,
  );

  if (
    canDeleteReport(
      report,
      actor,
    )
  ) {
    return;
  }

  throw new AppError(
    "Vous ne pouvez pas supprimer ce rapport. Seul son créateur avant validation, ou l'administrateur, dispose de cette action.",
    403,
    "REPORT_DELETE_FORBIDDEN",
  );
}

export type ReportPermissions = {
  isOwner: boolean;
  canEdit: boolean;
  canRecompute: boolean;
  canValidate: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canDownload: boolean;
  readOnly: boolean;
};

export function getReportPermissions(
  report: ManagementReportDocument,
  actor: ReportActor,
): ReportPermissions {
  const isOwner =
    isReportCreator(
      report,
      actor,
    );

  const canEdit =
    canEditReport(
      report,
      actor,
    );

  const canRecompute =
    canRecomputeReport(
      report,
      actor,
    );

  const canValidate =
    canValidateReport(
      report,
      actor,
    );

  const canArchive =
    canArchiveReport(
      report,
      actor,
    );

  const canDelete =
    canDeleteReport(
      report,
      actor,
    );

  const canDownload =
    canReadReport(
      report,
      actor,
    );

  return {
    isOwner,
    canEdit,
    canRecompute,
    canValidate,
    canArchive,
    canDelete,
    canDownload,
    readOnly:
      !canEdit &&
      !canRecompute &&
      !canValidate &&
      !canArchive &&
      !canDelete,
  };
}
