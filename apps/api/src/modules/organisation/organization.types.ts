import type {
    HydratedDocument,
    Types,
  } from "mongoose";
  
  export const organizationUnitTypes = [
    "DIRECTION",
    "SERVICE",
  ] as const;
  
  export const organizationUnitStatuses = [
    "ACTIVE",
    "INACTIVE",
  ] as const;
  
  export type OrganizationUnitType =
    (typeof organizationUnitTypes)[number];
  
  export type OrganizationUnitStatus =
    (typeof organizationUnitStatuses)[number];
  
  export interface OrganizationUnit {
    tenantId: Types.ObjectId;
    name: string;
    code: string;
    type: OrganizationUnitType;
    parentId: Types.ObjectId | null;
    managerUserId: Types.ObjectId | null;
    description?: string;
    status: OrganizationUnitStatus;
    sortOrder: number;
  }
  
  export type OrganizationUnitDocument =
    HydratedDocument<OrganizationUnit>;
  
  export type PublicOrganizationUnit = {
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
  
  export type OrganizationTreeDirection =
    PublicOrganizationUnit & {
      services: PublicOrganizationUnit[];
    };