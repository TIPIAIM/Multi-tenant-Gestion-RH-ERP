import type { HydratedDocument, Types } from "mongoose";

export const agentEmploymentStatuses = [
  "ACTIVE",
  "INACTIVE",
  "ON_LEAVE",
  "SUSPENDED",
  "LEFT",
] as const;

export const agentContractTypes = [
  "PERMANENT",
  "FIXED_TERM",
  "INTERNSHIP",
  "CONSULTING",
  "SECONDMENT",
  "OTHER",
] as const;

export const agentDocumentCategories = [
  "CONTRACT",
  "ASSIGNMENT_DECISION",
  "DIPLOMA",
  "IDENTITY_DOCUMENT",
  "CERTIFICATE",
  "OTHER",
] as const;

export const agentHistoryEventTypes = [
  "CREATED",
  "PROMOTION",
  "SANCTION",
  "MUTATION",
  "TRAINING",
  "OBSERVATION",
  "OTHER",
] as const;

export type AgentEmploymentStatus = (typeof agentEmploymentStatuses)[number];
export type AgentContractType = (typeof agentContractTypes)[number];
export type AgentDocumentCategory = (typeof agentDocumentCategories)[number];
export type AgentHistoryEventType = (typeof agentHistoryEventTypes)[number];

export interface AgentFile {
  title: string;
  category: AgentDocumentCategory;
  fileUrl: string;
  expiresAt?: Date;
  uploadedAt: Date;
}

export interface AgentHistoryEntry {
  eventType: AgentHistoryEventType;
  eventDate: Date;
  description: string;
  note?: string;
  createdByUserId?: Types.ObjectId;
}

export interface Agent {
  tenantId: Types.ObjectId;

  firstName: string;
  lastName: string;
  matricule: string;

  phone: string;
  email?: string;
  address?: string;

  jobTitle: string;
  grade?: string;
  category?: string;

  directionId: Types.ObjectId;
  serviceId: Types.ObjectId | null;
  supervisorAgentId: Types.ObjectId | null;
  userId: Types.ObjectId | null;

  employmentStatus: AgentEmploymentStatus;
  contractType: AgentContractType;
  employmentStartDate: Date;
  employmentEndDate?: Date;

  /**
   * Trace technique de l'alerte automatique envoyée 90 jours avant la fin du contrat.
   * La date de référence permet de renvoyer une alerte si la date de fin du contrat change.
   */
  contractEndAlert90SentAt?: Date;
  contractEndAlert90ReferenceDate?: Date;

  documents: AgentFile[];
  history: AgentHistoryEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}

export type AgentDocument = HydratedDocument<Agent>;

export type PublicAgentDocument = {
  title: string;
  category: AgentDocumentCategory;
  fileUrl: string;
  expiresAt?: string;
  uploadedAt: string;
};

export type PublicAgentHistoryEntry = {
  eventType: AgentHistoryEventType;
  eventDate: string;
  description: string;
  note?: string;
  createdByUserId?: string;
};

export type PublicAgent = {
  id: string;
  tenantId: string;

  firstName: string;
  lastName: string;
  fullName: string;
  matricule: string;

  phone: string;
  email?: string;
  address?: string;

  jobTitle: string;
  grade?: string;
  category?: string;

  directionId: string;
  serviceId: string | null;
  supervisorAgentId: string | null;
  userId: string | null;

  employmentStatus: AgentEmploymentStatus;
  contractType: AgentContractType;
  employmentStartDate: string;
  employmentEndDate?: string;

  contractEndAlert90SentAt?: string;
  contractEndAlert90ReferenceDate?: string;

  documents: PublicAgentDocument[];
  history: PublicAgentHistoryEntry[];

  createdAt?: string;
  updatedAt?: string;
};
