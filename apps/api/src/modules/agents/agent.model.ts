import mongoose, { Schema, type Model } from "mongoose";
import {
  agentContractTypes,
  agentDocumentCategories,
  agentEmploymentStatuses,
  agentHistoryEventTypes,
  type Agent,
  type AgentFile,
  type AgentHistoryEntry,
} from "./agent.types.js";

const agentFileSchema = new Schema<AgentFile>(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    category: { type: String, required: true, enum: [...agentDocumentCategories] },
    fileUrl: { type: String, required: true, trim: true },
    expiresAt: { type: Date },
    uploadedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const agentHistorySchema = new Schema<AgentHistoryEntry>(
  {
    eventType: { type: String, required: true, enum: [...agentHistoryEventTypes] },
    eventDate: { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    note: { type: String, trim: true, maxlength: 1500 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const agentSchema = new Schema<Agent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    firstName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    matricule: { type: String, required: true, trim: true, uppercase: true, maxlength: 40, match: /^[A-Z0-9_-]+$/ },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 180 },
    address: { type: String, trim: true, maxlength: 300 },
    jobTitle: { type: String, required: true, trim: true, maxlength: 160 },
    grade: { type: String, trim: true, maxlength: 100 },
    category: { type: String, trim: true, maxlength: 100 },
    directionId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit", default: null },
    supervisorAgentId: { type: Schema.Types.ObjectId, ref: "Agent", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    employmentStatus: { type: String, required: true, enum: [...agentEmploymentStatuses], default: "ACTIVE" },
    contractType: { type: String, required: true, enum: [...agentContractTypes], default: "PERMANENT" },
    employmentStartDate: { type: Date, required: true },
    employmentEndDate: { type: Date },

    contractEndAlert90SentAt: { type: Date },
    contractEndAlert90ReferenceDate: { type: Date },

    documents: { type: [agentFileSchema], default: [] },
    history: { type: [agentHistorySchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

agentSchema.index({ tenantId: 1, matricule: 1 }, { unique: true });
agentSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } },
);
agentSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } },
);
agentSchema.index({ tenantId: 1, directionId: 1, serviceId: 1, employmentStatus: 1 });
agentSchema.index({ tenantId: 1, lastName: 1, firstName: 1 });
agentSchema.index({ tenantId: 1, employmentEndDate: 1, employmentStatus: 1 });

export const AgentModel: Model<Agent> =
  (mongoose.models.Agent as Model<Agent> | undefined) ??
  mongoose.model<Agent>("Agent", agentSchema);
