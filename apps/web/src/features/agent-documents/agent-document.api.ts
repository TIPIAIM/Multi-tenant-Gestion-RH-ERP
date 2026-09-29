import { api } from "../../lib/api";
import type { ApiSuccess } from "../auth/auth.types";
import type {
  AgentDocument,
  AgentDocumentListParams,
  AgentDocumentsListResult,
  UploadAgentDocumentInput,
} from "./agent-document.types";

type DocumentResponse = {
  document: AgentDocument;
};

export async function getAgentDocuments(
  agentId: string,
  params: AgentDocumentListParams,
): Promise<AgentDocumentsListResult> {
  const response = await api.get<
    ApiSuccess<AgentDocumentsListResult>
  >(`/agents/${agentId}/documents`, {
    params,
  });

  return response.data.data;
}

export async function uploadAgentDocument(
  agentId: string,
  input: UploadAgentDocumentInput,
  onProgress?: (progress: number) => void,
): Promise<AgentDocument> {
  const formData = new FormData();

  formData.append("file", input.file);
  formData.append("title", input.title);
  formData.append("category", input.category);

  if (input.expiresAt) {
    formData.append("expiresAt", input.expiresAt);
  }

  const response = await api.post<ApiSuccess<DocumentResponse>>(
    `/agents/${agentId}/documents`,
    formData,
    {
      timeout: 90_000,

      onUploadProgress: (event) => {
        if (!event.total) {
          return;
        }

        onProgress?.(
          Math.round(
            (event.loaded / event.total) * 100,
          ),
        );
      },
    },
  );

  return response.data.data.document;
}

export async function archiveAgentDocument(
  agentId: string,
  documentId: string,
): Promise<AgentDocument> {
  const response = await api.delete<
    ApiSuccess<DocumentResponse>
  >(`/agents/${agentId}/documents/${documentId}`);

  return response.data.data.document;
}

export async function restoreAgentDocument(
  agentId: string,
  documentId: string,
): Promise<AgentDocument> {
  const response = await api.patch<
    ApiSuccess<DocumentResponse>
  >(
    `/agents/${agentId}/documents/${documentId}/restore`,
  );

  return response.data.data.document;
}

export async function getAgentDocumentBlob(
    agentId: string,
    documentId: string,
    mode: "view" | "download",
  ): Promise<Blob> {
    const response = await api.get<Blob>(
      `/agents/${agentId}/documents/${documentId}/${mode}`,
      {
        responseType: "blob",
        timeout: 90_000,
      },
    );
  
    const headerContentType =
      response.headers["content-type"];
  
    const contentType =
      typeof headerContentType === "string" &&
      headerContentType.trim().length > 0
        ? headerContentType
        : "application/octet-stream";
  
    return new Blob([response.data], {
      type: contentType,
    });
  }
export async function downloadAgentDocument(
    agentId: string,
    agentDocument: AgentDocument,
  ): Promise<void> {
    const blob = await getAgentDocumentBlob(
      agentId,
      agentDocument.id,
      "download",
    );
  
    const localBlobUrl = URL.createObjectURL(blob);
  
    try {
      const anchor = window.document.createElement("a");
  
      anchor.href = localBlobUrl;
      anchor.download = agentDocument.originalFileName;
      anchor.style.display = "none";
  
      window.document.body.appendChild(anchor);
  
      anchor.click();
      anchor.remove();
    } finally {
      window.setTimeout(() => {
        URL.revokeObjectURL(localBlobUrl);
      }, 1_500);
    }
  }