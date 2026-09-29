export type AgentEmploymentStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "ON_LEAVE"
  | "SUSPENDED"
  | "LEFT";

export type AgentContractType =
  | "PERMANENT"
  | "FIXED_TERM"
  | "INTERNSHIP"
  | "CONSULTING"
  | "SECONDMENT"
  | "OTHER";

export type AgentHistoryEventType =
  | "CREATED"
  | "PROMOTION"
  | "SANCTION"
  | "MUTATION"
  | "TRAINING"
  | "OBSERVATION"
  | "OTHER";

export type AgentDocumentCategory =
  | "CONTRACT"
  | "ASSIGNMENT_DECISION"
  | "DIPLOMA"
  | "IDENTITY_DOCUMENT"
  | "CERTIFICATE"
  | "OTHER";

export type AgentFile = {
  title: string;
  category: AgentDocumentCategory;
  fileUrl: string;
  expiresAt?: string;
  uploadedAt: string;
};

export type AgentHistoryEntry = {
  eventType: AgentHistoryEventType;
  eventDate: string;
  description: string;
  note?: string;
  createdByUserId?: string;
};

export type Agent = {
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

  documents: AgentFile[];
  history: AgentHistoryEntry[];

  createdAt?: string;
  updatedAt?: string;
};

export type AgentStats = {
  total: number;
  active: number;
  inactive: number;
  onLeave: number;
  suspended: number;
  left: number;
};

export type AgentPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AgentListResult = {
  items: Agent[];
  pagination: AgentPagination;
};

export type DeleteAgentResult = {
  deletedAgentId: string;
  unlinkedUsers: number;
};

export type AgentScopeRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

export type AgentScope = {
  role: AgentScopeRole;
  userId: string;
  agentId: string | null;
  directionId: string | null;
  serviceId: string | null;
  fullName: string;
  isGlobalScope: boolean;
};

export type AgentListParams = {
  page?: number;
  limit?: number;
  search?: string;
  employmentStatus?: AgentEmploymentStatus;
  directionId?: string;
  serviceId?: string;
};

export type CreateAgentInput = {
  firstName: string;
  lastName: string;
  matricule: string;

  phone: string;
  email?: string;
  address?: string;

  jobTitle: string;
  grade?: string;
  category?: string;

  directionId: string;
  serviceId?: string | null;
  supervisorAgentId?: string | null;

  employmentStatus: AgentEmploymentStatus;
  contractType: AgentContractType;
  employmentStartDate: string;
  employmentEndDate?: string;
};

export type UpdateAgentInput = Partial<CreateAgentInput>;

export type AddAgentHistoryInput = {
  eventType: AgentHistoryEventType;
  eventDate: string;
  description: string;
  note?: string;
};
