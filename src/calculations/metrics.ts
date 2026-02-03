import type { Fund, FundMetrics } from '../types';
import { AppState } from '../core/state';
import { isValidDate } from '../utils/validation';
import { parseCurrency } from '../utils/formatting';
import { calculateIRR, calculateMOIC, type IRRCashFlow } from './irr';

/**
 * Parse currency with logging for failures.
 * Logs a warning if parseCurrency returns null on non-empty input.
 */
function safeParseCurrency(value: unknown, context: string): number {
  const result = parseCurrency(value);
  if (result === null && value != null && value !== '' && value !== 0) {
    console.warn(`Currency parse failed (${context}):`, value);
  }
  return result || 0;
}

/**
 * Parse date string to timestamp, forcing local timezone interpretation.
 * Appends T00:00:00 to prevent JavaScript from parsing date-only strings as UTC.
 */
function parseDateLocal(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Pre-parsed cash flow with timestamp for efficient sorting/filtering
 */
interface ParsedCashFlow {
  date: string;
  timestamp: number;
  type: string;
  amount: number;
  affectsCommitment: boolean;
}

/**
 * Pre-parsed NAV entry with timestamp
 */
interface ParsedNav {
  date: string;
  timestamp: number;
  amount: number;
}

/**
 * Pre-parse all cash flows and NAVs once for a fund
 * This avoids repeated date parsing across multiple metric calculations
 */
function parseFundData(fund: Fund, cutoffDate?: Date): {
  cashFlows: ParsedCashFlow[];
  navs: ParsedNav[];
  cutoffTimestamp: number | null;
} {
  const cutoffTimestamp = cutoffDate ? cutoffDate.getTime() : null;

  const cashFlows: ParsedCashFlow[] = (fund.cashFlows || [])
    .filter(cf => isValidDate(cf.date))
    .map(cf => ({
      date: cf.date,
      timestamp: parseDateLocal(cf.date).getTime(),
      type: cf.type,
      amount: safeParseCurrency(cf.amount, 'cash flow amount'),
      affectsCommitment: cf.affectsCommitment !== false,
    }))
    .filter(cf => cutoffTimestamp === null || cf.timestamp <= cutoffTimestamp);

  const navs: ParsedNav[] = (fund.monthlyNav || [])
    .filter(n => isValidDate(n.date))
    .map(n => ({
      date: n.date,
      timestamp: parseDateLocal(n.date).getTime(),
      amount: safeParseCurrency(n.amount, 'NAV amount'),
    }))
    .filter(n => cutoffTimestamp === null || n.timestamp <= cutoffTimestamp);

  return { cashFlows, navs, cutoffTimestamp };
}

/**
 * Get vintage year (first contribution year)
 * Optimized: O(n) single-pass instead of O(n log n) sort
 */
export function getVintageYear(fund: Fund): number | null {
  let earliest: string | null = null;

  for (const cf of fund.cashFlows || []) {
    if (cf.type === 'Contribution' && isValidDate(cf.date)) {
      // String comparison works for YYYY-MM-DD format
      if (earliest === null || cf.date < earliest) {
        earliest = cf.date;
      }
    }
  }

  return earliest ? parseDateLocal(earliest).getFullYear() : null;
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
        (!cutoffDate || parseDateLocal(cf.date) <= cutoffDate)
    )
    .reduce((sum, cf) => sum + Math.abs(safeParseCurrency(cf.amount, 'cash flow amount')), 0);
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
    .filter((n) => isValidDate(n.date) && (!cutoffDate || parseDateLocal(n.date) <= cutoffDate))
    .sort((a, b) => parseDateLocal(b.date).getTime() - parseDateLocal(a.date).getTime());

  if (navs.length === 0) return 0;

  const latestNav = navs[0]!;
  let navAmount = safeParseCurrency(latestNav.amount, 'NAV amount');
  const navDate = parseDateLocal(latestNav.date);

  // Adjust for cash flows after NAV date
  const subsequentFlows = (fund.cashFlows || []).filter((cf) => {
    if (!isValidDate(cf.date)) return false;
    const cfDate = parseDateLocal(cf.date);
    return cfDate > navDate && (!cutoffDate || cfDate <= cutoffDate);
  });

  subsequentFlows.forEach((cf) => {
    const amount = safeParseCurrency(cf.amount, 'cash flow amount');
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
    .filter((n) => isValidDate(n.date) && (!cutoffDate || parseDateLocal(n.date) <= cutoffDate))
    .sort((a, b) => parseDateLocal(b.date).getTime() - parseDateLocal(a.date).getTime());

  return navs.length > 0 ? navs[0]!.date : null;
}

/**
 * Calculate outstanding commitment
 */
export function getOutstandingCommitment(fund: Fund, cutoffDate?: Date): number {
  let outstanding = safeParseCurrency(fund.commitment, 'commitment');

  (fund.cashFlows || [])
    .filter(
      (cf) =>
        isValidDate(cf.date) &&
        (!cutoffDate || parseDateLocal(cf.date) <= cutoffDate)
    )
    .forEach((cf) => {
      const amount = safeParseCurrency(cf.amount, 'cash flow amount');

      // Adjustments ALWAYS affect commitment - that's their only purpose
      // (they're excluded from IRR, MOIC, NAV, and timeline)
      if (cf.type === 'Adjustment') {
        // Positive reduces outstanding, negative increases outstanding
        outstanding -= amount;
        return;
      }

      // For Contributions/Distributions, respect the affectsCommitment flag
      if (cf.affectsCommitment === false) return;

      if (cf.type === 'Contribution') {
        outstanding -= Math.abs(amount);
      } else if (cf.type === 'Distribution') {
        // NOTE: This implements RECALLABLE distributions where returned capital
        // can be called again by the fund. This is unusual - most PE funds have
        // non-recallable distributions that don't restore unfunded commitment.
        //
        // For standard (non-recallable) distributions, set `affectsCommitment: false`
        // on the cash flow to prevent it from adding back to outstanding commitment.
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
        (!cutoffDate || parseDateLocal(cf.date) <= cutoffDate) &&
        cf.type !== 'Adjustment' // Adjustments don't affect IRR/MOIC
    )
    .map((cf) => {
      const amount = safeParseCurrency(cf.amount, 'cash flow amount');
      return {
        date: cf.date,
        amount: cf.type === 'Contribution' ? -Math.abs(amount) : Math.abs(amount),
      };
    });

  // Add NAV as final cash flow for IRR/MOIC calculation
  // IMPORTANT: Include negative NAV (unrealized losses) - excluding them inflates returns
  const nav = getLatestNav(fund, cutoffDate);
  const navs = (fund.monthlyNav || [])
    .filter((n) => isValidDate(n.date) && (!cutoffDate || parseDateLocal(n.date) <= cutoffDate))
    .sort((a, b) => parseDateLocal(b.date).getTime() - parseDateLocal(a.date).getTime());

  if (navs.length > 0) {
    // NAV represents current portfolio value (can be negative for impaired funds)
    flows.push({ date: navs[0]!.date, amount: nav });
  }

  return flows.sort((a, b) => parseDateLocal(a.date).getTime() - parseDateLocal(b.date).getTime());
}

/**
 * Calculate all metrics for a fund (optimized version)
 * Parses all dates once and reuses across calculations
 */
export function calculateMetrics(fund: Fund, cutoffDate?: Date): FundMetrics {
  const commitment = safeParseCurrency(fund.commitment, 'commitment');

  // Parse all dates once
  const { cashFlows, navs } = parseFundData(fund, cutoffDate);

  // Sort cash flows by date (ascending) - done once
  const sortedCashFlows = [...cashFlows].sort((a, b) => a.timestamp - b.timestamp);

  // Sort NAVs by date (descending for latest first)
  const sortedNavsDesc = [...navs].sort((a, b) => b.timestamp - a.timestamp);

  // Calculate called capital (sum of contributions)
  const calledCapital = sortedCashFlows
    .filter(cf => cf.type === 'Contribution')
    .reduce((sum, cf) => sum + Math.abs(cf.amount), 0);

  // Calculate distributions
  const distributions = sortedCashFlows
    .filter(cf => cf.type === 'Distribution')
    .reduce((sum, cf) => sum + Math.abs(cf.amount), 0);

  // Get latest NAV with adjustments for subsequent cash flows
  let nav = 0;
  let navDate: string | null = null;
  if (sortedNavsDesc.length > 0) {
    const latestNav = sortedNavsDesc[0]!;
    nav = latestNav.amount;
    navDate = latestNav.date;
    const navTimestamp = latestNav.timestamp;

    // Adjust for cash flows after NAV date
    for (const cf of sortedCashFlows) {
      if (cf.timestamp > navTimestamp) {
        if (cf.type === 'Contribution') {
          nav += Math.abs(cf.amount);
        } else if (cf.type === 'Distribution') {
          nav -= Math.abs(cf.amount);
        }
      }
    }
  }

  // Calculate outstanding commitment
  let outstandingCommitment = commitment;
  for (const cf of sortedCashFlows) {
    if (cf.type === 'Adjustment') {
      outstandingCommitment -= cf.amount;
    } else if (cf.affectsCommitment) {
      if (cf.type === 'Contribution') {
        outstandingCommitment -= Math.abs(cf.amount);
      } else if (cf.type === 'Distribution') {
        outstandingCommitment += Math.abs(cf.amount);
      }
    }
  }
  outstandingCommitment = Math.max(0, outstandingCommitment);

  // Get vintage year (first contribution year)
  const firstContribution = sortedCashFlows.find(cf => cf.type === 'Contribution');
  const vintageYear = firstContribution
    ? new Date(firstContribution.timestamp).getFullYear()
    : null;

  // Calculate investment return
  const investmentReturn = distributions + nav - calledCapital;

  // Build cash flows for IRR (excluding adjustments)
  const irrFlows: IRRCashFlow[] = sortedCashFlows
    .filter(cf => cf.type !== 'Adjustment')
    .map(cf => ({
      date: cf.date,
      amount: cf.type === 'Contribution' ? -Math.abs(cf.amount) : Math.abs(cf.amount),
    }));

  // Add NAV as final cash flow for IRR/MOIC
  if (sortedNavsDesc.length > 0) {
    irrFlows.push({ date: sortedNavsDesc[0]!.date, amount: nav });
  }

  // Sort IRR flows by date
  irrFlows.sort((a, b) => parseDateLocal(a.date).getTime() - parseDateLocal(b.date).getTime());

  const irr = calculateIRR(irrFlows);
  const moic = calculateMOIC(irrFlows);

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
