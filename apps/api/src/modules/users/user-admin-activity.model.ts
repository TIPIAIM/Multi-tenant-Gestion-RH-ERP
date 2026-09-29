import mongoose, { Schema, model } from "mongoose";
import {
  userAdminActivityActions,
  type UserAdminActivity,
} from "./user-admin-activity.types.js";

const userAdminActivitySchema = new Schema<UserAdminActivity>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    actorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },

    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    targetName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },

    action: {
      type: String,
      required: true,
      enum: userAdminActivityActions,
      index: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1500,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

userAdminActivitySchema.index({
  tenantId: 1,
  targetUserId: 1,
  createdAt: -1,
});

userAdminActivitySchema.index({
  tenantId: 1,
  actorUserId: 1,
  createdAt: -1,
});

export const UserAdminActivityModel =
  mongoose.models.UserAdminActivity ||
  model<UserAdminActivity>(
    "UserAdminActivity",
    userAdminActivitySchema,
  );
