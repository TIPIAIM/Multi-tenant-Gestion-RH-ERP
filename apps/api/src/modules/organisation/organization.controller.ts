import type {
    NextFunction,
    Request,
    Response,
  } from "express";
  import { AppError } from "../../core/errors/app-error.js";
  import {
    createOrganizationUnitSchema,
    organizationUnitIdParamsSchema,
    updateOrganizationUnitSchema,
  } from "./organization.schema.js";
  import { UserModel } from "../users/user.model.js";
  import {
    createOrganizationUnit,
    deleteOrganizationUnit,
    getOrganizationTree,
    listOrganizationUnits,
    updateOrganizationUnit,
  } from "./organization.service.js";
  
  function getTenantOrThrow(request: Request) {
    if (!request.tenant) {
      throw new AppError(
        "Le contexte organisationnel est introuvable.",
        500,
        "TENANT_CONTEXT_MISSING",
      );
    }
  
    return request.tenant;
  }

  function getAuthenticatedUserIdOrThrow(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError(
        "Authentification requise.",
        401,
        "AUTH_REQUIRED",
      );
    }

    return request.auth.userId;
  }

  async function assertCanDeleteOrganizationUnit(
    request: Request,
  ): Promise<void> {
    const tenant = getTenantOrThrow(request);
    const userId = getAuthenticatedUserIdOrThrow(request);

    const user = await (UserModel as any).findOne({
      _id: userId,
      tenantId: tenant._id,
      isActive: true,
    })
      .select("role")
      .lean()
      .exec();

    const role = (user as { role?: string } | null)?.role;

    if (role !== "TENANT_ADMIN" && role !== "RH_MANAGER") {
      throw new AppError(
        "Seuls l'Administrateur et le RH peuvent supprimer une structure organisationnelle.",
        403,
        "ORG_DELETE_FORBIDDEN",
      );
    }
  }

  export async function listOrganizationUnitsController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenant = getTenantOrThrow(request);
  
      const units = await listOrganizationUnits(tenant);
  
      response.status(200).json({
        success: true,
        data: {
          units,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function getOrganizationTreeController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenant = getTenantOrThrow(request);
  
      const tree = await getOrganizationTree(tenant);
  
      response.status(200).json({
        success: true,
        data: {
          tree,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function createOrganizationUnitController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenant = getTenantOrThrow(request);
  
      const input = createOrganizationUnitSchema.parse(
        request.body,
      );
  
      const unit = await createOrganizationUnit(tenant, input);
  
      response.status(201).json({
        success: true,
        data: {
          unit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function updateOrganizationUnitController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenant = getTenantOrThrow(request);
  
      const { id } = organizationUnitIdParamsSchema.parse(
        request.params,
      );
  
      const input = updateOrganizationUnitSchema.parse(
        request.body,
      );
  
      const unit = await updateOrganizationUnit(
        tenant,
        id,
        input,
      );
  
      response.status(200).json({
        success: true,
        data: {
          unit,
        },
      });
    } catch (error) {
      next(error);
    }
  }

export async function deleteOrganizationUnitController(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenant = getTenantOrThrow(request);

      await assertCanDeleteOrganizationUnit(request);

      const { id } = organizationUnitIdParamsSchema.parse(
        request.params,
      );

      const result = await deleteOrganizationUnit(tenant, id);

      response.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
