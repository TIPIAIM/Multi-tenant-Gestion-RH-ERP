import { z } from "zod";
import type { RequestHandler } from "express";
import type { Model, Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { UserModel } from "../users/user.model.js";
import type { User } from "../users/user.types.js";
import { AgentModel } from "../agents/agent.model.js";
import { PayrollModel, type PayrollRecord } from "./payroll.model.js";

const statuses = ["DRAFT", "APPROVED", "PAID", "CANCELLED"] as const;
export const payrollListQuery = z
  .object({
    countOnly: z.enum(["0", "1"]).optional(),
    period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    search: z.string().trim().max(100).default(""),
    status: z.enum(["", ...statuses]).default(""),
    currency: z
      .string()
      .regex(/^(|[A-Z]{3})$/)
      .default(""),
    sortBy: z
      .enum(["agentName", "matricule", "period", "gross", "net", "paidAt"])
      .default("period"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce
      .number()
      .int()
      .refine(
        (value) => [20, 50, 100].includes(value),
        "Choisissez 20, 50 ou 100 lignes.",
      )
      .default(20),
  })
  .strict();
export type PayrollListQuery = z.infer<typeof payrollListQuery>;

export function payrollSearchPattern(value: string): string {
  const accents: Record<string, string> = {
    a: "[aàáâäãå]",
    e: "[eèéêë]",
    i: "[iìíîï]",
    o: "[oòóôöõ]",
    u: "[uùúûü]",
    c: "[cç]",
    n: "[nñ]",
    y: "[yÿý]",
    œ: "(?:œ|oe)",
    æ: "(?:æ|ae)",
  };
  return Array.from(value.normalize("NFD").replace(/\p{M}/gu, ""))
    .map(
      (character) =>
        accents[character.toLowerCase()] ??
        character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
}
export function buildPayrollListFilter(
  tenantId: Types.ObjectId,
  query: PayrollListQuery,
  manager: boolean,
  agentId?: Types.ObjectId | null,
) {
  const filter: Record<string, unknown> = { tenantId };
  if (query.period) filter.period = query.period;
  if (query.currency) filter.currency = query.currency;
  if (manager) {
    if (query.status) filter.status = query.status;
  } else {
    // Search/status filters never expand the authenticated salary scope.
    filter.agentId = agentId ?? null;
    filter.status = query.status
      ? {
          $in: ["APPROVED", "PAID"].includes(query.status)
            ? [query.status]
            : [],
        }
      : { $in: ["APPROVED", "PAID"] };
  }
  if (query.search) {
    const escaped = payrollSearchPattern(query.search);
    filter.$or = ["agentName", "matricule", "paymentReference"].map(
      (field) => ({ [field]: { $regex: escaped, $options: "i" } }),
    );
  }
  return filter;
}
export function buildPayrollListSort(
  query: PayrollListQuery,
): Record<string, 1 | -1> {
  const direction = query.sortOrder === "asc" ? 1 : -1;
  // A GNF amount must never be compared numerically with a EUR/USD amount.
  const sort: Record<string, 1 | -1> = {};
  if (["gross", "net"].includes(query.sortBy) && !query.currency)
    sort.currency = 1;
  sort[query.sortBy] = direction;
  if (query.sortBy !== "agentName") sort.agentName = 1;
  sort._id = 1; // Stable pages when two values or two names are equal.
  return sort;
}
function serialize(row: PayrollRecord & { _id: Types.ObjectId }) {
  // Allowlist: private images, tenant IDs and internal audit data stay server-side.
  return {
    id: String(row._id),
    agentId: String(row.agentId),
    agentName: row.agentName,
    matricule: row.matricule,
    period: row.period,
    currency: row.currency,
    minorUnitDigits: row.minorUnitDigits,
    base: row.base,
    bonus: row.bonus,
    deductions: row.deductions,
    employeeRate: row.employeeRate,
    employerRate: row.employerRate,
    taxRate: row.taxRate,
    gross: row.gross,
    employeeContribution: row.employeeContribution,
    employerContribution: row.employerContribution,
    tax: row.tax,
    net: row.net,
    employerCost: row.employerCost,
    rulesNote: row.rulesNote,
    note: row.note ?? "",
    revision: row.revision,
    status: row.status,
    paymentReference: row.paymentReference,
    approvedAt: row.approvedAt,
    paidAt: row.paidAt,
    includeStamp: Boolean(row.includeStamp),
    includeSignature: Boolean(row.includeSignature),
  };
}
/** Mount only as GET / on the existing authenticated payrollRouter, after its feature guard. */
export const listPayrollController: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth || !req.tenant)
      throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
    const query = payrollListQuery.parse(req.query);
    const tenantId = req.tenant._id;
    const user = await (UserModel as Model<User>)
      .findOne({ _id: req.auth.userId, tenantId, isActive: true })
      .lean()
      .exec();
    if (!user) throw new AppError("Compte inactif.", 401, "AUTH_REQUIRED");
    const manager = ["TENANT_ADMIN", "RH_MANAGER"].includes(user.role);
    if (!manager && user.role !== "AGENT")
      throw new AppError("Accès à la paie interdit.", 403, "PAYROLL_FORBIDDEN");
    let agentId: Types.ObjectId | null = null;
    if (!manager) {
      const agent = await AgentModel.findOne({
        tenantId,
        ...(user.agentId ? { _id: user.agentId } : { userId: user._id }),
      })
        .select("_id")
        .lean()
        .exec();
      agentId = agent?._id ?? null;
      if (!agentId) {
        res.set("Cache-Control", "private, no-store").json({
          success: true,
          data: {
            items: [],
            total: 0,
            page: 1,
            limit: query.limit,
            listVersion: "payroll-table-1",
          },
        });
        return;
      }
    }
    const filter = buildPayrollListFilter(tenantId, query, manager, agentId);
    const total = await PayrollModel.countDocuments(filter).exec();
    if (query.countOnly === "1") {
      res.set("Cache-Control", "private, no-store").json({ success: true, data: {
        items: [], total, page: 1, limit: query.limit, listVersion: "payroll-table-1",
      } });
      return;
    }
    const page = Math.min(
      query.page,
      Math.max(1, Math.ceil(total / query.limit)),
    );
    const rows = await PayrollModel.find(filter)
      .select("-stampImage -signatureImage -events")
      .collation({ locale: "fr", strength: 1, numericOrdering: true })
      .sort(buildPayrollListSort(query))
      .skip((page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec();
    res.set("Cache-Control", "private, no-store").json({
      success: true,
      data: {
        items: rows.map(serialize),
        total,
        page,
        limit: query.limit,
        listVersion: "payroll-table-1",
      },
    });
  } catch (error) {
    next(error);
  }
};
