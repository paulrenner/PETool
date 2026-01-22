import type { Fund, FundMetrics } from '../types';
import { AppState } from '../core/state';
import { isValidDate } from '../utils/validation';
import { parseCurrency } from '../utils/formatting';
import { calculateIRR, calculateMOIC, type IRRCashFlow } from './irr';

/**
 * Get vintage year (first contribution year)
 */
export function getVintageYear(fund: Fund): number | null {
  const contributions = (fund.cashFlows || [])
    .filter((cf) => cf.type === 'Contribution' && isValidDate(cf.date))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return contributions.length > 0 ? new Date(contributions[0]!.date).getFullYear() : null;
}

/**
 * Get total contributions or distributions by type
 */
export function getTotalByType(
  fund: Fund,
  type: 'Contribution' | 'Distribution',
  cutoffDate?: Date
): number {
  const flows = fund.cashFlows || [];

  return flows
    .filter(
      (cf) =>
        cf.type === type &&
        isValidDate(cf.date) &&
        (!cutoffDate || new Date(cf.date) <= cutoffDate)
    )
    .reduce((sum, cf) => sum + Math.abs(parseCurrency(cf.amount) || 0), 0);
}

/**
 * Get latest NAV adjusted for subsequent cash flows
 *
 * NAV (Net Asset Value) represents the current market value of portfolio assets.
 * When adjusting for cash flows after the NAV date:
 * - Contributions ADD to NAV (fund receives cash, increasing assets)
 * - Distributions SUBTRACT from NAV (fund pays out cash, decreasing assets)
 *
 * Note: This is an estimate. True NAV requires updated portfolio valuations.
 */
export function getLatestNav(fund: Fund, cutoffDate?: Date): number {
  const navs = (fund.monthlyNav || [])
    .filter((n) => isValidDate(n.date) && (!cutoffDate || new Date(n.date) <= cutoffDate))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (navs.length === 0) return 0;

  const latestNav = navs[0]!;
  let navAmount = parseCurrency(latestNav.amount) || 0;
  const navDate = new Date(latestNav.date);

  // Adjust for cash flows after NAV date
  const subsequentFlows = (fund.cashFlows || []).filter((cf) => {
    if (!isValidDate(cf.date)) return false;
    const cfDate = new Date(cf.date);
    return cfDate > navDate && (!cutoffDate || cfDate <= cutoffDate);
  });

  subsequentFlows.forEach((cf) => {
    const amount = parseCurrency(cf.amount) || 0;
    if (cf.type === 'Contribution') {
      // Contribution: fund receives cash → assets increase → NAV increases
      navAmount += Math.abs(amount);
    } else if (cf.type === 'Distribution') {
      // Distribution: fund pays out cash → assets decrease → NAV decreases
      navAmount -= Math.abs(amount);
    }
    // Adjustments don't affect NAV (they're accounting corrections, not cash movements)
  });

  return navAmount;
}

/**
 * Get latest NAV date
 */
export function getLatestNavDate(fund: Fund, cutoffDate?: Date): string | null {
  const navs = (fund.monthlyNav || [])
    .filter((n) => isValidDate(n.date) && (!cutoffDate || new Date(n.date) <= cutoffDate))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return navs.length > 0 ? navs[0]!.date : null;
}

/**
 * Calculate outstanding commitment
 */
export function getOutstandingCommitment(fund: Fund, cutoffDate?: Date): number {
  let outstanding = parseCurrency(fund.commitment) || 0;

  (fund.cashFlows || [])
    .filter(
      (cf) =>
        isValidDate(cf.date) &&
        (!cutoffDate || new Date(cf.date) <= cutoffDate) &&
        cf.affectsCommitment !== false
    )
    .forEach((cf) => {
      if (cf.type === 'Contribution') {
        const amount = parseCurrency(cf.amount) || 0;
        outstanding -= Math.abs(amount);
      } else if (cf.type === 'Distribution') {
        // NOTE: This implements RECALLABLE distributions where returned capital
        // can be called again by the fund. This is unusual - most PE funds have
        // non-recallable distributions that don't restore unfunded commitment.
        //
        // For standard (non-recallable) distributions, set `affectsCommitment: false`
        // on the cash flow to prevent it from adding back to outstanding commitment.
        //
        // The filter above (cf.affectsCommitment !== false) already excludes
        // distributions marked as non-recallable.
        const amount = parseCurrency(cf.amount) || 0;
        outstanding += Math.abs(amount);
      }
    });

  return Math.max(0, outstanding);
}

/**
 * Parse cash flows for IRR calculation
 */
export function parseCashFlowsForIRR(fund: Fund, cutoffDate?: Date): IRRCashFlow[] {
  const flows: IRRCashFlow[] = (fund.cashFlows || [])
    .filter(
      (cf) =>
        isValidDate(cf.date) &&
        (!cutoffDate || new Date(cf.date) <= cutoffDate) &&
        cf.type !== 'Adjustment' // Adjustments don't affect IRR/MOIC
    )
    .map((cf) => {
      const amount = parseCurrency(cf.amount) || 0;
      return {
        date: cf.date,
        amount: cf.type === 'Contribution' ? -Math.abs(amount) : Math.abs(amount),
      };
    });

  // Add NAV as final cash flow for IRR/MOIC calculation
  // IMPORTANT: Include negative NAV (unrealized losses) - excluding them inflates returns
  const nav = getLatestNav(fund, cutoffDate);
  const navs = (fund.monthlyNav || [])
    .filter((n) => isValidDate(n.date) && (!cutoffDate || new Date(n.date) <= cutoffDate))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (navs.length > 0) {
    // NAV represents current portfolio value (can be negative for impaired funds)
    flows.push({ date: navs[0]!.date, amount: nav });
  }

  return flows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Calculate all metrics for a fund
 */
export function calculateMetrics(fund: Fund, cutoffDate?: Date): FundMetrics {
  const commitment = parseCurrency(fund.commitment) || 0;
  const calledCapital = getTotalByType(fund, 'Contribution', cutoffDate);
  const distributions = getTotalByType(fund, 'Distribution', cutoffDate);
  const nav = getLatestNav(fund, cutoffDate);
  const navDate = getLatestNavDate(fund, cutoffDate);
  const outstandingCommitment = getOutstandingCommitment(fund, cutoffDate);
  const vintageYear = getVintageYear(fund);
  const investmentReturn = distributions + nav - calledCapital;

  const cashFlowsForIRR = parseCashFlowsForIRR(fund, cutoffDate);
  const irr = calculateIRR(cashFlowsForIRR);
  const moic = calculateMOIC(cashFlowsForIRR);

  // Calculate DPI, RVPI, TVPI
  const dpi = calledCapital > 0 ? distributions / calledCapital : null;
  const rvpi = calledCapital > 0 ? nav / calledCapital : null;
  const tvpi = calledCapital > 0 ? (distributions + nav) / calledCapital : null;

  return {
    calledCapital,
    distributions,
    nav,
    navDate,
    irr,
    moic,
    dpi,
    rvpi,
    tvpi,
    outstandingCommitment,
    vintageYear,
    // Backward-compatible aliases for legacy tests
    commitment,
    totalContributions: calledCapital,
    totalDistributions: distributions,
    investmentReturn,
    vintage: vintageYear,
  };
}

/**
 * Calculate metrics with caching support
 *
 * Uses AppState's metrics cache for performance. Cache entries expire
 * based on METRICS_CACHE_TTL (default 5 seconds).
 *
 * @param fund - The fund to calculate metrics for
 * @param cutoffDate - Optional cutoff date for historical analysis
 * @returns Calculated metrics (from cache if available)
 */
export function calculateMetricsCached(fund: Fund, cutoffDate?: Date): FundMetrics {
  // Funds without IDs cannot be cached
  if (fund.id == null) {
    return calculateMetrics(fund, cutoffDate);
  }

  const cutoffStr = cutoffDate?.toISOString() ?? 'current';

  // Check cache first
  const cached = AppState.getMetricsFromCache(fund.id, cutoffStr);
  if (cached) {
    return cached;
  }

  // Calculate and cache
  const metrics = calculateMetrics(fund, cutoffDate);
  AppState.setMetricsCache(fund.id, cutoffStr, metrics);

  return metrics;
}
