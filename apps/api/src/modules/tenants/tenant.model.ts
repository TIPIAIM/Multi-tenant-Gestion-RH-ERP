import mongoose, {
    Schema,
    type Model,
  } from "mongoose";
  import {
    tenantStatuses,
    type Tenant,
    type TenantBranding,
  } from "./tenant.types.js";
  
  const brandingSchema = new Schema<TenantBranding>(
    {
      primaryColor: {
        type: String,
        required: true,
        match: /^#[0-9A-Fa-f]{6}$/,
      },
      secondaryColor: {
        type: String,
        required: true,
        match: /^#[0-9A-Fa-f]{6}$/,
      },
      accentColor: {
        type: String,
        required: true,
        match: /^#[0-9A-Fa-f]{6}$/,
      },
      logoUrl: {
        type: String,
        trim: true,
      },
    },
    {
      _id: false,
    },
  );
  
  const tenantSchema = new Schema<Tenant>(
    {
      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 120,
      },
      legalName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 180,
      },
      slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      },
      status: {
        type: String,
        enum: [...tenantStatuses],
        default: "ACTIVE",
        required: true,
      },
      contactEmail: {
        type: String,
        trim: true,
        lowercase: true,
      },
      contactPhone: {
        type: String,
        trim: true,
      },
      address: {
        type: String,
        trim: true,
        maxlength: 300,
      },
      branding: {
        type: brandingSchema,
        required: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );
  
   
  export const TenantModel: Model<Tenant> =
    (mongoose.models.Tenant as Model<Tenant> | undefined) ??
    mongoose.model<Tenant>("Tenant", tenantSchema);