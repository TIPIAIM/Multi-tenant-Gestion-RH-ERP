import type {
    HydratedDocument,
    Types,
  } from "mongoose";
  import type {
    AgentDocumentCategory,
  } from "../agents/agent.types.js";
  
  export const agentDocumentStatuses = [
    "ACTIVE",
    "ARCHIVED",
  ] as const;
  
  export const agentDocumentExpiryFilters = [
    "ALL",
    "EXPIRING_30_DAYS",
    "EXPIRED",
    "NO_EXPIRY",
  ] as const;
  
  export type AgentDocumentStatus =
    (typeof agentDocumentStatuses)[number];
  
  export type AgentDocumentExpiryFilter =
    (typeof agentDocumentExpiryFilters)[number];
  
  export interface AgentDocumentFile {
    tenantId: Types.ObjectId;
    agentId: Types.ObjectId;
  
    title: string;
    category: AgentDocumentCategory;
  
    originalFileName: string;
    mimeType: string;
    bytes: number;
  
    storagePublicId: string;
  
    expiresAt?: Date;
  
    status: AgentDocumentStatus;
  
    uploadedByUserId: Types.ObjectId;
  
    archivedAt?: Date;
    archivedByUserId?: Types.ObjectId;
  
    restoredAt?: Date;
    restoredByUserId?: Types.ObjectId;
  
    viewCount: number;
    downloadCount: number;
  
    lastViewedAt?: Date;
    lastDownloadedAt?: Date;
  
    createdAt?: Date;
    updatedAt?: Date;
  }
  
  export type AgentDocumentFileDocument =
    HydratedDocument<AgentDocumentFile>;
  
  export type PublicAgentDocumentFile = {
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