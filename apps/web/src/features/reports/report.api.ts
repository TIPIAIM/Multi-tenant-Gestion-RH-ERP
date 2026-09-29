import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  GenerateManagementReportInput,
  ManagementReport,
  ManagementReportAccessScope,
  ManagementReportListParams,
  ManagementReportListResult,
  ManagementReportStats,
  UpdateManagementReportInput,
} from "./report.types";

type ReportResponse = { report: ManagementReport };
type StatsResponse = { stats: ManagementReportStats };
type ScopeResponse = { scope: ManagementReportAccessScope };

export async function getManagementReports(params: ManagementReportListParams): Promise<ManagementReportListResult> {
  const response = await api.get<ApiSuccess<ManagementReportListResult>>("/reports", { params });
  return response.data.data;
}
export async function getManagementReportStats(): Promise<ManagementReportStats> {
  const response = await api.get<ApiSuccess<StatsResponse>>("/reports/stats");
  return response.data.data.stats;
}
export async function getManagementReportScope(): Promise<ManagementReportAccessScope> {
  const response = await api.get<ApiSuccess<ScopeResponse>>("/reports/scope");
  return response.data.data.scope;
}
export async function getManagementReportById(id: string): Promise<ManagementReport> {
  const response = await api.get<ApiSuccess<ReportResponse>>(`/reports/${id}`);
  return response.data.data.report;
}
export async function previewManagementReport(input: GenerateManagementReportInput): Promise<ManagementReport> {
  const response = await api.post<ApiSuccess<ReportResponse>>("/reports/preview", input);
  return response.data.data.report;
}
export async function generateManagementReport(input: GenerateManagementReportInput): Promise<ManagementReport> {
  const response = await api.post<ApiSuccess<ReportResponse>>("/reports/generate", input);
  return response.data.data.report;
}
export async function updateManagementReport(id: string, input: UpdateManagementReportInput): Promise<ManagementReport> {
  const response = await api.patch<ApiSuccess<ReportResponse>>(`/reports/${id}`, input);
  return response.data.data.report;
}
export async function recomputeManagementReport(id: string): Promise<ManagementReport> {
  const response = await api.post<ApiSuccess<ReportResponse>>(`/reports/${id}/recompute`);
  return response.data.data.report;
}
export async function validateManagementReport(id: string, validationComment?: string): Promise<ManagementReport> {
  const response = await api.post<ApiSuccess<ReportResponse>>(`/reports/${id}/validate`, { validationComment });
  return response.data.data.report;
}
export async function archiveManagementReport(id: string): Promise<ManagementReport> {
  const response = await api.post<ApiSuccess<ReportResponse>>(`/reports/${id}/archive`);
  return response.data.data.report;
}
export async function deleteManagementReport(id: string): Promise<void> {
  await api.delete(`/reports/${id}`);
}
export async function downloadManagementReportsCsv(params: ManagementReportListParams): Promise<void> {
  const response = await api.get<Blob>("/reports/export.csv", { params, responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "rapports-fades-rh.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
