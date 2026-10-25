export type MessageReceipt = { readCount: number; recipientCount: number };
export type ReadWatermark = { userId: string; at: Date; messageId: string };

/** Compare the same (createdAt, ObjectId) ordering as the read acknowledgement. */
export function computeMessageReceipt(
  message: { senderUserId: string; createdAt?: Date; id: string },
  participantIds: string[],
  watermarks: ReadWatermark[],
): MessageReceipt {
  const recipients = new Set(participantIds.filter(id => id !== message.senderUserId));
  const readers = new Set<string>();
  const at = message.createdAt?.getTime();
  if (at !== undefined && Number.isFinite(at)) {
    for (const mark of watermarks) {
      if (!recipients.has(mark.userId)) continue;
      const readAt = mark.at.getTime();
      if (readAt > at || (readAt === at && mark.messageId.toLowerCase() >= message.id.toLowerCase())) {
        readers.add(mark.userId);
      }
    }
  }
  return { readCount: readers.size, recipientCount: recipients.size };
}
