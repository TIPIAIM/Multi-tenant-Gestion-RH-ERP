import fs from "node:fs";
import { Types, type SortOrder } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import {
  assertCanManageRoadmap,
  assertCanReadRoadmap,
  assertCanReviewKpi,
  assertCanReviewRoadmap,
  canCloseRoadmap,
  canDeleteRoadmap,
  canDownloadRoadmapKpiFile,
  canEditRoadmap,
  canReviewRoadmap,
  canReviewRoadmapKpi,
  canSubmitRoadmap,
  canSubmitRoadmapKpi,
  getRequiredApprovalTypes,
  getRoadmapScopeFilter,
  isRoadmapCreator,
  requireOwnRoadmapOwner,
  type RoadmapActor,
} from "./roadmap.access.js";
import { RoadmapActivityModel, RoadmapModel } from "./roadmap.model.js";
import type {
  CreateRoadmapInput,
  ListRoadmapsQuery,
  ReviewItemKpiInput,
  ReviewRoadmapInput,
  SubmitKpiInput,
  UpdateRoadmapInput,
} from "./roadmap.schema.js";
import type {
  PublicRoadmap,
  PublicRoadmapActivity,
  PublicRoadmapApprovalReview,
  PublicRoadmapItem,
  PublicRoadmapItemPermissions,
  PublicRoadmapPermissions,
  RoadmapActivityAction,
  RoadmapApprovalReview,
  RoadmapApprovalType,
  RoadmapDocument,
  RoadmapKpiFile,
  RoadmapStatus,
} from "./roadmap.types.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
 
function serializeApprovalReview(review?: RoadmapApprovalReview): PublicRoadmapApprovalReview | undefined {
  if (!review) {
    return undefined;
  }

  return {
    reviewedByUserId: review.reviewedByUserId.toString(),
    reviewedByName: review.reviewedByName,
    reviewType: review.reviewType,
    comment: review.comment,
    reviewedAt: review.reviewedAt.toISOString(),
  };
}

function itemPermissions(
  item: any,
  roadmap: RoadmapDocument,
  actor: RoadmapActor,
): PublicRoadmapItemPermissions {
  const ownerCanSubmit =
    canSubmitRoadmapKpi(actor, roadmap) &&
    !item.kpiLocked &&
    (
      item.reviewStatus === "NOT_SUBMITTED" ||
      item.reviewStatus === "NEEDS_DISCUSSION"
    );

  const reviewerCanReview =
    canReviewRoadmapKpi(actor, roadmap) &&
    item.reviewStatus === "PENDING_REVIEW";

  return {
    canSubmitKpi: ownerCanSubmit,
    canReviewKpi: reviewerCanReview,
    canDownloadKpiFile:
      Boolean(item.kpiFile) &&
      canDownloadRoadmapKpiFile(actor, roadmap),
    isLocked:
      Boolean(item.kpiLocked) ||
      item.reviewStatus === "PENDING_REVIEW" ||
      item.reviewStatus === "VALIDATED",
  };
}

function serializeItem(
  item: any,
  roadmap: RoadmapDocument,
  actor: RoadmapActor,
): PublicRoadmapItem {
  return {
    id: item._id.toString(),
    title: item.title,
    description: item.description,
    kpiLabel: item.kpiLabel,
    plannedPeriod: item.plannedPeriod,
    dueDate: item.dueDate,
    status: item.status,
    completedAt: item.completedAt?.toISOString(),
    completedByUserId: item.completedByUserId?.toString(),
    kpiText: item.kpiText,
    kpiFile: item.kpiFile
      ? {
          originalFileName: item.kpiFile.originalFileName,
          storedFileName: item.kpiFile.storedFileName,
          mimeType: item.kpiFile.mimeType,
          sizeBytes: item.kpiFile.sizeBytes,
          uploadedAt: item.kpiFile.uploadedAt.toISOString(),
          uploadedByUserId: item.kpiFile.uploadedByUserId.toString(),
        }
      : undefined,
    kpiSubmittedAt: item.kpiSubmittedAt?.toISOString(),
    kpiSubmittedByUserId: item.kpiSubmittedByUserId?.toString(),
    kpiLocked: item.kpiLocked,
    reviewStatus: item.reviewStatus,
    review: item.review
      ? {
          reviewedByUserId: item.review.reviewedByUserId.toString(),
          reviewedByName: item.review.reviewedByName,
          status: item.review.status,
          comment: item.review.comment,
          reviewedAt: item.review.reviewedAt.toISOString(),
        }
      : undefined,
    permissions: itemPermissions(
      item,
      roadmap,
      actor,
    ),
  };
}

function roadmapPermissions(
  roadmap: RoadmapDocument,
  actor: RoadmapActor,
): PublicRoadmapPermissions {
  const canEdit =
    canEditRoadmap(actor, roadmap);

  const canSubmit =
    canSubmitRoadmap(actor, roadmap);

  const canApprove =
    canReviewRoadmap(actor, roadmap);

  const canReturn = canApprove;

  const canSubmitKpi = roadmap.items.some(
    (item: any) =>
      itemPermissions(
        item,
        roadmap,
        actor,
      ).canSubmitKpi,
  );

  const canReviewKpi = roadmap.items.some(
    (item: any) =>
      itemPermissions(
        item,
        roadmap,
        actor,
      ).canReviewKpi,
  );

  const canDownloadKpiFiles =
    roadmap.items.some(
      (item: any) =>
        Boolean(item.kpiFile),
    ) &&
    canDownloadRoadmapKpiFile(
      actor,
      roadmap,
    );

  const canClose =
    canCloseRoadmap(actor) &&
    roadmap.status === "APPROVED";

  const canDelete =
    canDeleteRoadmap(actor);

  return {
    canEdit,
    canSubmit,
    canApprove,
    canReturn,
    canClose,
    canDelete,
    canSubmitKpi,
    canReviewKpi,
    canDownloadKpiFiles,
    readOnly:
      !canEdit &&
      !canSubmit &&
      !canApprove &&
      !canReturn &&
      !canClose &&
      !canDelete &&
      !canSubmitKpi &&
      !canReviewKpi,
  };
}

function serializeRoadmap(
  roadmap: RoadmapDocument,
  actor: RoadmapActor,
): PublicRoadmap {
  return {
    id: roadmap.id,
    tenantId: roadmap.tenantId.toString(),
    agentId: roadmap.agentId.toString(),
    directionId: roadmap.directionId.toString(),
    serviceId: roadmap.serviceId
      ? roadmap.serviceId.toString()
      : null,
    ownerRole: roadmap.ownerRole,
    calendarYear: roadmap.calendarYear,
    reference: roadmap.reference,
    title: roadmap.title,
    overview: roadmap.overview,
    status: roadmap.status,
    items: roadmap.items.map(
      (item: any) =>
        serializeItem(
          item,
          roadmap,
          actor,
        ),
    ),
    itemCount: roadmap.itemCount,
    completedItemCount:
      roadmap.completedItemCount,
    progressPercentage:
      roadmap.progressPercentage,
    submittedAt:
      roadmap.submittedAt?.toISOString(),
    approvedAt:
      roadmap.approvedAt?.toISOString(),
    returnedAt:
      roadmap.returnedAt?.toISOString(),
    closedAt:
      roadmap.closedAt?.toISOString(),
    departmentReview:
      serializeApprovalReview(
        roadmap.departmentReview,
      ),
    hrReview:
      serializeApprovalReview(
        roadmap.hrReview,
      ),
    managerComment:
      roadmap.managerComment,
    createdByUserId:
      roadmap.createdByUserId.toString(),
    lastUpdatedByUserId:
      roadmap.lastUpdatedByUserId?.toString(),
    createdAt:
      roadmap.createdAt?.toISOString(),
    updatedAt:
      roadmap.updatedAt?.toISOString(),
    permissions:
      roadmapPermissions(
        roadmap,
        actor,
      ),
  };
}

function updateProgress(roadmap: RoadmapDocument): void {
  roadmap.itemCount = roadmap.items.length;
  roadmap.completedItemCount = roadmap.items.filter((item: any) => item.status === "DONE").length;
  roadmap.progressPercentage = roadmap.itemCount ? Math.round((roadmap.completedItemCount / roadmap.itemCount) * 100) : 0;
}

async function nextReference(tenant: TenantDocument, year: number): Promise<string> {
  const count = await RoadmapModel.countDocuments({ tenantId: tenant._id, calendarYear: year }).exec();
  return `FDR-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function getRoadmapOrThrow(tenant: TenantDocument, id: string, includeFilePath = false): Promise<RoadmapDocument> {
  const query = RoadmapModel.findOne({ _id: id, tenantId: tenant._id });
  if (includeFilePath) query.select("+items.kpiFile.storagePath");
  const roadmap = await query.exec();
  if (!roadmap) throw new AppError("Feuille de route introuvable.", 404, "ROADMAP_NOT_FOUND");
  return roadmap;
}

async function activity(input: {
  tenant: TenantDocument;
  roadmap: RoadmapDocument;
  actor: RoadmapActor;
  action: RoadmapActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await RoadmapActivityModel.create({
    tenantId: input.tenant._id,
    roadmapId: input.roadmap._id,
    agentId: input.roadmap.agentId,
    actorUserId: input.actor.userId,
    actorName: input.actor.fullName,
    action: input.action,
    summary: input.summary,
    metadata: input.metadata,
  });
}

function clearApprovalState(roadmap: RoadmapDocument): void {
  roadmap.departmentReview = undefined;
  roadmap.hrReview = undefined;
  roadmap.approvedAt = undefined;
  roadmap.returnedAt = undefined;
}

function getApprovalStatus(roadmap: RoadmapDocument): RoadmapStatus {
  const requiredTypes = getRequiredApprovalTypes(roadmap);
  const hasDepartment = Boolean(roadmap.departmentReview);
  const hasRh = Boolean(roadmap.hrReview);

  const isComplete = requiredTypes.every((type) =>
    type === "DEPARTMENT" ? hasDepartment : hasRh,
  );

  if (isComplete) {
    return "APPROVED";
  }

  if (hasDepartment || hasRh) {
    return "PARTIALLY_APPROVED";
  }

  return "SUBMITTED";
}

function getApprovalSummary(roadmap: RoadmapDocument): string {
  const requiredTypes = getRequiredApprovalTypes(roadmap);
  const labels = requiredTypes.map((type) => (type === "DEPARTMENT" ? "responsable hiérarchique" : "RH"));
  return `Validation requise : ${labels.join(" + ")}.`;
}

function getRoadmapItemOrThrow(
  roadmap: RoadmapDocument,
  itemId: string,
): any {
  const items = roadmap.items as any;
  const item = typeof items.id === "function"
    ? items.id(itemId)
    : roadmap.items.find((candidate: any) =>
        candidate?._id?.toString() === itemId,
      );

  if (!item) {
    throw new AppError(
      "Ligne de feuille de route introuvable.",
      404,
      "ROADMAP_ITEM_NOT_FOUND",
    );
  }

  return item;
}

 //
function assertCanDeleteRoadmap(actor: RoadmapActor): void {
  if (!canDeleteRoadmap(actor)) {
    throw new AppError(
      "Seul l'administrateur peut supprimer une feuille de route.",
      403,
      "ROADMAP_DELETE_ADMIN_ONLY",
    );
  }
}

function collectKpiStoragePaths(roadmap: RoadmapDocument): string[] {
  const paths: string[] = [];

  roadmap.items.forEach((item: any) => {
    const storagePath = item?.kpiFile?.storagePath;

    if (typeof storagePath === "string" && storagePath.trim()) {
      paths.push(storagePath);
    }
  });

  return [...new Set(paths)];
}

function removeKpiFilesQuietly(paths: string[]): void {
  paths.forEach((storagePath) => {
    try {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
    } catch {
      // La suppression du fichier ne doit pas faire échouer la suppression métier.
      // Le fichier orphelin pourra être nettoyé par une maintenance technique.
    }
  });
}

 //
export async function createRoadmap(
  tenant: TenantDocument,
  actor: RoadmapActor,
  input: CreateRoadmapInput,
): Promise<PublicRoadmap> {
  const owner = requireOwnRoadmapOwner(actor);

  const roadmap = await RoadmapModel.create({
    tenantId: tenant._id,
    agentId: owner.agentId,
    directionId: owner.directionId,
    serviceId: owner.serviceId,
    ownerRole: owner.ownerRole,
    calendarYear: input.calendarYear,
    reference: await nextReference(tenant, input.calendarYear),
    title: input.title.trim(),
    overview: input.overview?.trim() || undefined,
    status: "DRAFT",
    items: input.items.map((item) => ({
      title: item.title.trim(),
      description: item.description?.trim() || undefined,
      kpiLabel: item.kpiLabel.trim(),
      plannedPeriod: item.plannedPeriod?.trim() || undefined,
      dueDate: item.dueDate || undefined,
      status: "TODO",
      kpiLocked: false,
      reviewStatus: "NOT_SUBMITTED",
    })),
    createdByUserId: actor.userId,
    lastUpdatedByUserId: actor.userId,
  });

  updateProgress(roadmap);
  await roadmap.save();

  await activity({
    tenant,
    roadmap,
    actor,
    action: "CREATED",
    summary: "Feuille de route personnelle créée.",
  });

  return serializeRoadmap(roadmap, actor);
}

export async function updateRoadmap(
  tenant: TenantDocument,
  actor: RoadmapActor,
  id: string,
  input: UpdateRoadmapInput,
): Promise<PublicRoadmap> {
  const roadmap = await getRoadmapOrThrow(tenant, id);
  assertCanManageRoadmap(actor, roadmap);

  if (!["DRAFT", "RETURNED"].includes(roadmap.status)) {
    throw new AppError("Seule une feuille de route en brouillon ou retournée peut être modifiée.", 400, "ROADMAP_UPDATE_STATUS_FORBIDDEN");
  }

  if (input.title !== undefined) roadmap.title = input.title.trim();
  if (input.overview !== undefined) roadmap.overview = input.overview?.trim() || undefined;

  if (input.items) {
    roadmap.items = input.items.map((item) => ({
      _id: new Types.ObjectId(),
      title: item.title.trim(),
      description: item.description?.trim() || undefined,
      kpiLabel: item.kpiLabel.trim(),
      plannedPeriod: item.plannedPeriod?.trim() || undefined,
      dueDate: item.dueDate || undefined,
      status: "TODO",
      kpiLocked: false,
      reviewStatus: "NOT_SUBMITTED",
    })) as any;
  }

  roadmap.lastUpdatedByUserId = actor.userId;
  updateProgress(roadmap);
  await roadmap.save();

  await activity({ tenant, roadmap, actor, action: "UPDATED", summary: "Feuille de route mise à jour." });
  return serializeRoadmap(roadmap, actor);
}

export async function submitRoadmap(
  tenant: TenantDocument,
  actor: RoadmapActor,
  id: string,
): Promise<PublicRoadmap> {
  const roadmap = await getRoadmapOrThrow(tenant, id);
  assertCanManageRoadmap(actor, roadmap);

  if (!["DRAFT", "RETURNED"].includes(roadmap.status)) {
    throw new AppError("Cette feuille de route ne peut plus être soumise.", 400, "ROADMAP_SUBMIT_STATUS_FORBIDDEN");
  }

  if (!roadmap.items.length) {
    throw new AppError("Ajoutez au moins une ligne de feuille de route.", 400, "ROADMAP_ITEMS_REQUIRED");
  }

  clearApprovalState(roadmap);
  roadmap.status = "SUBMITTED";
  roadmap.submittedAt = new Date();
  roadmap.managerComment = getApprovalSummary(roadmap);
  roadmap.lastUpdatedByUserId = actor.userId;
  await roadmap.save();

  await activity({
    tenant,
    roadmap,
    actor,
    action: "SUBMITTED",
    summary: "Feuille de route soumise pour validation.",
    metadata: { requiredApprovals: getRequiredApprovalTypes(roadmap) },
  });

  return serializeRoadmap(roadmap, actor);
}

export async function approveRoadmap(
  tenant: TenantDocument,
  actor: RoadmapActor,
  id: string,
  input: ReviewRoadmapInput,
): Promise<PublicRoadmap> {
  const roadmap = await getRoadmapOrThrow(tenant, id);
  const approvalType = assertCanReviewRoadmap(actor, roadmap);

  if (!["SUBMITTED", "PARTIALLY_APPROVED"].includes(roadmap.status)) {
    throw new AppError("Seule une feuille de route soumise ou partiellement validée peut être validée.", 400, "ROADMAP_APPROVE_STATUS_FORBIDDEN");
  }

  if (approvalType === "DEPARTMENT" && roadmap.departmentReview) {
    throw new AppError("La validation hiérarchique a déjà été enregistrée.", 409, "ROADMAP_DEPARTMENT_ALREADY_APPROVED");
  }

  if (approvalType === "RH" && roadmap.hrReview) {
    throw new AppError("La validation RH a déjà été enregistrée.", 409, "ROADMAP_RH_ALREADY_APPROVED");
  }

  const review = {
    reviewedByUserId: actor.userId,
    reviewedByName: actor.fullName,
    reviewType: approvalType,
    comment: input.comment?.trim() || undefined,
    reviewedAt: new Date(),
  } satisfies RoadmapApprovalReview;

  if (approvalType === "DEPARTMENT") {
    roadmap.departmentReview = review;
  } else {
    roadmap.hrReview = review;
  }

  const nextStatus = getApprovalStatus(roadmap);
  roadmap.status = nextStatus;
  roadmap.managerComment = input.comment?.trim() || getApprovalSummary(roadmap);
  roadmap.lastUpdatedByUserId = actor.userId;

  if (nextStatus === "APPROVED") {
    roadmap.approvedAt = new Date();
  }

  await roadmap.save();

  await activity({
    tenant,
    roadmap,
    actor,
    action: approvalType === "DEPARTMENT" ? "DEPARTMENT_APPROVED" : "RH_APPROVED",
    summary: approvalType === "DEPARTMENT" ? "Validation hiérarchique enregistrée." : "Validation RH enregistrée.",
    metadata: { comment: input.comment?.trim() || undefined, status: roadmap.status },
  });

  if (nextStatus === "APPROVED") {
    await activity({ tenant, roadmap, actor, action: "APPROVED", summary: "Feuille de route définitivement validée." });
  }

  return serializeRoadmap(roadmap, actor);
}

export async function returnRoadmap(
  tenant: TenantDocument,
  actor: RoadmapActor,
  id: string,
  input: ReviewRoadmapInput,
): Promise<PublicRoadmap> {
  const roadmap = await getRoadmapOrThrow(tenant, id);
  assertCanReviewRoadmap(actor, roadmap);

  if (!["SUBMITTED", "PARTIALLY_APPROVED"].includes(roadmap.status)) {
    throw new AppError("Seule une feuille de route en validation peut être retournée.", 400, "ROADMAP_RETURN_STATUS_FORBIDDEN");
  }

  roadmap.status = "RETURNED";
  roadmap.returnedAt = new Date();
  roadmap.managerComment = input.comment?.trim() || "Feuille de route retournée pour correction.";
  roadmap.lastUpdatedByUserId = actor.userId;
  await roadmap.save();

  await activity({
    tenant,
    roadmap,
    actor,
    action: "RETURNED",
    summary: "Feuille de route retournée à l'Agent.",
    metadata: { comment: roadmap.managerComment },
  });

  return serializeRoadmap(roadmap, actor);
}

export async function closeRoadmap(
  tenant: TenantDocument,
  actor: RoadmapActor,
  id: string,
): Promise<PublicRoadmap> {
  const roadmap = await getRoadmapOrThrow(
    tenant,
    id,
  );

  assertCanReadRoadmap(
    actor,
    roadmap,
  );

  if (!canCloseRoadmap(actor)) {
    throw new AppError(
      "Seul l'administrateur peut clôturer définitivement une feuille de route.",
      403,
      "ROADMAP_CLOSE_ADMIN_ONLY",
    );
  }

  if (roadmap.status !== "APPROVED") {
    throw new AppError(
      "Seule une feuille de route validée peut être clôturée.",
      400,
      "ROADMAP_CLOSE_STATUS_FORBIDDEN",
    );
  }

  const pendingItem = roadmap.items.find(
    (item: any) =>
      item.reviewStatus !== "VALIDATED",
  );

  if (pendingItem) {
    throw new AppError(
      "La feuille ne peut pas être clôturée tant que toutes les missions n'ont pas un KPI validé.",
      400,
      "ROADMAP_CLOSE_KPI_PENDING",
    );
  }

  roadmap.status = "CLOSED";
  roadmap.closedAt = new Date();
  roadmap.lastUpdatedByUserId =
    actor.userId;

  await roadmap.save();

  await activity({
    tenant,
    roadmap,
    actor,
    action: "CLOSED",
    summary:
      "Feuille de route clôturée après validation de l'ensemble des KPI.",
  });

  return serializeRoadmap(
    roadmap,
    actor,
  );
}

export async function deleteRoadmap(
  tenant: TenantDocument,
  actor: RoadmapActor,
  id: string,
): Promise<{ deleted: true; id: string }> {
  assertCanDeleteRoadmap(actor);

  const roadmap = await getRoadmapOrThrow(tenant, id, true);
  const filePaths = collectKpiStoragePaths(roadmap);
  const deletedId = roadmap.id;

  await RoadmapActivityModel.deleteMany({
    tenantId: tenant._id,
    roadmapId: roadmap._id,
  }).exec();

  await roadmap.deleteOne();

  removeKpiFilesQuietly(filePaths);

  return {
    deleted: true,
    id: deletedId,
  };
}

export async function listRoadmaps(
  tenant: TenantDocument,
  actor: RoadmapActor,
  query: ListRoadmapsQuery,
): Promise<{ items: PublicRoadmap[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const filter: Record<string, any> = { tenantId: tenant._id, ...getRoadmapScopeFilter(actor) };

  if (query.status) filter.status = query.status;
  if (query.calendarYear) filter.calendarYear = query.calendarYear;
  if (query.search) {
    filter.$or = [
      { title: new RegExp(escapeRegex(query.search), "i") },
      { reference: new RegExp(escapeRegex(query.search), "i") },
      { "items.title": new RegExp(escapeRegex(query.search), "i") },
    ];
  }

  const sortMap: Record<string, Record<string, SortOrder>> = {
    UPDATED_DESC: { updatedAt: -1 },
    CREATED_DESC: { createdAt: -1 },
    PROGRESS_ASC: { progressPercentage: 1 },
    PROGRESS_DESC: { progressPercentage: -1 },
  };

  const selectedSort = sortMap[query.sort] ?? sortMap.UPDATED_DESC;

  const skip = (query.page - 1) * query.limit;

  const [records, total] = await Promise.all([
    RoadmapModel.find(filter).sort(selectedSort).skip(skip).limit(query.limit).exec(),
    RoadmapModel.countDocuments(filter).exec(),
  ]);

  return {
    items: records.map((record) => serializeRoadmap(record, actor)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getRoadmapById(
  tenant: TenantDocument,
  actor: RoadmapActor,
  id: string,
): Promise<PublicRoadmap> {
  const roadmap = await getRoadmapOrThrow(tenant, id);
  assertCanReadRoadmap(actor, roadmap);
  return serializeRoadmap(roadmap, actor);
}

export async function getRoadmapStats(
  tenant: TenantDocument,
  actor: RoadmapActor,
): Promise<{ total: number; draft: number; submitted: number; partiallyApproved: number; approved: number; returned: number; closed: number; averageProgress: number }> {
  const base = { tenantId: tenant._id, ...getRoadmapScopeFilter(actor) };

  const [rows, aggregate] = await Promise.all([
    RoadmapModel.aggregate<{ _id: string; count: number }>([
      { $match: base },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).exec(),
    RoadmapModel.aggregate<{ total: number; averageProgress: number }>([
      { $match: base },
      { $group: { _id: null, total: { $sum: 1 }, averageProgress: { $avg: "$progressPercentage" } } },
    ]).exec(),
  ]);

  const result = {
    total: aggregate[0]?.total ?? 0,
    draft: 0,
    submitted: 0,
    partiallyApproved: 0,
    approved: 0,
    returned: 0,
    closed: 0,
    averageProgress: Math.round(aggregate[0]?.averageProgress ?? 0),
  };

  rows.forEach((row) => {
    if (row._id === "PARTIALLY_APPROVED") {
      result.partiallyApproved = row.count;
      return;
    }

    (result as any)[row._id.toLowerCase()] = row.count;
  });

  return result;
}

export async function submitItemKpi(
  tenant: TenantDocument,
  actor: RoadmapActor,
  roadmapId: string,
  itemId: string,
  input: SubmitKpiInput,
  file?: Express.Multer.File,
): Promise<PublicRoadmap> {
  const roadmap =
    await getRoadmapOrThrow(
      tenant,
      roadmapId,
      true,
    );

  assertCanReadRoadmap(
    actor,
    roadmap,
  );

  if (
    !isRoadmapCreator(
      actor,
      roadmap,
    )
  ) {
    throw new AppError(
      "Seul le propriétaire de la feuille de route peut renseigner ou corriger ses propres réalisations KPI.",
      403,
      "ROADMAP_KPI_CREATOR_ONLY",
    );
  }

  if (roadmap.status !== "APPROVED") {
    throw new AppError(
      "Les réalisations KPI peuvent être renseignées seulement après validation de la feuille de route.",
      400,
      "ROADMAP_KPI_AFTER_APPROVAL_ONLY",
    );
  }

  const item =
    getRoadmapItemOrThrow(
      roadmap,
      itemId,
    );

  if (
    item.reviewStatus ===
    "VALIDATED"
  ) {
    throw new AppError(
      "Cette mission et son KPI ont été validés. Ils sont désormais verrouillés.",
      403,
      "ROADMAP_KPI_VALIDATED_LOCKED",
    );
  }

  if (
    item.reviewStatus ===
    "PENDING_REVIEW"
  ) {
    throw new AppError(
      "Ce KPI est en attente de validation hiérarchique. Il ne peut pas être modifié tant que le responsable n'a pas demandé une discussion.",
      409,
      "ROADMAP_KPI_REVIEW_PENDING",
    );
  }

  if (
    item.kpiLocked &&
    item.reviewStatus !==
      "NEEDS_DISCUSSION"
  ) {
    throw new AppError(
      "Ce KPI est verrouillé.",
      403,
      "ROADMAP_KPI_LOCKED",
    );
  }

  const hasExistingProof =
    Boolean(item.kpiText) ||
    Boolean(item.kpiFile);

  if (
    !input.kpiText?.trim() &&
    !file &&
    !hasExistingProof
  ) {
    throw new AppError(
      "Ajoutez un commentaire de réalisation ou une pièce justificative avant de soumettre le KPI.",
      400,
      "ROADMAP_KPI_PROOF_REQUIRED",
    );
  }

  const wasDiscussionRequested =
    item.reviewStatus ===
    "NEEDS_DISCUSSION";

  const previousFilePath =
    file &&
    item.kpiFile?.storagePath
      ? item.kpiFile.storagePath
      : undefined;

  const now = new Date();

  item.status = "DONE";
  item.completedAt = now;
  item.completedByUserId =
    actor.userId;

  if (input.kpiText?.trim()) {
    item.kpiText =
      input.kpiText.trim();
  }

  if (file) {
    item.kpiFile = {
      originalFileName:
        file.originalname,
      storedFileName:
        file.filename,
      storagePath: file.path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedAt: now,
      uploadedByUserId:
        actor.userId,
    } satisfies RoadmapKpiFile;
  }

  item.kpiSubmittedAt = now;
  item.kpiSubmittedByUserId =
    actor.userId;
  item.kpiLocked = true;
  item.reviewStatus =
    "PENDING_REVIEW";
  item.review = undefined;

  roadmap.lastUpdatedByUserId =
    actor.userId;

  updateProgress(roadmap);

  await roadmap.save();

  if (
    previousFilePath &&
    previousFilePath !== file?.path
  ) {
    removeKpiFilesQuietly([
      previousFilePath,
    ]);
  }

  await activity({
    tenant,
    roadmap,
    actor,
    action: "ITEM_COMPLETED",
    summary:
      `Réalisation soumise par le propriétaire : ${item.title}.`,
    metadata: {
      itemId,
      hasFile: Boolean(
        item.kpiFile,
      ),
      hasText: Boolean(
        item.kpiText,
      ),
      resubmission:
        wasDiscussionRequested,
    },
  });

  return serializeRoadmap(
    roadmap,
    actor,
  );
}

export async function reviewItemKpi(
  tenant: TenantDocument,
  actor: RoadmapActor,
  roadmapId: string,
  itemId: string,
  input: ReviewItemKpiInput,
): Promise<PublicRoadmap> {
  const roadmap =
    await getRoadmapOrThrow(
      tenant,
      roadmapId,
    );

  assertCanReviewKpi(
    actor,
    roadmap,
  );

  const item =
    getRoadmapItemOrThrow(
      roadmap,
      itemId,
    );

  if (
    item.reviewStatus !==
    "PENDING_REVIEW"
  ) {
    throw new AppError(
      "Seul un KPI en attente de validation peut être contrôlé.",
      400,
      "ROADMAP_KPI_NOT_PENDING_REVIEW",
    );
  }

  const now = new Date();

  item.reviewStatus =
    input.decision;

  item.review = {
    reviewedByUserId:
      actor.userId,
    reviewedByName:
      actor.fullName,
    status:
      input.decision,
    comment:
      input.comment?.trim() ||
      undefined,
    reviewedAt: now,
  };

  if (
    input.decision ===
    "VALIDATED"
  ) {
    item.kpiLocked = true;
    item.status = "DONE";
  } else {
    /**
     * "À discuter" rouvre uniquement cette mission pour son propriétaire.
     * Les preuves précédentes restent visibles pour la traçabilité,
     * mais le propriétaire peut les corriger / remplacer.
     */
    item.kpiLocked = false;
    item.status = "TODO";
    item.completedAt = undefined;
    item.completedByUserId =
      undefined;
  }

  roadmap.lastUpdatedByUserId =
    actor.userId;

  updateProgress(roadmap);

  await roadmap.save();

  await activity({
    tenant,
    roadmap,
    actor,
    action: "KPI_REVIEWED",
    summary:
      input.decision ===
      "VALIDATED"
        ? `Mission / KPI validé : ${item.title}.`
        : `Discussion demandée sur la mission / KPI : ${item.title}.`,
    metadata: {
      itemId,
      comment:
        input.comment,
      decision:
        input.decision,
    },
  });

  return serializeRoadmap(
    roadmap,
    actor,
  );
}

export async function getKpiFile(
  tenant: TenantDocument,
  actor: RoadmapActor,
  roadmapId: string,
  itemId: string,
): Promise<{ path: string; originalName: string; mimeType: string }> {
  const roadmap = await getRoadmapOrThrow(tenant, roadmapId, true);
  assertCanReadRoadmap(actor, roadmap);

  const item = getRoadmapItemOrThrow(roadmap, itemId);
  if (!item?.kpiFile?.storagePath) throw new AppError("Aucune pièce KPI n'est disponible.", 404, "ROADMAP_KPI_FILE_NOT_FOUND");
  if (!fs.existsSync(item.kpiFile.storagePath)) throw new AppError("Le fichier KPI est introuvable sur le serveur.", 404, "ROADMAP_KPI_FILE_MISSING");

  return { path: item.kpiFile.storagePath, originalName: item.kpiFile.originalFileName, mimeType: item.kpiFile.mimeType };
}

export async function listRoadmapActivities(
  tenant: TenantDocument,
  actor: RoadmapActor,
  roadmapId: string,
  limit: number,
): Promise<PublicRoadmapActivity[]> {
  const roadmap = await getRoadmapOrThrow(tenant, roadmapId);
  assertCanReadRoadmap(actor, roadmap);

  const records = await RoadmapActivityModel.find({ tenantId: tenant._id, roadmapId: roadmap._id }).sort({ createdAt: -1 }).limit(limit).exec();

  return records.map((record) => ({
    id: record.id,
    roadmapId: record.roadmapId.toString(),
    agentId: record.agentId.toString(),
    actorUserId: record.actorUserId.toString(),
    actorName: record.actorName,
    action: record.action,
    summary: record.summary,
    metadata: record.metadata,
    createdAt: record.createdAt?.toISOString(),
  }));
}
 