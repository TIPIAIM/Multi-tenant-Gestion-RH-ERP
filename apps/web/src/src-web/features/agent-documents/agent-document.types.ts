 import type {
  AgentDocumentCategory,
} from "../agents/agent.types";

export type {
  AgentDocumentCategory,
} from "../agents/agent.types";

export type AgentDocumentStatus =
  | "ACTIVE"
  | "ARCHIVED";

export type AgentDocumentExpiryFilter =
  | "ALL"
  | "EXPIRING_30_DAYS"
  | "EXPIRED"
  | "NO_EXPIRY";

export type AgentDocument = {
  id: string;
  agentId: string;

  title: string;
  category: AgentDocumentCategory;

  originalFileName: string;
  mimeType: string;
  bytes: number;

  expiresAt?: string;

  status: AgentDocumentStatus;

  viewCount: number;
  downloadCount: number;

  lastViewedAt?: string;
  lastDownloadedAt?: string;

  archivedAt?: string;
  restoredAt?: string;

  uploadedByUserId: string;

  createdAt?: string;
  updatedAt?: string;
};

export type AgentDocumentSummary = {
  active: number;
  archived: number;
  expiringSoon: number;
  expired: number;
};

export type AgentDocumentsListResult = {
  documents: AgentDocument[];
  summary: AgentDocumentSummary;
};

export type AgentDocumentListParams = {
  search?: string;
  category?: AgentDocumentCategory;
  status?: AgentDocumentStatus;
  expiry?: AgentDocumentExpiryFilter;
};

export type UploadAgentDocumentInput = {
  file: File;
  title: string;
  category: AgentDocumentCategory;
  expiresAt?: string;
};