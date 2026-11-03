import {
  api,
} from "../../lib/api";
import type {
  ApiSuccess,
} from "../auth/auth.types";
import type {
  CreatePieceTransferInput,
  PieceTransferPagination,
  PieceTransferAdminFile,
  PieceTransferAdminFilesResult,
  PieceTransferAdminMessagesResult,
  PieceTransferAdminOverview,
  PieceTransferDetail,
  PieceTransferListItem,
  PieceTransferListParams,
  PieceTransferListResult,
  PieceTransferMessage,
  PieceTransferMessagesResult,
  PieceTransferRecipientOptionsParams,
  PieceTransferRecipientOptionsResult,
  PieceTransferStats,
  SendPieceTransferMessageInput,
} from "./piece-transfer.types";

const BASE =
  "/piece-transfers";

export async function getPieceTransferRecipients(
  params:
    PieceTransferRecipientOptionsParams,
): Promise<PieceTransferRecipientOptionsResult> {
  const response =
    await api.get<
      ApiSuccess<PieceTransferRecipientOptionsResult>
    >(
      `${BASE}/recipients`,
      {
        params,
      },
    );

  return response.data.data;
}

export async function getPieceTransferStats():
  Promise<PieceTransferStats> {
  const response =
    await api.get<
      ApiSuccess<{
        stats:
          PieceTransferStats;
      }>
    >(
      `${BASE}/stats`,
    );

  return response.data.data.stats;
}

export async function getPieceTransferInbox(
  params:
    PieceTransferListParams,
): Promise<PieceTransferListResult> {
  const response =
    await api.get<
      ApiSuccess<PieceTransferListResult>
    >(
      `${BASE}/inbox`,
      {
        params,
      },
    );

  return response.data.data;
}

export async function getPieceTransferSent(
  params:
    PieceTransferListParams,
): Promise<PieceTransferListResult> {
  const response =
    await api.get<
      ApiSuccess<PieceTransferListResult>
    >(
      `${BASE}/sent`,
      {
        params,
      },
    );

  return response.data.data;
}

export async function createPieceTransfer(
  input:
    CreatePieceTransferInput,
): Promise<PieceTransferListItem> {
  const formData =
    new FormData();

  if (input.file) {
    formData.append(
      "file",
      input.file,
    );
  }

  formData.append(
    "title",
    input.title,
  );

  formData.append(
    "description",
    input.description ??
      "",
  );

  formData.append(
    "audienceMode",
    input.audienceMode,
  );

  formData.append(
    "recipientUserIds",
    JSON.stringify(
      input.recipientUserIds,
    ),
  );

  const response =
    await api.post<
      ApiSuccess<{
        transfer:
          PieceTransferListItem;
      }>
    >(
      BASE,
      formData,
    );

  return response.data.data.transfer;
}

export async function getPieceTransferById(
  transferId:
    string,
): Promise<PieceTransferDetail> {
  const response =
    await api.get<
      ApiSuccess<{
        transfer:
          PieceTransferDetail;
      }>
    >(
      `${BASE}/${transferId}`,
    );

  return response.data.data.transfer;
}

export async function getPieceTransferMessages(
  transferId:
    string,
  page = 1,
): Promise<PieceTransferMessagesResult> {
  const response =
    await api.get<
      ApiSuccess<PieceTransferMessagesResult>
    >(
      `${BASE}/${transferId}/messages`,
      {
        params: {
          page,
          limit: 50,
        },
      },
    );

  return response.data.data;
}

export async function sendPieceTransferMessage(
  transferId:
    string,
  input:
    SendPieceTransferMessageInput,
): Promise<PieceTransferMessage> {
  const formData =
    new FormData();

  formData.append(
    "body",
    input.body ??
      "",
  );

  if (input.mentionUserIds?.length) formData.append("mentionUserIds", JSON.stringify(input.mentionUserIds));
  if (input.replyToMessageId) formData.append("replyToMessageId", input.replyToMessageId);
  if (input.forwardMessageId) formData.append("forwardMessageId", input.forwardMessageId);
  if (input.forwardTransferId) formData.append("forwardTransferId", input.forwardTransferId);
  for (const file of input.files ?? []) {
    formData.append(
      "files",
      file,
    );
  }

  const response =
    await api.post<
      ApiSuccess<{
        message:
          PieceTransferMessage;
      }>
    >(
      `${BASE}/${transferId}/messages`,
      formData,
    );

  return response.data.data.message;
}

export async function updatePieceTransferMessage(
  transferId:
    string,
  messageId:
    string,
  body:
    string,
): Promise<PieceTransferMessage> {
  const response =
    await api.patch<
      ApiSuccess<{
        message:
          PieceTransferMessage;
      }>
    >(
      `${BASE}/${transferId}/messages/${messageId}`,
      {
        body,
      },
    );

  return response.data.data.message;
}

async function fetchBlob(
  endpoint:
    string,
): Promise<Blob> {
  const response =
    await api.get<
      Blob
    >(
      endpoint,
      {
        responseType:
          "blob",
      },
    );

  return response.data;
}

async function openBlobInNewWindow(
  blobPromise:
    Promise<Blob>,
): Promise<void> {
  const popup =
    window.open(
      "about:blank",
      "_blank",
    );

  if (
    !popup
  ) {
    throw new Error(
      "Le navigateur a bloqué l'ouverture du fichier.",
    );
  }

  popup.opener =
    null;

  try {
    const blob =
      await blobPromise;

    const url =
      URL.createObjectURL(
        blob,
      );

    popup.location.href =
      url;

    window.setTimeout(
      () =>
        URL.revokeObjectURL(
          url,
        ),
      60_000,
    );
  } catch (
    error
  ) {
    popup.close();
    throw error;
  }
}

async function downloadBlob(
  blobPromise:
    Promise<Blob>,
  fileName:
    string,
): Promise<void> {
  const blob =
    await blobPromise;

  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  anchor.href =
    url;

  anchor.download =
    fileName ||
    "piece";

  anchor.style.display =
    "none";

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(
    url,
  );
}

export async function viewPieceTransferFile(
  transferId:
    string,
): Promise<void> {
  return openBlobInNewWindow(
    fetchBlob(
      `${BASE}/${transferId}/view`,
    ),
  );
}

export async function downloadPieceTransferFile(
  transferId:
    string,
  fileName:
    string,
): Promise<void> {
  return downloadBlob(
    fetchBlob(
      `${BASE}/${transferId}/download`,
    ),
    fileName,
  );
}

export async function viewPieceTransferMessageFile(
  transferId:
    string,
  messageId:
    string,
  fileIndex:
    number,
): Promise<void> {
  return openBlobInNewWindow(
    fetchBlob(
      `${BASE}/${transferId}/messages/${messageId}/files/${fileIndex}/view`,
    ),
  );
}

export async function downloadPieceTransferMessageFile(
  transferId:
    string,
  messageId:
    string,
  fileIndex:
    number,
  fileName:
    string,
): Promise<void> {
  return downloadBlob(
    fetchBlob(
      `${BASE}/${transferId}/messages/${messageId}/files/${fileIndex}/download`,
    ),
    fileName,
  );
}

export async function revokePieceTransfer(
  transferId:
    string,
): Promise<PieceTransferDetail> {
  const response =
    await api.post<
      ApiSuccess<{
        transfer:
          PieceTransferDetail;
      }>
    >(
      `${BASE}/${transferId}/revoke`,
    );

  return response.data.data.transfer;
}

export async function getAdminCommunicationOverview():
  Promise<PieceTransferAdminOverview> {
  const response =
    await api.get<
      ApiSuccess<PieceTransferAdminOverview>
    >(
      `${BASE}/admin/overview`,
    );

  return response.data.data;
}

export async function getAdminCommunicationFiles(
  params:
    PieceTransferListParams,
): Promise<PieceTransferAdminFilesResult> {
  const response =
    await api.get<
      ApiSuccess<PieceTransferAdminFilesResult>
    >(
      `${BASE}/admin/files`,
      {
        params,
      },
    );

  return response.data.data;
}

export async function getAdminCommunicationMessages(
  params:
    PieceTransferListParams,
): Promise<PieceTransferAdminMessagesResult> {
  const response =
    await api.get<
      ApiSuccess<PieceTransferAdminMessagesResult>
    >(
      `${BASE}/admin/messages`,
      {
        params,
      },
    );

  return response.data.data;
}

export async function deleteTransferRootFileAsAdmin(
  transferId:
    string,
): Promise<void> {
  await api.delete(
    `${BASE}/${transferId}/file`,
  );
}

export async function deleteMessageFileAsAdmin(
  messageId:
    string,
  fileIndex:
    number,
): Promise<void> {
  await api.delete(
    `${BASE}/admin/messages/${messageId}/files/${fileIndex}`,
  );
}

export async function deletePieceTransferMessageAsAdmin(
  messageId:
    string,
): Promise<void> {
  await api.delete(
    `${BASE}/admin/messages/${messageId}`,
  );
}

export async function getMyCommunicationFiles(params: {
  direction: "SENT" | "INBOX";
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: PieceTransferAdminFile[]; pagination: PieceTransferPagination }> {
  const response = await api.get<ApiSuccess<{ items: PieceTransferAdminFile[]; pagination: PieceTransferPagination }>>(
    `${BASE}/files`, { params },
  );
  return response.data.data;
}

export async function getMyCommunicationMessages(params: {
  direction: "SENT" | "INBOX"; search?: string; page?: number; limit?: number;
}): Promise<PieceTransferAdminMessagesResult> {
  const response = await api.get<ApiSuccess<PieceTransferAdminMessagesResult>>(`${BASE}/messages`, { params });
  return response.data.data;
}

export type PieceTransferNotifications = PieceTransferListResult & {
  unreadMentions?: number;
  mentionAlerts?: Array<{ transferId: string; title: string; count: number; latestAt?: string }>;
  unreadMessages: number;
  unreadCommunications: number;
};

export async function getPieceTransferNotifications(params: PieceTransferListParams = {}): Promise<PieceTransferNotifications> {
  const response = await api.get<ApiSuccess<PieceTransferNotifications>>(`${BASE}/notifications`, { params });
  return response.data.data;
}

export async function markPieceTransferRead(id: string, messageId?: string): Promise<void> {
  await api.post(`${BASE}/${id}/read`, { messageId });
}

export async function getCommunicationAttachmentPreview(
  transferId: string, messageId: string | undefined, index: number, signal?: AbortSignal,
): Promise<Blob> {
  const path = messageId
    ? `${BASE}/${transferId}/messages/${messageId}/files/${index}/view`
    : `${BASE}/${transferId}/view`;
  const response = await api.get<Blob>(path, { responseType: "blob", signal });
  return response.data;
}

export async function setPieceTransferReaction(transferId: string, messageId: string, emoji: string | null): Promise<PieceTransferMessage> {
  const response = await api.put<ApiSuccess<{ message: PieceTransferMessage }>>(`${BASE}/${transferId}/messages/${messageId}/reaction`, { emoji });
  return response.data.data.message;
}
export type ForwardAgentsResult = { mode: "INDIVIDUAL" | "COMMON"; transfers: Array<{ transferId: string; recipientUserIds: string[] }>; failedRecipientUserIds: string[] };
export async function forwardPieceTransferToAgents(transferId: string, messageId: string, recipientUserIds: string[], mode: "INDIVIDUAL" | "COMMON" = "INDIVIDUAL", groupName?: string): Promise<ForwardAgentsResult> {
  const response = await api.post<ApiSuccess<ForwardAgentsResult>>(`${BASE}/${transferId}/messages/${messageId}/forward-agents`, { recipientUserIds, mode, groupName });
  return response.data.data;
}
