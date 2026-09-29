import mongoose, { Schema, type Model, type Types } from "mongoose";

export const TENANT_SELF_REGISTRATION_TERMS_VERSION = "2026-08";

export interface TenantRegistrationAudit {
  tenantId: Types.ObjectId;
  administratorUserId: Types.ObjectId;
  channel: "SELF_SERVICE";
  termsVersion: string;
  termsAcceptedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const tenantRegistrationAuditSchema = new Schema<TenantRegistrationAudit>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      index: true,
    },
    administratorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ["SELF_SERVICE"],
      required: true,
      default: "SELF_SERVICE",
    },
    termsVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    termsAcceptedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const TenantRegistrationAuditModel: Model<TenantRegistrationAudit> =
  (mongoose.models.TenantRegistrationAudit as Model<TenantRegistrationAudit> | undefined) ??
  mongoose.model<TenantRegistrationAudit>("TenantRegistrationAudit", tenantRegistrationAuditSchema);
