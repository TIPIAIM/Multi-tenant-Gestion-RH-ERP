import axios from "axios";
import { api } from "../../lib/api";
export type Payroll = {
  id: string;
  agentId: string;
  agentName: string;
  matricule: string;
  period: string;
  currency: string;
  minorUnitDigits: number;
  base: number;
  bonus: number;
  deductions: number;
  employeeRate: number;
  employerRate: number;
  taxRate: number;
  gross: number;
  employeeContribution: number;
  employerContribution: number;
  tax: number;
  net: number;
  employerCost: number;
  rulesNote: string;
  note: string;
  revision: number;
  includeStamp?: boolean;
  includeSignature?: boolean;
  status: "DRAFT" | "APPROVED" | "PAID" | "CANCELLED";
  paymentReference?: string;
  approvedAt?: string;
  paidAt?: string;
};
export type PayrollInput = Pick<
  Payroll,
  | "agentId"
  | "period"
  | "currency"
  | "base"
  | "bonus"
  | "deductions"
  | "employeeRate"
  | "employerRate"
  | "taxRate"
  | "rulesNote"
  | "note"
>;
export type PayrollSortField =
  "agentName" | "matricule" | "period" | "gross" | "net" | "paidAt";
export type PayrollListFilters = {
  search: string;
  status: "" | Payroll["status"];
  currency: string;
  sortBy: PayrollSortField;
  sortOrder: "asc" | "desc";
  limit: 20 | 50 | 100;
};
export type PayrollListResult = {
  items: Payroll[];
  total: number;
  page: number;
  limit: number;
  listVersion: "payroll-table-1";
};
export async function listPayroll(
  period: string,
  page: number,
  options?: PayrollListFilters,
  signal?: AbortSignal,
): Promise<PayrollListResult> {
  const result = (
    await api.get<{ data: PayrollListResult }>("/payroll", {
      params: { ...options, period: period || undefined, page },
      signal,
    })
  ).data.data;
  if (options && result.listVersion !== "payroll-table-1")
    throw new Error(
      "Le service de paie nécessite une mise à jour. Contactez le support de la plateforme.",
    );
  return result;
}
export async function searchPayrollAgents(search: string) {
  return (
    await api.get<{
      data: { items: { id: string; fullName: string; matricule: string }[] };
    }>("/payroll/agents", { params: { search } })
  ).data.data.items;
}
export async function savePayroll(input: PayrollInput, existing?: Payroll) {
  if (existing) {
    const {
      agentId: _agentId,
      period: _period,
      currency: _currency,
      ...fields
    } = input;
    return api.patch(`/payroll/${existing.id}`, {
      ...fields,
      revision: existing.revision,
    });
  }
  return api.post("/payroll", input);
}
export async function transitionPayroll(
  row: Payroll,
  action: "APPROVE" | "PAY" | "CANCEL",
  paymentReference?: string,
) {
  return api.post(`/payroll/${row.id}/transition`, {
    action,
    revision: row.revision,
    paymentReference,
  });
}

export type PayrollShareOptions = {
  recipients: { id: string; fullName: string; email: string }[];
  discussions: { id: string; title: string; recipientUserId: string }[];
};
export async function getPayrollShareOptions(
  id: string,
): Promise<PayrollShareOptions> {
  return (
    await api.get<{ data: PayrollShareOptions }>(`/payroll/${id}/share-options`)
  ).data.data;
}
export async function sharePayrollDocument(
  id: string,
  input: {
    revision: number;
    recipientUserId: string;
    discussionId?: string;
    requestId: string;
    message?: string;
  },
) {
  return (
    await api.post<{ data: { transferId: string; alreadySent: boolean } }>(
      `/payroll/${id}/share`,
      input,
    )
  ).data.data;
}
export async function downloadPayrollPdf(row: Payroll): Promise<void> {
  let response;
  try {
    response = await api.get<Blob>(`/payroll/${row.id}/pdf`, {
      params: { revision: row.revision },
      responseType: "blob",
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        /* Preserve the original HTTP error. */
      }
    }
    throw error;
  }
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bulletin-${row.period}-${row.matricule.replace(/[^a-z0-9_-]/gi, "-").slice(0, 60)}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function updatePayrollPresentation(
  row: Payroll,
  input: {
    marksRevision: number;
    includeStamp: boolean;
    includeSignature: boolean;
  },
): Promise<Payroll> {
  return (
    await api.patch<{ data: { payroll: Payroll } }>(
      `/payroll/${row.id}/presentation`,
      { revision: row.revision, ...input },
    )
  ).data.data.payroll;
}

/** Counts use the same authorization and filters, without transferring salary rows. */
export async function countPayroll(period: string, options: PayrollListFilters, signal?: AbortSignal): Promise<{ total: number }> {
  const response = await api.get<{ data: PayrollListResult }>("/payroll", {
    params: { ...options, period: period || undefined, page: 1, countOnly: "1" }, signal,
  });
  if (response.data.data.listVersion !== "payroll-table-1") throw new Error("Le service de paie nécessite une mise à jour. Contactez le support de la plateforme.");
  return { total: response.data.data.total };
}
