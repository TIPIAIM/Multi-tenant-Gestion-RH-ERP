import mongoose, {
    Schema,
    type Model,
  } from "mongoose";
  import {
    organizationUnitStatuses,
    organizationUnitTypes,
    type OrganizationUnit,
  } from "./organization.types.js";
  
  const organizationUnitSchema = new Schema<OrganizationUnit>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
      },
  
      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 140,
      },
  
      code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 30,
        match: /^[A-Z0-9_-]+$/,
      },
  
      type: {
        type: String,
        required: true,
        enum: [...organizationUnitTypes],
      },
  
      parentId: {
        type: Schema.Types.ObjectId,
        ref: "OrganizationUnit",
        default: null,
      },
  
      managerUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
  
      description: {
        type: String,
        trim: true,
        maxlength: 800,
      },
  
      status: {
        type: String,
        required: true,
        enum: [...organizationUnitStatuses],
        default: "ACTIVE",
      },
  
      sortOrder: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        max: 10000,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );
  
  organizationUnitSchema.index(
    {
      tenantId: 1,
      type: 1,
      code: 1,
    },
    {
      unique: true,
    },
  );
  
  organizationUnitSchema.index({
    tenantId: 1,
    parentId: 1,
    status: 1,
    sortOrder: 1,
  });
  
  export const OrganizationUnitModel: Model<OrganizationUnit> =
    (mongoose.models.OrganizationUnit as
      | Model<OrganizationUnit>
      | undefined) ??
    mongoose.model<OrganizationUnit>(
      "OrganizationUnit",
      organizationUnitSchema,
    );