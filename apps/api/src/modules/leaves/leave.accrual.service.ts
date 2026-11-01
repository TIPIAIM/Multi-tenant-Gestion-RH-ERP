import mongoose, { Types, type ClientSession } from "mongoose";
import { AgentModel } from "../agents/agent.model.js";
import { AppError } from "../../core/errors/app-error.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import type { LeaveActor } from "./leave.access.js";
import { LeaveActivityModel, LeaveBalanceLockModel, LeaveBalanceModel, LeaveRequestModel } from "./leave.model.js";
import { annualAccrual, balanceTotal } from "./leave.accrual.js";
import { getConakryDateKey } from "./leave.time.js";
import type { LeaveBalanceDocument } from "./leave.types.js";

export async function withLeaveBalanceTransaction<T>(
  tenant: TenantDocument, agentId: Types.ObjectId, work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const key = `${tenant._id}:${agentId}`;
  // L'initialisation est extérieure à la transaction pour les tout premiers accès concurrents.
  try {
    await LeaveBalanceLockModel.updateOne({ _id: key }, { $setOnInsert: { revision: 0 } }, { upsert: true }).exec();
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      await LeaveBalanceLockModel.updateOne({ _id: key }, { $inc: { revision: 1 } }, { session }).exec();
      result = await work(session);
    });
    return result as T;
  } finally { await session.endSession(); }
}

/** Recalcul déterministe : aucune addition de 2,5 au gré des actualisations. */
export async function synchronizeAnnualLeave(
  tenant: TenantDocument, actor: LeaveActor, agentId: Types.ObjectId, session: ClientSession,
  today = getConakryDateKey(),
): Promise<LeaveBalanceDocument> {
  const agent = await AgentModel.findOne({ _id: agentId, tenantId: tenant._id })
    .select("employmentStartDate employmentEndDate employmentStatus").session(session).lean().exec();
  if (!agent?.employmentStartDate || Number.isNaN(new Date(agent.employmentStartDate).getTime())) {
    throw new AppError("La date de prise de fonction de l'Agent doit être renseignée pour calculer ses congés.", 400, "LEAVE_SERVICE_START_REQUIRED");
  }
  const start = getConakryDateKey(new Date(agent.employmentStartDate));
  const end = agent.employmentEndDate ? getConakryDateKey(new Date(agent.employmentEndDate)) : undefined;
  if (agent.employmentStatus === "LEFT" && !end) {
    throw new AppError("Renseignez la date de fin de service de l'Agent sorti avant de calculer ses congés.", 400, "LEAVE_SERVICE_END_REQUIRED");
  }
  const currentYear = Number(today.slice(0, 4));
  const balances = await LeaveBalanceModel.find({ tenantId: tenant._id, agentId, leaveType: "ANNUAL_LEAVE", calendarYear: { $lte: currentYear } })
    .sort({ calendarYear: 1 }).session(session).exec();
  const firstExisting = balances[0];
  const firstYear = Math.max(2020, Math.min(firstExisting?.calendarYear ?? Number(start.slice(0, 4)), currentYear));
  const byYear = new Map(balances.map(balance => [balance.calendarYear, balance]));
  let carry = 0;
  let current: LeaveBalanceDocument | undefined;
  for (let year = firstYear; year <= currentYear; year += 1) {
    const earned = annualAccrual(start, year, today, end);
    let balance = byYear.get(year);
    const migrated = Boolean(balance && balance.accrualVersion !== 1);
    if (year === firstYear) {
      // Le report du premier solde existant est le seul report manuel importé.
      // Les reports des exercices suivants sont dérivés, jamais additionnés deux fois.
      carry = balance?.legacySnapshot
        ? balance.legacySnapshot.carriedOverDays
        : balance && balance.accrualVersion !== 1
          ? balance.carriedOverDays
          : earned.precedingEntitlement;
    }
    if (!balance) {
      balance = new LeaveBalanceModel({
        tenantId: tenant._id, agentId, calendarYear: year, leaveType: "ANNUAL_LEAVE",
        openingDays: 0, entitledDays: 0, carriedOverDays: 0, adjustmentDays: 0,
        consumedDays: 0, updatedByUserId: actor.userId,
      });
    }
    const isNew = balance.isNew;
    const beforeEntitlement = balance.entitledDays;
    if (migrated) {
      balance.legacySnapshot = {
        openingDays: balance.openingDays, entitledDays: balance.entitledDays,
        carriedOverDays: balance.carriedOverDays, adjustmentDays: balance.adjustmentDays,
        consumedDays: balance.consumedDays,
      };
    }
    const changed = isNew || migrated || balance.entitledDays !== earned.entitledDays ||
      balance.carriedOverDays !== carry || balance.accrualStartDate !== start;
    balance.entitledDays = earned.entitledDays;
    balance.carriedOverDays = carry;
    balance.accrualVersion = 1;
    balance.accrualStartDate = start;
    if (changed) {
      balance.accrualAsOfDate = today;
      balance.updatedByUserId = actor.userId;
      await balance.save({ session });
      await LeaveActivityModel.create([{
        tenantId: tenant._id, agentId, leaveBalanceId: balance._id,
        actorUserId: actor.userId, actorName: actor.fullName, action: "BALANCE_ACCRUED",
        summary: migrated ? "Passage au calcul automatique des congés par mois complet de service." : "Droits acquis et report de congés recalculés automatiquement.",
        metadata: { calendarYear: year, previousEntitledDays: beforeEntitlement, entitledDays: earned.entitledDays, carriedOverDays: carry, asOfDate: today, monthlyAccruals: earned.monthlyAccruals },
      }], { session });
    }
    carry = balanceTotal(balance);
    current = balance;
  }
  if (!current) throw new AppError("Impossible de calculer le solde annuel.", 500, "LEAVE_ACCRUAL_FAILED");
  return current;
}

export async function reservedAnnualLeave(
  tenant: TenantDocument, agentId: Types.ObjectId, session?: ClientSession, excludeRequestId?: Types.ObjectId,
): Promise<number> {
  const aggregate = LeaveRequestModel.aggregate<{ total: number }>([
    { $match: { tenantId: tenant._id, agentId, leaveType: "ANNUAL_LEAVE", status: { $in: ["SUBMITTED", "MANAGER_APPROVED", "RH_APPROVED"] }, ...(excludeRequestId ? { _id: { $ne: excludeRequestId } } : {}) } },
    { $group: { _id: null, total: { $sum: "$requestedDays" } } },
  ]);
  if (session) aggregate.session(session);
  return (await aggregate.exec())[0]?.total ?? 0;
}
