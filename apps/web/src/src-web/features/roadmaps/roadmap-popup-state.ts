import { isTaskPopup, mergeTaskPopups, type TaskPopup } from "../tasks/task-popup-state";
export type RoadmapPopup = TaskPopup & { itemId: string };
export type RoadmapPopupState = { cursor: string; items: RoadmapPopup[] };
export function isRoadmapPopup(value: unknown): value is RoadmapPopup {
  return isTaskPopup(value) && typeof (value as Partial<RoadmapPopup>).itemId === "string"
    && /^[a-f\d]{24}$/i.test((value as RoadmapPopup).itemId);
}
export function mergeRoadmapPopups(current: RoadmapPopup[], incoming: RoadmapPopup[], dismissed: string[]): RoadmapPopup[] {
  return mergeTaskPopups(current, incoming, dismissed).filter(isRoadmapPopup);
}
