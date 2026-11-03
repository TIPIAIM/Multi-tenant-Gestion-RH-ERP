export type LeavePopup = { id: string; requestId: string; kind: string; title: string; message: string; createdAt: string };
export type LeavePopupState = { cursor: string; items: LeavePopup[] };
export function leavePopupKey(item: LeavePopup): string { return `${item.id}:${item.createdAt}`; }
export function isLeavePopup(value: unknown): value is LeavePopup {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LeavePopup>;
  return typeof item.id === "string" && /^[a-f\d]{24}$/i.test(item.id)
    && typeof item.requestId === "string" && /^[a-f\d]{24}$/i.test(item.requestId)
    && typeof item.kind === "string" && ["SUBMITTED","MANAGER_REVIEWED","RH_REVIEWED","FINAL_REVIEWED","CANCELLED"].includes(item.kind)
    && typeof item.title === "string" && typeof item.message === "string"
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt));
}
export function mergeLeavePopups(current: LeavePopup[], incoming: LeavePopup[], dismissed: string[]): LeavePopup[] {
  const hidden = new Set(dismissed), result = new Map<string,LeavePopup>();
  for (const item of [...current,...incoming]) if (isLeavePopup(item) && !hidden.has(leavePopupKey(item))) result.set(leavePopupKey(item),item);
  return [...result.values()].sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}
