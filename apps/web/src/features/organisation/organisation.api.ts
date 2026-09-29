import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  CreateOrganizationUnitInput,
  OrganizationTreeDirection,
  DeleteOrganizationUnitResult,
  OrganizationUnit,
  UpdateOrganizationUnitInput,
} from "./organisation.types";

type OrganizationTreeResponse = {
  tree: OrganizationTreeDirection[];
};

type OrganizationUnitResponse = {
  unit: OrganizationUnit;
};

export async function getOrganizationTree(): Promise<
  OrganizationTreeDirection[]
> {
  const response = await api.get<ApiSuccess<OrganizationTreeResponse>>(
    "/organisation/tree",
  );

  return response.data.data.tree;
}

export async function createOrganizationUnit(
  input: CreateOrganizationUnitInput,
): Promise<OrganizationUnit> {
  const response = await api.post<ApiSuccess<OrganizationUnitResponse>>(
    "/organisation",
    input,
  );

  return response.data.data.unit;
}

export async function updateOrganizationUnit(
  unitId: string,
  input: UpdateOrganizationUnitInput,
): Promise<OrganizationUnit> {
  const response = await api.patch<ApiSuccess<OrganizationUnitResponse>>(
    `/organisation/${unitId}`,
    input,
  );
  return response.data.data.unit;
}

export async function deleteOrganizationUnit(
  unitId: string,
): Promise<DeleteOrganizationUnitResult> {
  const response = await api.delete<
    ApiSuccess<DeleteOrganizationUnitResult>
  >(`/organisation/${unitId}`);

  return response.data.data;
}
