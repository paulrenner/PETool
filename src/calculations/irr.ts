import { CONFIG } from '../core/config';

/**
 * Cash flow for IRR calculation
 */
export interface IRRCashFlow {
  date: string;
  amount: number;
}

/**
 * Calculate IRR (Internal Rate of Return) using Newton-Raphson method
 * @param cashFlows - Array of {date, amount} objects
 * @param guess - Initial guess for IRR
 * @returns IRR as decimal (e.g., 0.15 for 15%) or null if cannot converge
 */
export function calculateIRR(cashFlows: IRRCashFlow[], guess: number = CONFIG.IRR_GUESS): number | null {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;

  const flows = [...cashFlows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const firstDate = new Date(flows[0]!.date);

  const npv = (rate: number): number =>
    flows.reduce((acc, cf) => {
      const yearsDiff =
        (new Date(cf.date).getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return acc + cf.amount / Math.pow(1 + rate, yearsDiff);
    }, 0);

  const dNpv = (rate: number): number =>
    flows.reduce((acc, cf) => {
      const yearsDiff =
        (new Date(cf.date).getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (yearsDiff === 0) return acc;
      return acc - (yearsDiff * cf.amount) / Math.pow(1 + rate, yearsDiff + 1);
    }, 0);

  let rate = guess;

  for (let i = 0; i < CONFIG.IRR_MAX_ITERATIONS; i++) {
    const npvValue = npv(rate);
    const derivativeValue = dNpv(rate);

    if (Math.abs(npvValue) < CONFIG.IRR_PRECISION) {
      if (rate > CONFIG.IRR_MAX_RATE || rate < CONFIG.IRR_MIN_RATE) return null;
      return rate;
    }
    if (Math.abs(derivativeValue) < CONFIG.IRR_PRECISION) return null;

    const newRate = rate - npvValue / derivativeValue;
    if (Math.abs(newRate - rate) < CONFIG.IRR_PRECISION) {
      if (newRate > CONFIG.IRR_MAX_RATE || newRate < CONFIG.IRR_MIN_RATE) return null;
      return newRate;
    }

    rate = newRate;
  }

  return null;
}

/**
 * Calculate MOIC (Multiple on Invested Capital)
 * @param cashFlows - Array of {date, amount} objects
 * @returns MOIC as decimal or null
 */
export function calculateMOIC(cashFlows: IRRCashFlow[]): number | null {
  if (!Array.isArray(cashFlows) || cashFlows.length === 0) return null;

  const contributions = cashFlows
    .filter((f) => f.amount < 0)
    .reduce((sum, f) => sum + Math.abs(f.amount), 0);

  const distributions = cashFlows
    .filter((f) => f.amount > 0)
    .reduce((sum, f) => sum + f.amount, 0);

  // Cannot calculate meaningful MOIC without contributions
  if (contributions === 0) return null;
  return distributions / contributions;
}
