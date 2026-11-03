export type TaskPopup = {
  id: string;
  taskId: string;
  kind: "ASSIGNED" | "COMPLETED";
  title: string;
  message: string;
  createdAt: string;
};

export function taskPopupKey(item: TaskPopup): string {
  // Une réattribution peut réutiliser un avis avec une nouvelle date.
  return `${item.id}:${item.createdAt}`;
}

export function isTaskPopup(value: unknown): value is TaskPopup {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TaskPopup>;
  return typeof item.id === "string" && /^[a-f\d]{24}$/i.test(item.id)
    && typeof item.taskId === "string" && /^[a-f\d]{24}$/i.test(item.taskId)
    && (item.kind === "ASSIGNED" || item.kind === "COMPLETED")
    && typeof item.title === "string" && typeof item.message === "string"
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt));
}

export function mergeTaskPopups(current: TaskPopup[], incoming: TaskPopup[], dismissed: string[]): TaskPopup[] {
  const hidden = new Set(dismissed);
  const items = new Map<string, TaskPopup>();
  for (const item of [...current, ...incoming]) {
    if (isTaskPopup(item) && !hidden.has(taskPopupKey(item))) items.set(taskPopupKey(item), item);
  }
  return [...items.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    || taskPopupKey(b).localeCompare(taskPopupKey(a)));
}
