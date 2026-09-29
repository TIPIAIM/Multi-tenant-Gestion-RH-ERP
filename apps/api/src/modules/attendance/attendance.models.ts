import mongoose, {
    Schema,
    type Model,
  } from "mongoose";
  import {
    attendanceEventActions,
    attendanceSources,
    attendanceStatuses,
    type Attendance,
    type AttendanceEvent,
  } from "./attendance.types.js";
  
  const attendanceSchema = new Schema<Attendance>(
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
  
      directionId: {
        type: Schema.Types.ObjectId,
        ref: "OrganizationUnit",
        required: true,
      },
  
      serviceId: {
        type: Schema.Types.ObjectId,
        ref: "OrganizationUnit",
        default: null,
      },
  
      attendanceDate: {
        type: String,
        required: true,
        trim: true,
        match: /^\d{4}-\d{2}-\d{2}$/,
      },
  
      status: {
        type: String,
        required: true,
        enum: [...attendanceStatuses],
        default: "PRESENT",
      },
  
      checkInAt: {
        type: Date,
      },
  
      checkOutAt: {
        type: Date,
      },
  
      checkInSource: {
        type: String,
        enum: [...attendanceSources],
      },
  
      checkOutSource: {
        type: String,
        enum: [...attendanceSources],
      },
  
      scheduleStartMinutes: {
        type: Number,
        required: true,
        min: 0,
        max: 1439,
      },
  
      scheduleEndMinutes: {
        type: Number,
        required: true,
        min: 0,
        max: 1439,
      },
  
      graceMinutes: {
        type: Number,
        required: true,
        min: 0,
        max: 120,
      },
  
      lateMinutes: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
  
      workedMinutes: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
  
      overtimeMinutes: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
  
      earlyDepartureMinutes: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
  
      note: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
  
      createdByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
  
      lastUpdatedByUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );
  
  attendanceSchema.index(
    {
      tenantId: 1,
      agentId: 1,
      attendanceDate: 1,
    },
    {
      unique: true,
    },
  );
  
  attendanceSchema.index({
    tenantId: 1,
    attendanceDate: -1,
    status: 1,
  });
  
  attendanceSchema.index({
    tenantId: 1,
    directionId: 1,
    serviceId: 1,
    attendanceDate: -1,
  });
  
  const attendanceEventSchema =
    new Schema<AttendanceEvent>(
      {
        tenantId: {
          type: Schema.Types.ObjectId,
          ref: "Tenant",
          required: true,
        },
  
        attendanceId: {
          type: Schema.Types.ObjectId,
          ref: "Attendance",
          required: true,
        },
  
        agentId: {
          type: Schema.Types.ObjectId,
          ref: "Agent",
          required: true,
        },
  
        actorUserId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
  
        actorName: {
          type: String,
          required: true,
          trim: true,
          maxlength: 160,
        },
  
        action: {
          type: String,
          required: true,
          enum: [...attendanceEventActions],
        },
  
        summary: {
          type: String,
          required: true,
          trim: true,
          maxlength: 800,
        },
      },
      {
        timestamps: {
          createdAt: true,
          updatedAt: false,
        },
        versionKey: false,
      },
    );
  
  attendanceEventSchema.index({
    tenantId: 1,
    attendanceId: 1,
    createdAt: -1,
  });
  
  export const AttendanceModel: Model<Attendance> =
    (mongoose.models.Attendance as
      | Model<Attendance>
      | undefined) ??
    mongoose.model<Attendance>(
      "Attendance",
      attendanceSchema,
    );
  
  export const AttendanceEventModel: Model<AttendanceEvent> =
    (mongoose.models.AttendanceEvent as
      | Model<AttendanceEvent>
      | undefined) ??
    mongoose.model<AttendanceEvent>(
      "AttendanceEvent",
      attendanceEventSchema,
    );