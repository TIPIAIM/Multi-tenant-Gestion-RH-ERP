import mongoose, {
    Schema,
    type Model,
  } from "mongoose";
  import {
    agentDocumentCategories,
  } from "../agents/agent.types.js";
  import {
    agentDocumentStatuses,
    type AgentDocumentFile,
  } from "./agent-document.types.js";
  
  const agentDocumentFileSchema = new Schema<AgentDocumentFile>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
      },
  
      agentId: {
        type: Schema.Types.ObjectId,
        ref: "Agent",
        required: true,
      },
  
      title: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 180,
      },
  
      category: {
        type: String,
        required: true,
        enum: [...agentDocumentCategories],
      },
  
      originalFileName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 255,
      },
  
      mimeType: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
  
      bytes: {
        type: Number,
        required: true,
        min: 1,
      },
  
      storagePublicId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
  
      expiresAt: {
        type: Date,
      },
  
      status: {
        type: String,
        required: true,
        enum: [...agentDocumentStatuses],
        default: "ACTIVE",
      },
      viewCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      
      downloadCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      
      lastViewedAt: {
        type: Date,
      },
      
      lastDownloadedAt: {
        type: Date,
      },
      uploadedByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      restoredAt: {
        type: Date,
      },
      
      restoredByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      
      archivedAt: {
        type: Date,
      },
  
      archivedByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );
  
  agentDocumentFileSchema.index({
    tenantId: 1,
    agentId: 1,
    status: 1,
    createdAt: -1,
  });
  
  agentDocumentFileSchema.index({
    tenantId: 1,
    category: 1,
    expiresAt: 1,
  });
  
  export const AgentDocumentFileModel: Model<AgentDocumentFile> =
    (mongoose.models.AgentDocumentFile as
      | Model<AgentDocumentFile>
      | undefined) ??
    mongoose.model<AgentDocumentFile>(
      "AgentDocumentFile",
      agentDocumentFileSchema,
    );