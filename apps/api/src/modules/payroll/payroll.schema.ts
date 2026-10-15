import { z } from "zod";
export const payrollId = z.string().regex(/^[a-f\d]{24}$/i);
export const payrollPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const amount = z.number().int().min(0).max(1_000_000_000_000);
const rate = z.number().int().min(0).max(10_000);
export const payrollInput = z
  .object({
    agentId: payrollId,
    period: payrollPeriod,
    currency: z.enum(["GNF", "EUR", "USD", "XOF", "XAF"]),
    base: amount,
    bonus: amount,
    deductions: amount,
    employeeRate: rate,
    employerRate: rate,
    taxRate: rate,
    rulesNote: z.string().trim().min(5).max(2000),
    note: z.string().trim().max(2000).default(""),
  })
  .strict();
export const payrollUpdate = payrollInput
  .omit({ agentId: true, period: true, currency: true })
  .extend({ revision: z.number().int().min(0) })
  .strict();
export const payrollTransition = z
  .object({
    action: z.enum(["APPROVE", "PAY", "CANCEL"]),
    revision: z.number().int().min(0),
    paymentReference: z.string().trim().max(180).optional(),
  })
  .strict();
