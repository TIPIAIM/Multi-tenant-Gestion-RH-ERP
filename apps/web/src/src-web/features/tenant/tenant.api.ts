import { api } from "../../lib/api";

export type PublicTenant = {
  id: string;
  name: string;
  legalName: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  branding: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    logoUrl?: string;
  };
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
};

export async function getCurrentTenant(): Promise<PublicTenant> {
  const response = await api.get<ApiResponse<PublicTenant>>(
    "/tenants/current",
  );

  return response.data.data;
}