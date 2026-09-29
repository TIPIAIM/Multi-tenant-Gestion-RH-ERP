import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  CreateLeaveRequestInput,
  LeaveActivity,
  LeaveBalance,
  LeaveDashboard,
  LeaveRequest,
  LeaveRequestListParams,
  LeaveRequestListResult,
  ReviewLeaveRequestInput,
  UpdateLeaveRequestInput,
  UpsertLeaveBalanceInput,
} from "./leave.types";

export async function getLeaveDashboard(
  calendarYear?: number,
): Promise<LeaveDashboard> {
  const response = await api.get<
    ApiSuccess<{ dashboard: LeaveDashboard }>
  >("/leaves/dashboard", {
    params: { calendarYear },
  });

  return response.data.data.dashboard;
}

export async function getLeaveBalances(params: {
  agentId?: string;
  calendarYear?: number;
}): Promise<LeaveBalance[]> {
  const response = await api.get<
    ApiSuccess<{ balances: LeaveBalance[] }>
  >("/leaves/balances", { params });

  return response.data.data.balances;
}

export async function upsertLeaveBalance(
  input: UpsertLeaveBalanceInput,
): Promise<LeaveBalance> {
  const response = await api.put<
    ApiSuccess<{ balance: LeaveBalance }>
  >("/leaves/balances", input);

  return response.data.data.balance;
}

export async function getLeaveCalendar(params?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<LeaveRequest[]> {
  const response = await api.get<
    ApiSuccess<{ items: LeaveRequest[] }>
  >("/leaves/calendar", { params });

  return response.data.data.items;
}

export async function getLeaveRequests(
  params: LeaveRequestListParams,
): Promise<LeaveRequestListResult> {
  const response = await api.get<
    ApiSuccess<LeaveRequestListResult>
  >("/leaves/requests", { params });

  return response.data.data;
}

export async function getLeaveRequestById(
  requestId: string,
): Promise<LeaveRequest> {
  const response = await api.get<
    ApiSuccess<{ leaveRequest: LeaveRequest }>
  >(`/leaves/requests/${requestId}`);

  return response.data.data.leaveRequest;
}

export async function createLeaveRequest(
  input: CreateLeaveRequestInput,
): Promise<LeaveRequest> {
  const response = await api.post<
    ApiSuccess<{ leaveRequest: LeaveRequest }>
  >("/leaves/requests", input);

  return response.data.data.leaveRequest;
}

export async function updateLeaveRequest(
  requestId: string,
  input: UpdateLeaveRequestInput,
): Promise<LeaveRequest> {
  const response = await api.patch<
    ApiSuccess<{ leaveRequest: LeaveRequest }>
  >(`/leaves/requests/${requestId}`, input);

  return response.data.data.leaveRequest;
}

export async function submitLeaveRequest(
  requestId: string,
): Promise<LeaveRequest> {
  const response = await api.post<
    ApiSuccess<{ leaveRequest: LeaveRequest }>
  >(`/leaves/requests/${requestId}/submit`);

  return response.data.data.leaveRequest;
}

export async function reviewLeaveByManager(
  requestId: string,
  input: ReviewLeaveRequestInput,
): Promise<LeaveRequest> {
  const response = await api.post<
    ApiSuccess<{ leaveRequest: LeaveRequest }>
  >(`/leaves/requests/${requestId}/manager-review`, input);

  return response.data.data.leaveRequest;
}

export async function reviewLeaveFinal(
  requestId: string,
  input: ReviewLeaveRequestInput,
): Promise<LeaveRequest> {
  const response = await api.post<
    ApiSuccess<{ leaveRequest: LeaveRequest }>
  >(`/leaves/requests/${requestId}/final-review`, input);

  return response.data.data.leaveRequest;
}

export async function cancelLeaveRequest(
  requestId: string,
  reason: string,
): Promise<LeaveRequest> {
  const response = await api.post<
    ApiSuccess<{ leaveRequest: LeaveRequest }>
  >(`/leaves/requests/${requestId}/cancel`, { reason });

  return response.data.data.leaveRequest;
}

export async function getLeaveActivities(
  requestId: string,
): Promise<LeaveActivity[]> {
  const response = await api.get<
    ApiSuccess<{ activities: LeaveActivity[] }>
  >(`/leaves/requests/${requestId}/activity`, {
    params: { limit: 50 },
  });

  return response.data.data.activities;
}
