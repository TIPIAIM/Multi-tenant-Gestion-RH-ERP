import { listPayrollController } from "./payroll-list.controller.js";
import {
  getTenantDocumentMarks,
  loadTenantDocumentMark,
} from "../settings/settings-document-marks.js";
import { z } from "zod";
import { getPublicTenantSettings } from "../settings/settings.service.js";
import {
  loadPayslipLogo,
  payslipFilename,
  payslipMarkBytes,
  renderPayslipPdf,
} from "./payroll.pdf.js";
import {
  assertPayrollShareable,
  getPayrollRecipients,
  getPayrollDiscussions,
  sharePayroll,
} from "./payroll-sharing.service.js";
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
    stampImage: undefined,
    signatureImage: undefined,
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
payrollRouter.get("/", listPayrollController);
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
      { returnDocument: "after" },
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
      returnDocument: "after",
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

// The PDF is generated from server-side amounts and published company settings.
payrollRouter.get(
  ["/:id/pdf", "/:id/marks/:kind"],
  handle(async (req, res) => {
    const c = await actor(req);
    const id = payrollId.parse(req.params.id);
    const row = await PayrollModel.findOne({ _id: id, tenantId: c.tenantId })
      .select("+stampImage +signatureImage")
      .lean()
      .exec();
    if (!row)
      throw new AppError("Bulletin introuvable.", 404, "PAYROLL_NOT_FOUND");
    if (!c.manager) {
      const linkedToThisAgent =
        !c.user.agentId || String(c.user.agentId) === String(row.agentId);
      const own =
        linkedToThisAgent &&
        (await (AgentModel as any).exists({
          _id: row.agentId,
          tenantId: c.tenantId,
          ...(c.user.agentId ? {} : { userId: c.user._id }),
        }));
      if (!own) throw new AppError("Accès interdit.", 403, "PAYROLL_FORBIDDEN");
      assertPayrollShareable(row);
    }
    if (
      req.query.revision !== undefined &&
      z.coerce.number().int().min(0).parse(req.query.revision) !== row.revision
    )
      throw new AppError(
        "Le bulletin a changé. Rechargez-le avant de télécharger.",
        409,
        "PAYROLL_CONFLICT",
      );
    if (req.params.kind) {
      const kind = z.enum(["stamp", "signature"]).parse(req.params.kind);
      const enabled =
        kind === "stamp" ? row.includeStamp : row.includeSignature;
      const image = payslipMarkBytes(
        kind === "stamp" ? row.stampImage : row.signatureImage,
      );
      if (!enabled || !image)
        throw new AppError(
          "Visuel absent de ce bulletin.",
          404,
          "PAYROLL_MARK_NOT_FOUND",
        );
      res
        .set({
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .send(Buffer.from(image));
      return;
    }
    const settings = await getPublicTenantSettings(req.tenant!);
    const pdf = await renderPayslipPdf(
      row,
      id,
      settings,
      await loadPayslipLogo(settings),
    );
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${payslipFilename(row)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(pdf);
  }),
);
payrollRouter.get(
  "/:id/share-options",
  handle(async (req, res) => {
    const c = await actor(req);
    requireManager(c.manager);
    const row = await PayrollModel.findOne({
      _id: payrollId.parse(req.params.id),
      tenantId: c.tenantId,
    })
      .lean()
      .exec();
    if (!row)
      throw new AppError("Bulletin introuvable.", 404, "PAYROLL_NOT_FOUND");
    assertPayrollShareable(row);
    const recipients = await getPayrollRecipients(
      c.tenantId,
      row.agentId,
      String(c.user._id),
    );
    const discussions = await getPayrollDiscussions(
      c.tenantId,
      String(c.user._id),
      recipients.map((r) => r.id),
    );
    res
      .set("Cache-Control", "private, no-store")
      .json({ success: true, data: { recipients, discussions } });
  }),
);
const shareInput = z
  .object({
    revision: z.number().int().min(0),
    recipientUserId: payrollId,
    discussionId: payrollId.optional(),
    requestId: z.uuid(),
    message: z.string().trim().max(1000).optional(),
  })
  .strict();
payrollRouter.post(
  "/:id/share",
  handle(async (req, res) => {
    const c = await actor(req);
    requireManager(c.manager);
    const data = shareInput.parse(req.body);
    const result = await sharePayroll({
      ...data,
      tenant: req.tenant!,
      actor: { userId: String(c.user._id), role: c.user.role },
      payrollId: payrollId.parse(req.params.id),
    });
    res.json({ success: true, data: result });
  }),
);

// Explicit RH choice; this changes presentation only, never payroll amounts.
payrollRouter.patch(
  "/:id/presentation",
  handle(async (req, res) => {
    const c = await actor(req);
    requireManager(c.manager);
    const id = payrollId.parse(req.params.id);
    const data = z
      .object({
        revision: z.number().int().min(0),
        marksRevision: z.number().int().min(0),
        includeStamp: z.boolean(),
        includeSignature: z.boolean(),
      })
      .strict()
      .parse(req.body);
    const original = await PayrollModel.findOne({
      _id: id,
      tenantId: c.tenantId,
      revision: data.revision,
      status: { $in: ["APPROVED", "PAID"] },
    })
      .lean()
      .exec();
    if (!original)
      throw new AppError(
        "Validez le bulletin ou rechargez sa dernière révision.",
        409,
        "PAYROLL_CONFLICT",
      );
    const checkMarks = async () => {
      if (
        (await getTenantDocumentMarks(c.tenantId)).revision !==
        data.marksRevision
      )
        throw new AppError(
          "Les visuels de l’entreprise ont changé. Rechargez le bulletin.",
          409,
          "DOCUMENT_MARK_CONFLICT",
        );
    };
    await checkMarks();
    const [stamp, signature] = await Promise.all([
      data.includeStamp
        ? loadTenantDocumentMark(c.tenantId, "stamp")
        : undefined,
      data.includeSignature
        ? loadTenantDocumentMark(c.tenantId, "signature")
        : undefined,
    ]);
    await checkMarks();
    const row = await PayrollModel.findOneAndUpdate(
      {
        _id: id,
        tenantId: c.tenantId,
        revision: data.revision,
        status: { $in: ["APPROVED", "PAID"] },
      },
      {
        $set: {
          includeStamp: data.includeStamp,
          includeSignature: data.includeSignature,
          ...(stamp ? { stampImage: stamp } : {}),
          ...(signature ? { signatureImage: signature } : {}),
        },
        ...(!stamp || !signature
          ? {
              $unset: {
                ...(!stamp ? { stampImage: 1 } : {}),
                ...(!signature ? { signatureImage: 1 } : {}),
              },
            }
          : {}),
        $inc: { revision: 1 },
        $push: {
          events: {
            action: "DOCUMENT_PRESENTATION",
            actorId: c.user._id,
            at: new Date(),
          },
        },
      },
      { returnDocument: "after" },
    ).exec();
    if (!row)
      throw new AppError(
        "Le bulletin a changé. Rechargez-le.",
        409,
        "PAYROLL_CONFLICT",
      );
    res.json({ success: true, data: { payroll: serialize(row) } });
  }),
);
