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
