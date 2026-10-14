import type {
  HydratedDocument,
  Types,
} from "mongoose";

export const pieceTransferAudienceModes = [
  "ALL",
  "SELECTED",
] as const;

export const pieceTransferStatuses = [
  "ACTIVE",
  "REVOKED",
] as const;

export const pieceTransferFileStatuses = [
  "AVAILABLE",
  "DELETED",
] as const;

export const pieceTransferMessageStatuses = [
  "ACTIVE",
  "DELETED",
] as const;

export const pieceTransferAuditActions = [
  "SHARE",
  "READ",
  "VIEW",
  "DOWNLOAD",
  "MESSAGE_SEND",
  "MESSAGE_EDIT",
  "MESSAGE_DELETE",
  "MESSAGE_FILE_VIEW",
  "MESSAGE_FILE_DOWNLOAD",
  "REVOKE",
  "FILE_DELETE",
  "ADMIN_THREAD_VIEW",
] as const;

export type PieceTransferAudienceMode =
  (typeof pieceTransferAudienceModes)[number];

export type PieceTransferStatus =
  (typeof pieceTransferStatuses)[number];

export type PieceTransferFileStatus =
  (typeof pieceTransferFileStatuses)[number];

export type PieceTransferMessageStatus =
  (typeof pieceTransferMessageStatuses)[number];

export type PieceTransferAuditAction =
  (typeof pieceTransferAuditActions)[number];

export interface PieceTransfer {
  directRecipientName?: string;
  groupName?: string;
  tenantId: Types.ObjectId;

  senderUserId: Types.ObjectId;
  senderNameSnapshot: string;
  senderRoleSnapshot: string;

  title: string;
  description?: string;

  originalFileName?: string;
  mimeType?: string;
  bytes?: number;
  storagePublicId?: string;

  fileStatus?: PieceTransferFileStatus;
  fileDeletedAt?: Date;
  fileDeletedByUserId?: Types.ObjectId;

  audienceMode: PieceTransferAudienceMode;
  recipientCount: number;

  status: PieceTransferStatus;
  revokedAt?: Date;
  revokedByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface PieceTransferRecipient {
  tenantId: Types.ObjectId;
  transferId: Types.ObjectId;

  recipientUserId: Types.ObjectId;
  recipientNameSnapshot: string;

  senderUserId: Types.ObjectId;
  senderNameSnapshot: string;

  titleSnapshot: string;
  descriptionSnapshot?: string;

  originalFileNameSnapshot?: string;
  mimeTypeSnapshot?: string;
  bytesSnapshot?: number;

  status: PieceTransferStatus;

  isRead: boolean;
  firstReadAt?: Date;

  lastViewedAt?: Date;
  viewCount: number;

  lastDownloadedAt?: Date;
  downloadCount: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface PieceTransferMessageAttachment {
  originalFileName: string;
  mimeType: string;
  bytes: number;
  storagePublicId: string;

  status: PieceTransferFileStatus;
  deletedAt?: Date;
  deletedByUserId?: Types.ObjectId;
}

export interface PieceTransferMessageRevision {
  body?: string;
  editedAt: Date;
}

export interface PieceTransferMessage {
  mentions?: Array<{ userId: string; fullName: string; start: number; end: number }>;
  reactions?: Array<{ userId: string; emoji: string }>;
  replyTo?: { messageId: string; senderName: string; body?: string; attachmentName?: string };
  forwarded?: boolean;
  tenantId: Types.ObjectId;
  transferId: Types.ObjectId;

  senderUserId: Types.ObjectId;
  senderNameSnapshot: string;
  senderRoleSnapshot: string;

  body?: string;

  /**
   * Compatibilité avec les anciens messages V4/V5.
   * Les nouveaux messages utilisent `attachments`.
   */
  attachment?: PieceTransferMessageAttachment;

  attachments: PieceTransferMessageAttachment[];

  status: PieceTransferMessageStatus;

  editedAt?: Date;
  editCount: number;
  revisions: PieceTransferMessageRevision[];

  deletedAt?: Date;
  deletedByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface PieceTransferAudit {
  tenantId: Types.ObjectId;
  transferId: Types.ObjectId;
  messageId?: Types.ObjectId;

  actorUserId: Types.ObjectId;
  actorRoleSnapshot: string;

  action: PieceTransferAuditAction;

  createdAt?: Date;
  updatedAt?: Date;
}

export type PieceTransferDocument =
  HydratedDocument<PieceTransfer>;

export type PieceTransferRecipientDocument =
  HydratedDocument<PieceTransferRecipient>;

export type PieceTransferMessageDocument =
  HydratedDocument<PieceTransferMessage>;

export type PublicPieceTransferRecipientOption = {
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

export type PublicPieceTransferListItem = {
  id: string;
  direction: "INBOX" | "SENT";

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

export type PublicPieceTransferRecipient = {
  userId: string;
  fullName: string;
  isRead: boolean;
  firstReadAt?: string;
  viewCount: number;
  downloadCount: number;
};

export type PublicPieceTransferMessage = {
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

export type PublicPieceTransferDetail = {
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

  recipients?: PublicPieceTransferRecipient[];

  permissions: {
    canView: boolean;
    canDownload: boolean;
    canRevoke: boolean;
    canDeleteFile: boolean;
    canSendMessage: boolean;
  };
};

export type PublicPieceTransferStats = {
  communicationsStarted: number;
  communicationsReceived: number;
  activeSent: number;
  unread: number;

  messagesSent: number;
  messagesReceived: number;

  filesSent: number;
  filesReceived: number;
};

export type PublicPieceTransferAdminFile = {
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

export type PublicPieceTransferAdminMessage = {
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

export type PublicPieceTransferAgentStats = {
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

export type PublicPieceTransferAdminOverview = {
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

  agents: PublicPieceTransferAgentStats[];
};
