import type { HydratedDocument } from "mongoose";

export const tenantStatuses = [
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export type TenantStatus = (typeof tenantStatuses)[number];

export type TenantBranding = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl?: string;
};

export interface Tenant {
  name: string;
  legalName: string;
  slug: string;
  status: TenantStatus;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  branding: TenantBranding;
}

export type TenantDocument = HydratedDocument<Tenant>;

export type PublicTenant = {
  id: string;
  name: string;
  legalName: string;
  slug: string;
  status: TenantStatus;
  branding: TenantBranding;
};