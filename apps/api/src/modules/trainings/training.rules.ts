export const trainingFormats = ["IN_PERSON", "REMOTE", "HYBRID"] as const;
export const sessionStatuses = ["DRAFT", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const enrollmentStatuses = ["REQUESTED", "APPROVED", "CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED"] as const;
export type SessionStatus = typeof sessionStatuses[number];
export type EnrollmentStatus = typeof enrollmentStatuses[number];
export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  const next: Record<SessionStatus, readonly SessionStatus[]> = {DRAFT:["OPEN","CANCELLED"],OPEN:["IN_PROGRESS","CANCELLED"],IN_PROGRESS:["COMPLETED","CANCELLED"],COMPLETED:[],CANCELLED:[]};
  return next[from].includes(to);
}
export function escapeSearch(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
