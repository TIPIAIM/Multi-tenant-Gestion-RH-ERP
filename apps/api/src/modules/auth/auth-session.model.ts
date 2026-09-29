import mongoose, {
    Schema,
    type Model,
  } from "mongoose";
  import type {
    AuthSession,
  } from "./auth-session.types.js";
  
  const authSessionSchema = new Schema<AuthSession>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
      },
  
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
  
      refreshTokenHash: {
        type: String,
        required: true,
        select: false,
      },
  
      expiresAt: {
        type: Date,
        required: true,
      },
  
      lastUsedAt: {
        type: Date,
        required: true,
      },
  
      ipAddress: {
        type: String,
        trim: true,
        maxlength: 80,
      },
  
      userAgent: {
        type: String,
        trim: true,
        maxlength: 500,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );
  
  authSessionSchema.index(
    {
      expiresAt: 1,
    },
    {
      expireAfterSeconds: 0,
    },
  );
  
  authSessionSchema.index({
    tenantId: 1,
    userId: 1,
  });
  
  export const AuthSessionModel: Model<AuthSession> =
    (mongoose.models.AuthSession as
      | Model<AuthSession>
      | undefined) ??
    mongoose.model<AuthSession>(
      "AuthSession",
      authSessionSchema,
    );