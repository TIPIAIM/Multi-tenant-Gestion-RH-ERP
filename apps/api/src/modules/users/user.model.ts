import mongoose, { Schema, model } from "mongoose";
import { userRoles, type User } from "./user.types.js";

const userSchema = new Schema<User>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    /**
     * Liaison souple : plusieurs comptes peuvent pointer vers le même Agent.
     * Ne pas mettre unique: true.
     */
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      default: null,
      index: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 180,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      required: true,
      enum: userRoles,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    mustChangePassword: {
      type: Boolean,
      default: true,
    },

    emailVerifiedAt: {
      type: Date,
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index(
  {
    tenantId: 1,
    email: 1,
  },
  {
    unique: true,
  },
);

userSchema.index({ tenantId: 1, role: 1, isActive: 1 });
userSchema.index({ tenantId: 1, agentId: 1 });
userSchema.index({ tenantId: 1, createdAt: -1 });

export const UserModel =
  mongoose.models.User || model<User>("User", userSchema);
