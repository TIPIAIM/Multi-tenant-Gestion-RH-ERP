export type PayrollAmounts = {
  base: number;
  bonus: number;
  deductions: number;
  employeeRate: number;
  employerRate: number;
  taxRate: number;
};
export function calculatePayroll(input: PayrollAmounts) {
  // Amounts are integer minor units; rates are basis points (100 = 1%).
  if (![input.base,input.bonus,input.deductions,input.employeeRate,input.employerRate,input.taxRate].every(value => Number.isSafeInteger(value) && value >= 0) ||
      [input.employeeRate,input.employerRate,input.taxRate].some(rate => rate > 10_000)) {
    throw new Error("Montants ou taux invalides.");
  }
  const gross = input.base + input.bonus;
  if (!Number.isSafeInteger(gross)) throw new Error("Montant brut trop élevé.");
  // Exact integer arithmetic avoids floating point errors at rounding boundaries.
  const contribution = (base: number, rate: number) => Number((BigInt(base) * BigInt(rate) + 5_000n) / 10_000n);
  const employeeContribution = contribution(gross, input.employeeRate);
  const employerContribution = contribution(gross, input.employerRate);
  const taxable = Math.max(0, gross - employeeContribution);
  const tax = contribution(taxable, input.taxRate);
  const net = gross - employeeContribution - tax - input.deductions;
  if (
    ![
      gross,
      employeeContribution,
      employerContribution,
      tax,
      net,
      gross + employerContribution,
    ].every(Number.isSafeInteger) ||
    net < 0
  ) {
    throw new Error(
      "Le net à payer doit être positif ou nul ; vérifiez les retenues et les taux.",
    );
  }
  return {
    gross,
    employeeContribution,
    employerContribution,
    tax,
    net,
    employerCost: gross + employerContribution,
  };
}
