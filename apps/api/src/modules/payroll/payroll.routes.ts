import { requireTrustedMutationOrigin } from "../../middlewares/mutation-origin.middleware.js";
import type { QueryFilter, UpdateQuery } from "mongoose";
import { Router, type Request, type RequestHandler } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { tenantContextMiddleware } from "../../middlewares/tenant-context.middleware.js";
import { requireTenantFeature } from "../../middlewares/feature.middleware.js";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { UserModel } from "../users/user.model.js";
import { PayrollModel, type PayrollRecord } from "./payroll.model.js";
import { calculatePayroll } from "./payroll.calculation.js";
import {
  payrollId,
  payrollInput,
  payrollPeriod,
  payrollTransition,
  payrollUpdate,
} from "./payroll.schema.js";
export const payrollRouter = Router();
payrollRouter.use(
  requireAuth,
  tenantContextMiddleware,
  requireTenantFeature("payroll"),
);
payrollRouter.use(requireTrustedMutationOrigin);
async function actor(request: Request) {
  if (!request.tenant || !request.auth)
    throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
  const user = await (UserModel as any)
    .findOne({
      _id: request.auth.userId,
      tenantId: request.tenant._id,
      isActive: true,
    })
    .lean()
    .exec();
  if (!user) throw new AppError("Compte inactif.", 401, "AUTH_REQUIRED");
  const manager = ["TENANT_ADMIN", "RH_MANAGER"].includes(user.role);
  if (!manager && user.role !== "AGENT")
    throw new AppError("Accès à la paie interdit.", 403, "PAYROLL_FORBIDDEN");
  return { user, manager, tenantId: request.tenant._id };
}
function requireManager(manager: boolean) {
  if (!manager)
    throw new AppError(
      "Action réservée à l’administration et aux RH.",
      403,
      "PAYROLL_FORBIDDEN",
    );
}
const handle =
  (fn: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error: any) {
      if (error?.code === 11000)
        next(
          new AppError(
            "Un bulletin existe déjà pour cet agent et cette période.",
            409,
            "PAYROLL_DUPLICATE",
          ),
        );
      else next(error);
    }
  };
function serialize(row: any) {
  const value = row.toObject ? row.toObject() : row;
  return {
    ...value,
    id: value._id.toString(),
    agentId: value.agentId.toString(),
    _id: undefined,
    tenantId: undefined,
    __v: undefined,
  };
}
function totals(data: Parameters<typeof calculatePayroll>[0]) {
  try {
    return calculatePayroll(data);
  } catch (error) {
    throw new AppError(
      (error as Error).message,
      400,
      "PAYROLL_AMOUNTS_INVALID",
    );
  }
}
payrollRouter.get(
  "/agents",
  handle(async (req, res) => {
    const context = await actor(req);
    requireManager(context.manager);
    const search = String(req.query.search ?? "")
      .trim()
      .slice(0, 100)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = {
      tenantId: context.tenantId,
      ...(search
        ? {
            $or: ["firstName", "lastName", "matricule"].map((key) => ({
              [key]: { $regex: search, $options: "i" },
            })),
          }
        : {}),
    };
    const rows = await (AgentModel as any)
      .find(filter)
      .select("firstName lastName matricule")
      .sort({ lastName: 1, _id: 1 })
      .limit(50)
      .lean()
      .exec();
    res.json({
      success: true,
      data: {
        items: rows.map((a: any) => ({
          id: a._id.toString(),
          fullName: `${a.firstName} ${a.lastName}`,
          matricule: a.matricule,
        })),
      },
    });
  }),
);
payrollRouter.get(
  "/",
  handle(async (req, res) => {
    const c = await actor(req);
    const period = req.query.period
      ? payrollPeriod.parse(req.query.period)
      : undefined;
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(req.query.page)) || 1),
    );
    const limit = 20;
    const filter: Record<string, unknown> = {
      tenantId: c.tenantId,
      ...(period ? { period } : {}),
    };
    if (!c.manager) {
      const agent = await (AgentModel as any)
        .findOne({
          tenantId: c.tenantId,
          ...(c.user.agentId
            ? { _id: c.user.agentId }
            : { userId: c.user._id }),
        })
        .select("_id")
        .lean()
        .exec();
      if (!agent) {
        res.json({ success: true, data: { items: [], total: 0, page, limit } });
        return;
      }
      filter.agentId = agent._id;
      filter.status = { $in: ["APPROVED", "PAID"] };
    }
    const [rows, total] = await Promise.all([
      PayrollModel.find(filter)
        .sort({ period: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      PayrollModel.countDocuments(filter).exec(),
    ]);
    res.json({
      success: true,
      data: { items: rows.map(serialize), total, page, limit },
    });
  }),
);
payrollRouter.post(
  "/",
  handle(async (req, res) => {
    const c = await actor(req);
    requireManager(c.manager);
    const data = payrollInput.parse(req.body);
    const agent = await (AgentModel as any)
      .findOne({ _id: data.agentId, tenantId: c.tenantId })
      .lean()
      .exec();
    if (!agent)
      throw new AppError("Agent introuvable.", 404, "AGENT_NOT_FOUND");
    const row = await PayrollModel.create({
      ...data,
      ...totals(data),
      tenantId: c.tenantId,
      agentName: `${agent.firstName} ${agent.lastName}`,
      matricule: agent.matricule,
      minorUnitDigits: ["GNF", "XOF", "XAF"].includes(data.currency) ? 0 : 2,
      createdBy: c.user._id,
      events: [{ action: "CREATED", actorId: c.user._id, at: new Date() }],
    });
    res.status(201).json({ success: true, data: { payroll: serialize(row) } });
  }),
);
payrollRouter.patch(
  "/:id",
  handle(async (req, res) => {
    const c = await actor(req);
    requireManager(c.manager);
    const id = payrollId.parse(req.params.id);
    const { revision, ...data } = payrollUpdate.parse(req.body);
    const row = await PayrollModel.findOneAndUpdate(
      { _id: id, tenantId: c.tenantId, status: "DRAFT", revision },
      {
        $set: { ...data, ...totals(data) },
        $inc: { revision: 1 },
        $push: {
          events: { action: "UPDATED", actorId: c.user._id, at: new Date() },
        },
      },
      { new: true },
    ).exec();
    if (!row)
      throw new AppError(
        "Le bulletin a changé ou n’est plus modifiable. Rechargez la liste.",
        409,
        "PAYROLL_CONFLICT",
      );
    res.json({ success: true, data: { payroll: serialize(row) } });
  }),
);
payrollRouter.post(
  "/:id/transition",
  handle(async (req, res) => {
    const c = await actor(req);
    requireManager(c.manager);
    const id = payrollId.parse(req.params.id);
    const data = payrollTransition.parse(req.body);
    const now = new Date();
    if (data.action === "PAY" && !data.paymentReference)
      throw new AppError(
        "Indiquez la référence du paiement effectué.",
        400,
        "PAYMENT_REFERENCE_REQUIRED",
      );
    // Immutable amount snapshot after approval; each transition is an atomic compare-and-swap.
    const from =
      data.action === "APPROVE"
        ? "DRAFT"
        : data.action === "PAY"
          ? "APPROVED"
          : { $in: ["DRAFT", "APPROVED"] as const };
    const update =
      data.action === "APPROVE"
        ? {
            status: "APPROVED" as const,
            approvedBy: c.user._id,
            approvedAt: now,
          }
        : data.action === "PAY"
          ? {
              status: "PAID" as const,
              paidBy: c.user._id,
              paidAt: now,
              paymentReference: data.paymentReference,
            }
          : { status: "CANCELLED" as const };
    const filter: QueryFilter<PayrollRecord> = {
      _id: id,
      tenantId: c.tenantId,
      status: from,
      revision: data.revision,
    };
    const updateDoc: UpdateQuery<PayrollRecord> = {
      $set: update,
      $inc: { revision: 1 },
      $push: { events: { action: data.action, actorId: c.user._id, at: now } },
    };
    const row = await PayrollModel.findOneAndUpdate(filter, updateDoc, {
      new: true,
    }).exec();
    if (!row)
      throw new AppError(
        "Transition impossible : rechargez le bulletin.",
        409,
        "PAYROLL_CONFLICT",
      );
    res.json({ success: true, data: { payroll: serialize(row) } });
  }),
);
