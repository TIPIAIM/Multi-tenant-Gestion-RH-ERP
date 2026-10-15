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
};
export function featureForPath(path: string) {
  return routeFeatures[path.split("/").filter(Boolean)[0] ?? ""];
}
