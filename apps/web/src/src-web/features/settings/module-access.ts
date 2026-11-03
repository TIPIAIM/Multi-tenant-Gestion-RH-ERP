import type { FeatureFlagSettings } from "./settings.types";
export const routeFeatures: Record<string, keyof FeatureFlagSettings> = {
  agents: "agents",
  tasks: "tasks",
  attendance: "attendance",
  leaves: "leave",
  roadmaps: "roadmaps",
  evaluations: "evaluations",
  reports: "reports",
  payroll: "payroll",
  trainings: "training",
  recruitment: "recruitment",
};
export function featureForPath(path: string) {
  return routeFeatures[path.split(/[?#]/)[0]!.split("/").filter(Boolean)[0] ?? ""];
}
