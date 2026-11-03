 import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  CreateRoadmapInput,
  KpiReviewDecision,
  Roadmap,
  RoadmapActivity,
  RoadmapListParams,
  RoadmapListResult,
  RoadmapScope,
  RoadmapStats,
  UpdateRoadmapInput,
} from "./roadmap.types";

type RoadmapResponse = {
  roadmap: Roadmap;
};

type StatsResponse = {
  stats: RoadmapStats;
};

type ScopeResponse = {
  scope: RoadmapScope;
};

type ActivitiesResponse = {
  activities: RoadmapActivity[];
};

type DeleteRoadmapResponse = {
  deleted: true;
  id: string;
};

export async function getRoadmapScope(): Promise<RoadmapScope> {
  const response = await api.get<ApiSuccess<ScopeResponse>>(
    "/roadmaps/scope",
  );

  return response.data.data.scope;
}

export async function getRoadmapStats(): Promise<RoadmapStats> {
  const response = await api.get<ApiSuccess<StatsResponse>>(
    "/roadmaps/stats",
  );

  return response.data.data.stats;
}

export async function getRoadmaps(
  params: RoadmapListParams,
): Promise<RoadmapListResult> {
  const response = await api.get<ApiSuccess<RoadmapListResult>>(
    "/roadmaps",
    {
      params,
    },
  );

  return response.data.data;
}

export async function createRoadmap(
  input: CreateRoadmapInput,
): Promise<Roadmap> {
  const response = await api.post<ApiSuccess<RoadmapResponse>>(
    "/roadmaps",
    input,
  );

  return response.data.data.roadmap;
}

export async function updateRoadmap(
  id: string,
  input: UpdateRoadmapInput,
): Promise<Roadmap> {
  const response = await api.patch<ApiSuccess<RoadmapResponse>>(
    `/roadmaps/${id}`,
    input,
  );

  return response.data.data.roadmap;
}

export async function submitRoadmap(id: string): Promise<Roadmap> {
  const response = await api.post<ApiSuccess<RoadmapResponse>>(
    `/roadmaps/${id}/submit`,
  );

  return response.data.data.roadmap;
}

export async function approveRoadmap(
  id: string,
  comment?: string,
): Promise<Roadmap> {
  const response = await api.post<ApiSuccess<RoadmapResponse>>(
    `/roadmaps/${id}/approve`,
    {
      comment,
    },
  );

  return response.data.data.roadmap;
}

export async function returnRoadmap(
  id: string,
  comment?: string,
): Promise<Roadmap> {
  const response = await api.post<ApiSuccess<RoadmapResponse>>(
    `/roadmaps/${id}/return`,
    {
      comment,
    },
  );

  return response.data.data.roadmap;
}

export async function closeRoadmap(id: string): Promise<Roadmap> {
  const response = await api.post<ApiSuccess<RoadmapResponse>>(
    `/roadmaps/${id}/close`,
  );

  return response.data.data.roadmap;
}

export async function deleteRoadmap(id: string): Promise<void> {
  await api.delete<ApiSuccess<DeleteRoadmapResponse>>(
    `/roadmaps/${id}`,
  );
}

export async function submitItemKpi(input: {
  roadmapId: string;
  itemId: string;
  kpiText?: string;
  file?: File | null;
}): Promise<Roadmap> {
  const formData = new FormData();

  if (input.kpiText?.trim()) {
    formData.append("kpiText", input.kpiText.trim());
  }

  if (input.file) {
    formData.append("kpiFile", input.file);
  }

  const response = await api.post<ApiSuccess<RoadmapResponse>>(
    `/roadmaps/${input.roadmapId}/items/${input.itemId}/kpi`,
    formData,
    {
      timeout: 90_000,
    },
  );

  return response.data.data.roadmap;
}

export async function reviewItemKpi(input: {
  roadmapId: string;
  itemId: string;
  decision: KpiReviewDecision;
  comment?: string;
}): Promise<Roadmap> {
  const response = await api.post<ApiSuccess<RoadmapResponse>>(
    `/roadmaps/${input.roadmapId}/items/${input.itemId}/review`,
    {
      decision: input.decision,
      comment: input.comment,
    },
  );

  return response.data.data.roadmap;
}

export async function getRoadmapActivities(
  id: string,
): Promise<RoadmapActivity[]> {
  const response = await api.get<ApiSuccess<ActivitiesResponse>>(
    `/roadmaps/${id}/activity`,
    {
      params: {
        limit: 50,
      },
    },
  );

  return response.data.data.activities;
}

export async function downloadRoadmapKpiFile(
  roadmapId: string,
  itemId: string,
  fileName: string,
): Promise<void> {
  const response = await api.get<Blob>(
    `/roadmaps/${roadmapId}/items/${itemId}/kpi-file`,
    {
      responseType: "blob",
      timeout: 90_000,
    },
  );

  const url = URL.createObjectURL(new Blob([response.data]));

  try {
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}
