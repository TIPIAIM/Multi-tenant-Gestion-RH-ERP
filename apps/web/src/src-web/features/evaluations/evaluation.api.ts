import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  CreateEvaluationInput,
  Evaluation,
  EvaluationListParams,
  EvaluationListResult,
  EvaluationStats,
  SubmitEvaluationReviewInput,
  UpdateEvaluationInput,
  ValidateEvaluationHrInput,
} from "./evaluation.types";

type EvaluationResponse = { evaluation: Evaluation };
type EvaluationStatsResponse = { stats: EvaluationStats };

export async function getEvaluations(params: EvaluationListParams): Promise<EvaluationListResult> {
  const response = await api.get<ApiSuccess<EvaluationListResult>>("/evaluations", { params });
  return response.data.data;
}

export async function getEvaluationStats(): Promise<EvaluationStats> {
  const response = await api.get<ApiSuccess<EvaluationStatsResponse>>("/evaluations/stats");
  return response.data.data.stats;
}

export async function getEvaluationById(evaluationId: string): Promise<Evaluation> {
  const response = await api.get<ApiSuccess<EvaluationResponse>>(`/evaluations/${evaluationId}`);
  return response.data.data.evaluation;
}

export async function createEvaluation(input: CreateEvaluationInput): Promise<Evaluation> {
  const response = await api.post<ApiSuccess<EvaluationResponse>>("/evaluations", input);
  return response.data.data.evaluation;
}

export async function updateEvaluation(evaluationId: string, input: UpdateEvaluationInput): Promise<Evaluation> {
  const response = await api.patch<ApiSuccess<EvaluationResponse>>(`/evaluations/${evaluationId}`, input);
  return response.data.data.evaluation;
}

export async function submitSelfReview(evaluationId: string, input: SubmitEvaluationReviewInput): Promise<Evaluation> {
  const response = await api.post<ApiSuccess<EvaluationResponse>>(`/evaluations/${evaluationId}/self-review`, input);
  return response.data.data.evaluation;
}

export async function submitManagerReview(evaluationId: string, input: SubmitEvaluationReviewInput): Promise<Evaluation> {
  const response = await api.post<ApiSuccess<EvaluationResponse>>(`/evaluations/${evaluationId}/manager-review`, input);
  return response.data.data.evaluation;
}

export async function validateEvaluationHr(evaluationId: string, input: ValidateEvaluationHrInput): Promise<Evaluation> {
  const response = await api.post<ApiSuccess<EvaluationResponse>>(`/evaluations/${evaluationId}/hr-validation`, input);
  return response.data.data.evaluation;
}

export async function recomputeEvaluationIntelligence(evaluationId: string): Promise<Evaluation> {
  const response = await api.post<ApiSuccess<EvaluationResponse>>(`/evaluations/${evaluationId}/recompute`);
  return response.data.data.evaluation;
}

export async function deleteEvaluation(evaluationId: string): Promise<void> {
  await api.delete(`/evaluations/${evaluationId}`);
}

export async function downloadEvaluationsCsv(params: EvaluationListParams): Promise<void> {
  const response = await api.get<Blob>("/evaluations/export.csv", {
    params,
    responseType: "blob",
  });

  const blobUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = "evaluations-fades-rh.csv";
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}
