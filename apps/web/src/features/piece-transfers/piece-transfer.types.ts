export type PieceTransferAudienceMode =
  | "ALL"
  | "SELECTED";

export type PieceTransferStatus =
  | "ACTIVE"
  | "REVOKED";

export type PieceTransferFileStatus =
  | "AVAILABLE"
  | "DELETED";

export type PieceTransferMessageStatus =
  | "ACTIVE"
  | "DELETED";

export type PieceTransferDirection =
  | "INBOX"
  | "SENT";

export type PieceTransferRecipientOption = {
  userId: string;
  fullName: string;
  email: string;
  role: string;

  agent?: {
    id: string;
    matricule: string;
    jobTitle: string;
    directionName?: string;
    serviceName?: string;
  };
};

export type PieceTransferListItem = {
  unreadMessageCount?: number;
  lastActivityAt?: string;
  id: string;
  direction: PieceTransferDirection;

  title: string;
  description?: string;

  originalFileName?: string;
  mimeType?: string;
  bytes?: number;

  fileStatus?: PieceTransferFileStatus;

  senderUserId: string;
  senderName: string;

  audienceMode?: PieceTransferAudienceMode;
  recipientCount?: number;

  status: PieceTransferStatus;
  isRead?: boolean;

  createdAt?: string;
  revokedAt?: string;
  revocableUntil?: string;

  canView: boolean;
  canDownload: boolean;
  canRevoke: boolean;
};

export type PieceTransferRecipient = {
  userId: string;
  fullName: string;
  isRead: boolean;
  firstReadAt?: string;
  viewCount: number;
  downloadCount: number;
};

export type PieceTransferMessage = {
  mentions?: Array<{ userId: string; fullName: string; start: number; end: number }>;
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  replyTo?: { messageId: string; senderName: string; body?: string; attachmentName?: string };
  forwarded?: boolean;
  id: string;

  senderUserId: string;
  senderName: string;
  senderRole: string;

  body?: string;
  status: PieceTransferMessageStatus;

  editedAt?: string;
  editCount: number;

  createdAt?: string;
  editableUntil?: string;

  permissions: {
    canEdit: boolean;
    canDelete: boolean;
  };

  attachments: Array<{
    index: number;
    originalFileName: string;
    mimeType: string;
    bytes: number;
    status: PieceTransferFileStatus;
    canView: boolean;
    canDownload: boolean;
  }>;
};

export type PieceTransferDetail = {
  participants?: Array<{ userId: string; fullName: string }>;
  id: string;

  title: string;
  description?: string;

  originalFileName?: string;
  mimeType?: string;
  bytes?: number;

  fileStatus?: PieceTransferFileStatus;

  senderUserId: string;
  senderName: string;
  senderRole: string;

  audienceMode: PieceTransferAudienceMode;
  recipientCount: number;

  status: PieceTransferStatus;

  createdAt?: string;
  revokedAt?: string;
  revocableUntil?: string;
  fileDeletedAt?: string;

  currentUser: {
    isSender: boolean;
    isRecipient: boolean;
    isAdminSupervisor: boolean;
    isRead?: boolean;
  };

  recipients?: PieceTransferRecipient[];

  permissions: {
    canView: boolean;
    canDownload: boolean;
    canRevoke: boolean;
    canDeleteFile: boolean;
    canSendMessage: boolean;
  };
};

export type PieceTransferStats = {
  communicationsStarted: number;
  communicationsReceived: number;
  activeSent: number;
  unread: number;

  messagesSent: number;
  messagesReceived: number;

  filesSent: number;
  filesReceived: number;
};

export type PieceTransferPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type PieceTransferListResult = {
  items: PieceTransferListItem[];
  pagination: PieceTransferPagination;
};

export type PieceTransferMessagesResult = {
  items: PieceTransferMessage[];
  serverNow: string;
  pagination: PieceTransferPagination;
};

export type PieceTransferRecipientOptionsResult = {
  items: PieceTransferRecipientOption[];
  pagination: PieceTransferPagination;
};

export type PieceTransferAdminFile = {
  id: string;
  kind: "TRANSFER" | "MESSAGE";

  transferId: string;
  messageId?: string;
  fileIndex?: number;

  senderUserId: string;
  senderName: string;

  title: string;

  fileName: string;
  mimeType: string;
  bytes: number;

  fileStatus: PieceTransferFileStatus;

  createdAt?: string;
  deletedAt?: string;
};

export type PieceTransferAdminMessage = {
  id: string;
  kind: "ROOT" | "MESSAGE";

  transferId: string;
  messageId?: string;
  communicationTitle: string;

  senderUserId: string;
  senderName: string;
  senderRole: string;

  body?: string;
  status:
    | PieceTransferMessageStatus
    | "REVOKED";

  hasAttachment: boolean;
  attachmentName?: string;
  attachmentCount: number;

  editedAt?: string;
  editCount: number;

  createdAt?: string;
  deletedAt?: string;

  canDeleteMessage: boolean;
};

export type PieceTransferAgentStats = {
  activeMessagesReceived: number;
  messagesRead: number;
  messagesUnread: number;
  unreadCommunications: number;
  entityId: string;
  agentId?: string;
  userIds: string[];

  fullName: string;
  emails: string[];

  role: string;
  isActive: boolean;

  matricule?: string;
  jobTitle?: string;
  directionName?: string;
  serviceName?: string;

  communicationsStarted: number;
  communicationsReceived: number;

  messagesSent: number;
  messagesReceived: number;

  filesSent: number;
  filesReceived: number;

  totalActivity: number;
};

export type PieceTransferAdminOverview = {
  totals: {
    activeMessagesReceived: number;
    messagesRead: number;
    messagesUnread: number;
    agentsWithUnread: number;
    messagesSent: number;
    messagesReceived: number;
    filesSent: number;
    filesReceived: number;
    communicationsStarted: number;
    communicationsReceived: number;
  };

  agents: PieceTransferAgentStats[];
};

export type PieceTransferAdminFilesResult = {
  items: PieceTransferAdminFile[];
  pagination: PieceTransferPagination;
};

export type PieceTransferAdminMessagesResult = {
  items: PieceTransferAdminMessage[];
  pagination: PieceTransferPagination;
};

export type PieceTransferListParams = {
  search?: string;
  status?: PieceTransferStatus;
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
};

export type PieceTransferRecipientOptionsParams = {
  search?: string;
  page?: number;
  limit?: number;
};

export type CreatePieceTransferInput = {
  file?: File;
  title: string;
  description?: string;
  audienceMode: PieceTransferAudienceMode;
  recipientUserIds: string[];
};

export type SendPieceTransferMessageInput = {
  mentionUserIds?: string[];
  replyToMessageId?: string;
  forwardMessageId?: string;
  forwardTransferId?: string;
  body?: string;
  files?: File[];
};
