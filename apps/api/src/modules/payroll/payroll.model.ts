import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
const payrollSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    agentName: { type: String, required: true },
    matricule: { type: String, required: true },
    period: { type: String, required: true },
    currency: { type: String, required: true },
    minorUnitDigits: { type: Number, required: true },
    base: { type: Number, required: true },
    bonus: { type: Number, required: true },
    deductions: { type: Number, required: true },
    employeeRate: { type: Number, required: true },
    employerRate: { type: Number, required: true },
    taxRate: { type: Number, required: true },
    gross: { type: Number, required: true },
    employeeContribution: { type: Number, required: true },
    employerContribution: { type: Number, required: true },
    tax: { type: Number, required: true },
    net: { type: Number, required: true },
    employerCost: { type: Number, required: true },
    rulesNote: { type: String, required: true },
    note: String,
    status: {
      type: String,
      enum: ["DRAFT", "APPROVED", "PAID", "CANCELLED"],
      default: "DRAFT",
      required: true,
    },
    revision: { type: Number, default: 0, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    approvedBy: Schema.Types.ObjectId,
    approvedAt: Date,
    paidBy: Schema.Types.ObjectId,
    paidAt: Date,
    paymentReference: String,
    includeStamp: { type: Boolean, default: false },
    includeSignature: { type: Boolean, default: false },
    stampImage: { type: Buffer, select: false },
    signatureImage: { type: Buffer, select: false },
    events: [
      { _id: false, action: String, actorId: Schema.Types.ObjectId, at: Date },
    ],
  },
  { timestamps: true },
);
payrollSchema.index(
  { tenantId: 1, agentId: 1, period: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["DRAFT", "APPROVED", "PAID"] } },
  },
);
payrollSchema.index({ tenantId: 1, period: -1, status: 1 });
export type PayrollRecord = InferSchemaType<typeof payrollSchema>;
export const PayrollModel: Model<InferSchemaType<typeof payrollSchema>> =
  (mongoose.models.Payroll as
    Model<InferSchemaType<typeof payrollSchema>> | undefined) ??
  mongoose.model<InferSchemaType<typeof payrollSchema>>(
    "Payroll",
    payrollSchema,
  );

// Persistent delivery receipts: a retry with the same requestId never sends twice.
const payrollDeliverySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    payrollId: { type: Schema.Types.ObjectId, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    recipientUserId: { type: Schema.Types.ObjectId, required: true },
    requestId: { type: String, required: true },
    destinationId: String,
    revision: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      required: true,
    },
    transferId: String,
    completedAt: Date,
  },
  { timestamps: true },
);
payrollDeliverySchema.index(
  { tenantId: 1, actorId: 1, requestId: 1 },
  { unique: true },
);
export type PayrollDeliveryRecord = InferSchemaType<
  typeof payrollDeliverySchema
>;
export const PayrollDeliveryModel: Model<PayrollDeliveryRecord> =
  (mongoose.models.PayrollDelivery as
    Model<PayrollDeliveryRecord> | undefined) ??
  mongoose.model<PayrollDeliveryRecord>(
    "PayrollDelivery",
    payrollDeliverySchema,
  );
