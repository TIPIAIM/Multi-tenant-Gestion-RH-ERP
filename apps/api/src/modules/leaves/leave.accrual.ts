/** Règle interne demandée : 2,5 jours par mois complet, sans expiration. */
export const MONTHLY_LEAVE_DAYS = 2.5;

function parts(key: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Date de service invalide : ${key}`);
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Date de service invalide : ${key}`);
  }
  return [year, month, day];
}

export function completedServiceMonths(start: string, through: string): number {
  const [sy, sm, sd] = parts(start);
  const [ey, em, ed] = parts(through);
  if (through < start) return 0;
  let months = (ey - sy) * 12 + em - sm;
  const anniversary = Math.min(sd, new Date(Date.UTC(ey, em, 0)).getUTCDate());
  if (ed < anniversary) months -= 1;
  return Math.max(0, months);
}

export function annualAccrual(start: string, year: number, through: string, end?: string) {
  parts(start); parts(through);
  if (end) parts(end);
  const cutoff = end && end < through ? end : through;
  const beforeYear = `${year - 1}-12-31`;
  const before = completedServiceMonths(start, beforeYear < cutoff ? beforeYear : cutoff);
  const monthlyAccruals = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const lastDay = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    const monthEnd = `${year}-${month}-${lastDay}`;
    const monthBefore = index === 0 ? beforeYear : `${year}-${String(index).padStart(2, "0")}-${new Date(Date.UTC(year, index, 0)).getUTCDate()}`;
    const afterMonths = completedServiceMonths(start, monthEnd < cutoff ? monthEnd : cutoff);
    const beforeMonths = completedServiceMonths(start, monthBefore < cutoff ? monthBefore : cutoff);
    return { month: `${year}-${month}`, days: Math.max(0, afterMonths - beforeMonths) * MONTHLY_LEAVE_DAYS };
  });
  return {
    entitledDays: monthlyAccruals.reduce((sum, entry) => sum + entry.days, 0),
    monthlyAccruals,
    // Seul l'exercice initial antérieur à 2020 utilise ce reliquat technique.
    precedingEntitlement: before * MONTHLY_LEAVE_DAYS,
  };
}

export function balanceTotal(balance: {
  openingDays: number; entitledDays: number; carriedOverDays: number;
  adjustmentDays: number; consumedDays: number;
}): number {
  return balance.openingDays + balance.entitledDays + balance.carriedOverDays + balance.adjustmentDays - balance.consumedDays;
}
