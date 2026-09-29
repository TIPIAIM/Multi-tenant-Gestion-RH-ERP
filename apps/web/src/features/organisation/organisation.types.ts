export type OrganizationUnitType = "DIRECTION" | "SERVICE";

export type OrganizationUnitStatus = "ACTIVE" | "INACTIVE";

export type OrganizationUnit = {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  type: OrganizationUnitType;
  parentId: string | null;
  managerUserId: string | null;
  description?: string;
  status: OrganizationUnitStatus;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type OrganizationTreeDirection = OrganizationUnit & {
  services: OrganizationUnit[];
};

export type CreateOrganizationUnitInput = {
  name: string;
  code: string;
  type: OrganizationUnitType;
  parentId?: string | null;
  description?: string;
  status?: OrganizationUnitStatus;
  sortOrder?: number;
};

export type UpdateOrganizationUnitInput = {
  name?: string;
  code?: string;
  description?: string;
  status?: OrganizationUnitStatus;
  sortOrder?: number;
};

export type DeleteOrganizationUnitResult = {
  deletedUnitId: string;
  deletedUnitType: OrganizationUnitType;
  deletedUnitsCount: number;
  deletedServiceIds: string[];
};
