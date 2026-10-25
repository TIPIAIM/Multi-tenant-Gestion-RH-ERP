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
export async function listPayroll(period: string, page: number) {
  return (
    await api.get<{ data: { items: Payroll[]; total: number; limit: number } }>(
      "/payroll",
      { params: { period, page } },
    )
  ).data.data;
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
