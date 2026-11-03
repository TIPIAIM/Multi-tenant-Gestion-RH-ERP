import { api } from "../../lib/api";

export type ApiHealthResponse = {
  success: boolean;
  service: string;
  message: string;
  database: {
    state: number;
    status: string;
  };
  timestamp: string;
};

export async function getApiHealth(): Promise<ApiHealthResponse> {
  const response = await api.get<ApiHealthResponse>("/health");

  return response.data;
}