import { api } from "../../lib/api";
import { getAgentById } from "./agent.api";

export async function uploadAgentCreationPhoto(agentId: string, file: File): Promise<void> {
  // Read the current revision for safe retries, including a lost upload response.
  const current = await getAgentById(agentId);
  const form = new FormData();
  form.append("photo", file);
  form.append("revision", String(current.photoRevision ?? 0));
  await api.post(`/agents/${agentId}/photo`, form);
}
