type Id = { toString(): string } | string;
type Transfer = { _id: Id; senderUserId: Id; status: string };
type Recipient = { transferId: Id; recipientUserId: Id; status: string; isRead: boolean; firstReadAt?: Date };
type Message = { _id: Id; transferId: Id; senderUserId: Id; status: string; createdAt?: Date };
type Receipt = { transferId: Id; userId: Id; lastReadMessageAt?: Date; lastReadMessageId?: Id };

export type CommunicationReadStats = {
  activeMessagesReceived: number;
  messagesRead: number;
  messagesUnread: number;
  unreadCommunications: number;
};

/** Uses the same active-message scope and historical cutoff as personal notifications. */
export function computeCommunicationReadStats(
  transfers: Transfer[], recipients: Recipient[], messages: Message[], receipts: Receipt[],
): Map<string, CommunicationReadStats> {
  const byUser = new Map<string, CommunicationReadStats>();
  const participants = new Map<string, Set<string>>();
  const recipientMap = new Map<string, Recipient>();
  const receiptMap = new Map(receipts.map(row => [`${row.userId}:${row.transferId}`, row]));
  const unreadThreads = new Map<string, Set<string>>();
  function record(userId: string, transferId: string, read: boolean) {
    const stats = byUser.get(userId) ?? {
      activeMessagesReceived: 0, messagesRead: 0, messagesUnread: 0, unreadCommunications: 0,
    };
    stats.activeMessagesReceived++;
    if (read) stats.messagesRead++;
    else {
      stats.messagesUnread++;
      const threads = unreadThreads.get(userId) ?? new Set<string>();
      threads.add(transferId); unreadThreads.set(userId, threads);
      stats.unreadCommunications = threads.size;
    }
    byUser.set(userId, stats);
  }
  const activeTransfers = new Map(transfers.filter(row => row.status === "ACTIVE")
    .map(row => [String(row._id), row]));
  for (const [id, transfer] of activeTransfers) participants.set(id, new Set([String(transfer.senderUserId)]));
  for (const row of recipients) {
    const id = String(row.transferId), userId = String(row.recipientUserId);
    const transfer = activeTransfers.get(id);
    if (!transfer || row.status !== "ACTIVE") continue;
    participants.get(id)!.add(userId);
    recipientMap.set(`${userId}:${id}`, row);
    if (String(transfer.senderUserId) !== userId) record(userId, id, row.isRead);
  }
  for (const message of messages) {
    if (message.status !== "ACTIVE") continue;
    const id = String(message.transferId);
    for (const userId of participants.get(id) ?? []) {
      if (String(message.senderUserId) === userId) continue;
      const key = `${userId}:${id}`;
      const receipt = receiptMap.get(key);
      const recipient = recipientMap.get(key);
      const cutoff = receipt?.lastReadMessageAt ?? recipient?.firstReadAt;
      const at = message.createdAt?.getTime() ?? 0;
      const limit = cutoff?.getTime() ?? 0;
      const read = Boolean(cutoff) && (at < limit || (at === limit &&
        (!receipt?.lastReadMessageId || String(message._id) <= String(receipt.lastReadMessageId))));
      record(userId, id, read);
    }
  }
  return byUser;
}
