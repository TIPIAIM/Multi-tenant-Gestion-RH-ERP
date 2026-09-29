import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "../users/user.model.js";
import { AgentModel } from "../agents/agent.model.js";
import { TaskModel } from "../tasks/task.models.js";
import { OrganizationUnitModel } from "./organization.model.js";
import type {
  CreateOrganizationUnitInput,
  UpdateOrganizationUnitInput,
} from "./organization.schema.js";
import type {
  OrganizationTreeDirection,
  OrganizationUnitDocument,
  PublicOrganizationUnit,
} from "./organization.types.js";

function serializeOrganizationUnit(
  unit: OrganizationUnitDocument,
): PublicOrganizationUnit {
  const timestampedUnit = unit as OrganizationUnitDocument & {
    createdAt?: Date;
    updatedAt?: Date;
  };

  return {
    id: unit.id,
    tenantId: unit.tenantId.toString(),
    name: unit.name,
    code: unit.code,
    type: unit.type,
    parentId: unit.parentId ? unit.parentId.toString() : null,
    managerUserId: unit.managerUserId ? unit.managerUserId.toString() : null,
    description: unit.description,
    status: unit.status,
    sortOrder: unit.sortOrder,
    createdAt: timestampedUnit.createdAt?.toISOString(),
    updatedAt: timestampedUnit.updatedAt?.toISOString(),
  };
}

async function ensureManagerBelongsToTenant(
  tenant: TenantDocument,
  managerUserId?: string | null
): Promise<void> {
  if (!managerUserId) {
    return;
  }

  const managerExists = await (UserModel as any).exists({
    _id: managerUserId,
    tenantId: tenant._id,
    isActive: true,
  });

  if (!managerExists) {
    throw new AppError(
      "Le responsable sélectionné est introuvable ou inactif dans cette organisation.",
      400,
      "ORG_MANAGER_NOT_FOUND"
    );
  }
}

async function ensureParentDirection(
  tenant: TenantDocument,
  parentId?: string | null
): Promise<void> {
  if (!parentId) {
    throw new AppError(
      "Un Service doit être rattaché à une Direction.",
      400,
      "ORG_PARENT_REQUIRED"
    );
  }

  const parentDirection = await OrganizationUnitModel.findOne({
    _id: parentId,
    tenantId: tenant._id,
    type: "DIRECTION",
    status: "ACTIVE",
  }).exec();

  if (!parentDirection) {
    throw new AppError(
      "La Direction parente est introuvable ou inactive.",
      400,
      "ORG_PARENT_DIRECTION_NOT_FOUND"
    );
  }
}

export async function listOrganizationUnits(
  tenant: TenantDocument
): Promise<PublicOrganizationUnit[]> {
  const units = await OrganizationUnitModel.find({
    tenantId: tenant._id,
  })
    .sort({
      type: 1,
      sortOrder: 1,
      name: 1,
    })
    .exec();

  return units.map(serializeOrganizationUnit);
}

export async function getOrganizationTree(
  tenant: TenantDocument
): Promise<OrganizationTreeDirection[]> {
  const units = await OrganizationUnitModel.find({
    tenantId: tenant._id,
  })
    .sort({
      sortOrder: 1,
      name: 1,
    })
    .exec();

  const publicUnits = units.map(serializeOrganizationUnit);

  const servicesByDirection = new Map<string, PublicOrganizationUnit[]>();

  publicUnits
    .filter((unit) => unit.type === "SERVICE")
    .forEach((service) => {
      if (!service.parentId) {
        return;
      }

      const services = servicesByDirection.get(service.parentId) ?? [];

      services.push(service);

      servicesByDirection.set(service.parentId, services);
    });

  return publicUnits
    .filter((unit) => unit.type === "DIRECTION")
    .map((direction) => ({
      ...direction,
      services: servicesByDirection.get(direction.id) ?? [],
    }));
}

export async function createOrganizationUnit(
  tenant: TenantDocument,
  input: CreateOrganizationUnitInput
): Promise<PublicOrganizationUnit> {
  await ensureManagerBelongsToTenant(tenant, input.managerUserId);

  if (input.type === "SERVICE") {
    await ensureParentDirection(tenant, input.parentId);
  }

  const organizationUnit = await OrganizationUnitModel.create({
    tenantId: tenant._id,
    name: input.name,
    code: input.code,
    type: input.type,

    parentId:
      input.type === "SERVICE" && input.parentId
        ? new Types.ObjectId(input.parentId)
        : null,

    managerUserId: input.managerUserId
      ? new Types.ObjectId(input.managerUserId)
      : null,

    description: input.description,
    status: input.status,
    sortOrder: input.sortOrder,
  });

  return serializeOrganizationUnit(organizationUnit);
}

export async function updateOrganizationUnit(
  tenant: TenantDocument,
  unitId: string,
  input: UpdateOrganizationUnitInput
): Promise<PublicOrganizationUnit> {
  const unit = await OrganizationUnitModel.findOne({
    _id: unitId,
    tenantId: tenant._id,
  }).exec();

  if (!unit) {
    throw new AppError(
      "La structure demandée est introuvable.",
      404,
      "ORG_UNIT_NOT_FOUND"
    );
  }

  if (input.managerUserId !== undefined) {
    await ensureManagerBelongsToTenant(tenant, input.managerUserId);

    unit.managerUserId = input.managerUserId
      ? new Types.ObjectId(input.managerUserId)
      : null;
  }

  if (input.status === "INACTIVE" && unit.type === "DIRECTION") {
    const activeServicesExist = await OrganizationUnitModel.exists({
      tenantId: tenant._id,
      parentId: unit._id,
      type: "SERVICE",
      status: "ACTIVE",
    });

    if (activeServicesExist) {
      throw new AppError(
        "Désactivez d'abord les Services actifs rattachés à cette Direction.",
        409,
        "ORG_DIRECTION_HAS_ACTIVE_SERVICES"
      );
    }
  }

  if (input.name !== undefined) {
    unit.name = input.name;
  }

  if (input.code !== undefined) {
    unit.code = input.code;
  }

  if (input.description !== undefined) {
    unit.description = input.description;
  }

  if (input.status !== undefined) {
    unit.status = input.status;
  }

  if (input.sortOrder !== undefined) {
    unit.sortOrder = input.sortOrder;
  }

  await unit.save();

  return serializeOrganizationUnit(unit);
}

export async function deleteOrganizationUnit(
  tenant: TenantDocument,
  unitId: string,
): Promise<{
  deletedUnitId: string;
  deletedUnitType: "DIRECTION" | "SERVICE";
  deletedUnitsCount: number;
  deletedServiceIds: string[];
}> {
  const unit = await OrganizationUnitModel.findOne({
    _id: unitId,
    tenantId: tenant._id,
  }).exec();

  if (!unit) {
    throw new AppError(
      "La structure demandée est introuvable.",
      404,
      "ORG_UNIT_NOT_FOUND",
    );
  }

  const unitObjectId = unit._id as Types.ObjectId;
  const unitType = unit.type;

  const serviceIds =
    unitType === "DIRECTION"
      ? (
          await OrganizationUnitModel.find({
            tenantId: tenant._id,
            parentId: unitObjectId,
            type: "SERVICE",
          })
            .select("_id")
            .exec()
        ).map((service) => service._id as Types.ObjectId)
      : [];

  const agentScopeConditions =
    unitType === "DIRECTION"
      ? [
          {
            directionId: unitObjectId,
          },
          ...(serviceIds.length > 0
            ? [
                {
                  serviceId: {
                    $in: serviceIds,
                  },
                },
              ]
            : []),
        ]
      : [
          {
            serviceId: unitObjectId,
          },
        ];

  const linkedAgentExists = await AgentModel.exists({
    tenantId: tenant._id,
    $or: agentScopeConditions,
  });

  if (linkedAgentExists) {
    throw new AppError(
      "Impossible de supprimer cette structure : des Agents y sont encore rattachés. Détachez ou réaffectez les Agents avant suppression.",
      409,
      "ORG_UNIT_HAS_LINKED_AGENTS",
    );
  }

  const taskScopeConditions =
    unitType === "DIRECTION"
      ? [
          {
            directionId: unitObjectId,
          },
          ...(serviceIds.length > 0
            ? [
                {
                  serviceId: {
                    $in: serviceIds,
                  },
                },
              ]
            : []),
        ]
      : [
          {
            serviceId: unitObjectId,
          },
        ];

  const linkedTaskExists = await TaskModel.exists({
    tenantId: tenant._id,
    $or: taskScopeConditions,
  });

  if (linkedTaskExists) {
    throw new AppError(
      "Impossible de supprimer cette structure : des Tâches y sont encore rattachées. Réaffectez ou archivez les Tâches avant suppression.",
      409,
      "ORG_UNIT_HAS_LINKED_TASKS",
    );
  }

  let deletedServicesCount = 0;

  if (unitType === "DIRECTION") {
    const deleteServicesResult = await OrganizationUnitModel.deleteMany({
      tenantId: tenant._id,
      parentId: unitObjectId,
      type: "SERVICE",
    }).exec();

    deletedServicesCount = deleteServicesResult.deletedCount ?? 0;
  }

  await OrganizationUnitModel.deleteOne({
    _id: unitObjectId,
    tenantId: tenant._id,
  }).exec();

  return {
    deletedUnitId: unitObjectId.toString(),
    deletedUnitType: unitType,
    deletedUnitsCount: deletedServicesCount + 1,
    deletedServiceIds: serviceIds.map((id) => id.toString()),
  };
}
