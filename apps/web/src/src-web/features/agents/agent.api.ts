import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  AddAgentHistoryInput,
  Agent,
  AgentListParams,
  AgentListResult,
  AgentScope,
  AgentStats,
  CreateAgentInput,
  DeleteAgentResult,
  UpdateAgentInput,
} from "./agent.types";

type AgentResponse = {
  agent: Agent;
};

type AgentStatsResponse = {
  stats: AgentStats;
};

type AgentScopeResponse = {
  scope: AgentScope;
};

type AgentContractAlertRunResult = {
  checkedAgents: number;
  alertedAgents: number;
  skippedAgents: number;
  failedAgents: number;
  smtpConfigured: boolean;
  details: Array<{
    agentId: string;
    fullName: string;
    employmentEndDate: string;
    daysRemaining: number;
    sentTo: string[];
    status: "SENT" | "SKIPPED" | "FAILED";
    reason?: string;
  }>;
};

export async function getAgentScope(): Promise<AgentScope> {
  const response = await api.get<ApiSuccess<AgentScopeResponse>>(
    "/agents/scope",
  );

  return response.data.data.scope;
}

export async function getAgents(
  params: AgentListParams,
): Promise<AgentListResult> {
  const response = await api.get<ApiSuccess<AgentListResult>>(
    "/agents",
    { params },
  );

  return response.data.data;
}

export async function getAgentById(
  agentId: string,
): Promise<Agent> {
  const response = await api.get<ApiSuccess<AgentResponse>>(
    `/agents/${agentId}`,
  );

  return response.data.data.agent;
}

export async function getAgentStats(): Promise<AgentStats> {
  const response = await api.get<ApiSuccess<AgentStatsResponse>>(
    "/agents/stats",
  );

  return response.data.data.stats;
}

export async function createAgent(
  input: CreateAgentInput,
): Promise<Agent> {
  const response = await api.post<ApiSuccess<AgentResponse>>(
    "/agents",
    input,
  );

  return response.data.data.agent;
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
): Promise<Agent> {
  const response = await api.patch<ApiSuccess<AgentResponse>>(
    `/agents/${agentId}`,
    input,
  );

  return response.data.data.agent;
}

export async function deleteAgent(
  agentId: string,
): Promise<DeleteAgentResult> {
  const response = await api.delete<ApiSuccess<DeleteAgentResult>>(
    `/agents/${agentId}`,
  );

  return response.data.data;
}

export async function addAgentHistory(
  agentId: string,
  input: AddAgentHistoryInput,
): Promise<Agent> {
  const response = await api.post<ApiSuccess<AgentResponse>>(
    `/agents/${agentId}/history`,
    input,
  );

  return response.data.data.agent;
}


export async function runAgentContractEndAlerts(): Promise<AgentContractAlertRunResult> {
  const response = await api.post<ApiSuccess<AgentContractAlertRunResult>>(
    "/agents/contract-alerts/run",
  );

  return response.data.data;
}
