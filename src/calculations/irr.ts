import { CONFIG } from '../core/config';

/**
 * Cash flow for IRR calculation
 */
export interface IRRCashFlow {
  date: string;
  amount: number;
}

/**
 * Parse date string to timestamp, forcing local timezone interpretation.
 * Appends T00:00:00 to prevent JavaScript from parsing date-only strings as UTC.
 */
function parseDateLocal(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getTime();
}

/**
 * Calculate IRR (Internal Rate of Return) using Newton-Raphson method
 * @param cashFlows - Array of {date, amount} objects
 * @param guess - Initial guess for IRR
 * @returns IRR as decimal (e.g., 0.15 for 15%) or null if cannot converge
 */
export function calculateIRR(cashFlows: IRRCashFlow[], guess: number = CONFIG.IRR_GUESS): number | null {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;

  // Pre-parse all dates once to avoid repeated parsing in the Newton-Raphson loop
  const flowsWithTime = cashFlows.map((cf) => ({
    amount: cf.amount,
    timestamp: parseDateLocal(cf.date),
  }));
  flowsWithTime.sort((a, b) => a.timestamp - b.timestamp);

  const firstFlow = flowsWithTime[0];
  const lastFlow = flowsWithTime[flowsWithTime.length - 1];
  if (!firstFlow || !lastFlow) return null;
  const firstDateTime = firstFlow.timestamp;
  const lastDateTime = lastFlow.timestamp;

  // IRR requires meaningful time elapsed to calculate an annualized rate
  // With very short periods, small gains/losses produce extreme annualized rates
  // that are mathematically correct but practically meaningless
  const daysDiff = (lastDateTime - firstDateTime) / (24 * 60 * 60 * 1000);
  if (daysDiff < CONFIG.IRR_MIN_DAYS) {
    return null;
  }

  // Pre-compute yearsDiff for each flow (avoids repeated calculation in loop)
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const flowsWithYears = flowsWithTime.map((f) => ({
    amount: f.amount,
    yearsDiff: (f.timestamp - firstDateTime) / msPerYear,
  }));

  const npv = (rate: number): number =>
    flowsWithYears.reduce((acc, cf) => {
      return acc + cf.amount / Math.pow(1 + rate, cf.yearsDiff);
    }, 0);

  const dNpv = (rate: number): number =>
    flowsWithYears.reduce((acc, cf) => {
      if (cf.yearsDiff === 0) return acc;
      return acc - (cf.yearsDiff * cf.amount) / Math.pow(1 + rate, cf.yearsDiff + 1);
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
