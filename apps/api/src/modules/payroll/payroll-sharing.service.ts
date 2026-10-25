import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { UserModel } from "../users/user.model.js";
import {
  PieceTransferModel,
  PieceTransferRecipientModel,
} from "../piece-transfers/piece-transfer.model.js";
import {
  createPieceTransfer,
  sendPieceTransferMessage,
} from "../piece-transfers/piece-transfer.service.js";
import {
  PayrollDeliveryModel,
  PayrollModel,
  type PayrollRecord,
} from "./payroll.model.js";
import { getPublicTenantSettings } from "../settings/settings.service.js";
import {
  loadPayslipLogo,
  payslipFilename,
  renderPayslipPdf,
} from "./payroll.pdf.js";
import type { TenantDocument } from "../tenants/tenant.types.js";

type Sender = { userId: string; role: string };
export function assertPayrollShareable(row: Pick<PayrollRecord, "status">) {
  if (row.status !== "APPROVED" && row.status !== "PAID") {
    throw new AppError(
      "Validez le bulletin avant de le partager.",
      409,
      "PAYROLL_NOT_APPROVED",
    );
  }
}
export async function getPayrollRecipients(
  tenantId: Types.ObjectId,
  agentId: Types.ObjectId,
  senderId: string,
): Promise<{ id: string; fullName: string; email: string }[]> {
  const agent = await (AgentModel as any)
    .findOne({ _id: agentId, tenantId })
    .select("_id userId")
    .lean()
    .exec();
  if (!agent) throw new AppError("Agent introuvable.", 404, "AGENT_NOT_FOUND");
  // Explicit links only: an email resemblance must never grant access to a salary.
  const users = await (UserModel as any)
    .find({
      tenantId,
      isActive: true,
      _id: { $ne: senderId },
      $or: [
        { agentId: agent._id },
        ...(agent.userId ? [{ _id: agent.userId, agentId: null }] : []),
      ],
    })
    .select("_id fullName email")
    .sort({ fullName: 1, _id: 1 })
    .lean()
    .exec();
  return users.map(
    (u: { _id: Types.ObjectId; fullName: string; email: string }) => ({
      id: String(u._id),
      fullName: u.fullName,
      email: u.email,
    }),
  );
}

/** Check the actual members, not just the conversation's recipient counter. */
export async function getPayrollDiscussions(
  tenantId: Types.ObjectId,
  senderId: string,
  recipientIds: string[],
) {
  if (!recipientIds.length) return [];
  const related = await PieceTransferRecipientModel.find({
    tenantId,
    status: "ACTIVE",
    $or: [
      { senderUserId: senderId, recipientUserId: { $in: recipientIds } },
      { senderUserId: { $in: recipientIds }, recipientUserId: senderId },
    ],
  })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(200)
    .select("transferId")
    .lean()
    .exec();
  const candidates = await PieceTransferModel.find({
    _id: { $in: related.map((r) => r.transferId) },
    tenantId,
    status: "ACTIVE",
    audienceMode: "SELECTED",
    recipientCount: 1,
    $or: [{ senderUserId: senderId }, { senderUserId: { $in: recipientIds } }],
  })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(200)
    .lean()
    .exec();
  const members = await PieceTransferRecipientModel.find({
    tenantId,
    transferId: { $in: candidates.map((c) => c._id) },
  })
    .select("transferId recipientUserId status")
    .lean()
    .exec();
  return candidates.flatMap((c) => {
    const rows = members.filter((m) => String(m.transferId) === String(c._id));
    if (rows.length !== 1 || rows[0]?.status !== "ACTIVE") return [];
    const author = String(c.senderUserId),
      recipient = String(rows[0].recipientUserId);
    const other =
      author === senderId ? recipient : recipient === senderId ? author : "";
    return recipientIds.includes(other)
      ? [{ id: String(c._id), title: c.title, recipientUserId: other }]
      : [];
  });
}

export async function sharePayroll(input: {
  tenant: TenantDocument;
  actor: Sender;
  payrollId: string;
  revision: number;
  recipientUserId: string;
  discussionId?: string;
  requestId: string;
  message?: string;
}) {
  if (!["TENANT_ADMIN", "RH_MANAGER"].includes(input.actor.role))
    throw new AppError("Action réservée aux RH.", 403, "PAYROLL_FORBIDDEN");
  const tenantId = input.tenant._id;
  const row = await PayrollModel.findOne({ _id: input.payrollId, tenantId })
    .select("+stampImage +signatureImage")
    .lean()
    .exec();
  if (!row)
    throw new AppError("Bulletin introuvable.", 404, "PAYROLL_NOT_FOUND");
  assertPayrollShareable(row);
  if (row.revision !== input.revision)
    throw new AppError(
      "Le bulletin a changé. Rechargez-le avant de partager.",
      409,
      "PAYROLL_CONFLICT",
    );
  const recipients = await getPayrollRecipients(
    tenantId,
    row.agentId,
    input.actor.userId,
  );
  if (!recipients.some((r) => r.id === input.recipientUserId))
    throw new AppError(
      "Choisissez un compte actif lié à cet agent.",
      403,
      "PAYROLL_RECIPIENT_FORBIDDEN",
    );
  if (input.discussionId) {
    const discussions = await getPayrollDiscussions(
      tenantId,
      input.actor.userId,
      [input.recipientUserId],
    );
    if (!discussions.some((d) => d.id === input.discussionId))
      throw new AppError(
        "Cette discussion n’est pas une discussion privée avec cet agent.",
        403,
        "PAYROLL_DISCUSSION_FORBIDDEN",
      );
  }
  await PayrollDeliveryModel.init();
  const previous = await PayrollDeliveryModel.findOne({
    tenantId,
    actorId: input.actor.userId,
    requestId: input.requestId,
  })
    .lean()
    .exec();
  if (previous) {
    if (
      String(previous.payrollId) !== input.payrollId ||
      String(previous.recipientUserId) !== input.recipientUserId ||
      previous.destinationId !== input.discussionId ||
      previous.revision !== input.revision
    )
      throw new AppError(
        "Cet envoi correspond à une autre demande.",
        409,
        "PAYROLL_DELIVERY_CONFLICT",
      );
    if (previous.status === "COMPLETED")
      return { transferId: previous.transferId!, alreadySent: true };
    throw new AppError(
      "Cet envoi a déjà été lancé. Vérifiez la discussion avant de recommencer.",
      409,
      "PAYROLL_DELIVERY_PENDING",
    );
  }
  // Render before reserving the delivery: configuration errors do not consume a request.
  const settings = await getPublicTenantSettings(input.tenant);
  const pdf = await renderPayslipPdf(
    row,
    input.payrollId,
    settings,
    await loadPayslipLogo(settings),
  );
  if (
    !(await PayrollModel.exists({
      _id: row._id,
      tenantId,
      revision: input.revision,
      status: { $in: ["APPROVED", "PAID"] },
    }))
  )
    throw new AppError(
      "Le bulletin a changé. Rechargez-le.",
      409,
      "PAYROLL_CONFLICT",
    );
  let delivery;
  try {
    delivery = await PayrollDeliveryModel.create({
      tenantId,
      payrollId: row._id,
      actorId: input.actor.userId,
      recipientUserId: input.recipientUserId,
      requestId: input.requestId,
      destinationId: input.discussionId,
      revision: input.revision,
      status: "PENDING",
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new AppError(
        "Cet envoi est déjà en cours. Vérifiez la discussion.",
        409,
        "PAYROLL_DELIVERY_PENDING",
      );
    throw error;
  }
  const file = {
    originalname: payslipFilename(row),
    mimetype: "application/pdf",
    buffer: pdf,
    size: pdf.length,
  } as Express.Multer.File;
  const text = [
    `Bulletin de paie · ${row.period} · ${row.agentName}`,
    input.message,
  ]
    .filter(Boolean)
    .join("\n");
  let transferId: string;
  try {
    if (input.discussionId) {
      await sendPieceTransferMessage({
        tenant: input.tenant,
        actor: input.actor,
        transferId: input.discussionId,
        metadata: { body: text },
        files: [file],
      });
      transferId = input.discussionId;
    } else {
      const created = await createPieceTransfer({
        tenant: input.tenant,
        actor: input.actor,
        metadata: {
          title: "",
          description: text,
          audienceMode: "SELECTED",
          recipientUserIds: [input.recipientUserId],
        },
        file,
      });
      transferId = created.id;
    }
  } catch (error) {
    // No automatic retry of a salary delivery after a network/storage failure.
    await PayrollDeliveryModel.updateOne(
      { _id: delivery._id },
      { $set: { status: "FAILED" } },
    ).exec();
    throw error;
  }
  // If this write fails, the receipt stays PENDING: retries must not duplicate the message.
  await PayrollDeliveryModel.updateOne(
    { _id: delivery._id },
    { $set: { status: "COMPLETED", transferId, completedAt: new Date() } },
  ).exec();
  return { transferId, alreadySent: false };
}
