/**
 * Data Health Check - validates data integrity across all funds and groups
 */

import type { Fund, Group, DismissedHealthIssue } from '../types';
import { calculateMetrics, getTotalByType } from '../calculations';
import { isValidDate } from '../utils/validation';

/**
 * Severity levels for health check issues
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * A single health check issue
 */
export interface HealthIssue {
  fundId: number;
  fundName: string;
  severity: IssueSeverity;
  category: string;
  message: string;
}

/**
 * A potential duplicate fund pair
 */
export interface DuplicatePair {
  fund1Id: number;
  fund1Name: string;
  fund2Id: number;
  fund2Name: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * A group-related issue
 */
export interface GroupIssue {
  groupId: number;
  groupName: string;
  severity: IssueSeverity;
  message: string;
}

/**
 * Health check results summary
 */
export interface HealthCheckResult {
  totalFunds: number;
  fundsWithIssues: number;
  issues: HealthIssue[];
  duplicates: DuplicatePair[];
  groupIssues: GroupIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  timestamp: string;
}

/**
 * Run all health checks on a list of funds and groups
 * @param funds - List of funds to check
 * @param groups - List of groups to check
 * @param dismissedPairs - List of dismissed health issues to filter out
 */
export function runHealthCheck(
  funds: Fund[],
  groups: Group[] = [],
  dismissedIssues: DismissedHealthIssue[] = []
): HealthCheckResult {
  let issues: HealthIssue[] = [];
  const fundsWithIssuesSet = new Set<number>();

  for (const fund of funds) {
    if (fund.id == null) continue;

    const fundIssues = checkFund(fund);
    for (const issue of fundIssues) {
      issues.push(issue);
      fundsWithIssuesSet.add(fund.id);
    }
  }

  // Check for proportionality issues (funds with non-proportional cash flows vs others in same fund)
  const proportionalityIssues = checkProportionalityIssues(funds);
  for (const issue of proportionalityIssues) {
    issues.push(issue);
    fundsWithIssuesSet.add(issue.fundId);
  }

  // Check for duplicate funds
  let duplicates = findDuplicateFunds(funds);

  // Filter out dismissed items using Set lookups for O(1) instead of O(n) .some()
  if (dismissedIssues.length > 0) {
    // Build Sets for O(1) lookup instead of O(n) .some() calls
    const dismissedDuplicateKeys = new Set(
      dismissedIssues
        .filter((d) => d.fund2Id > 0)
        .map((d) => `${Math.min(d.fund1Id, d.fund2Id)}-${Math.max(d.fund1Id, d.fund2Id)}`)
    );
    const dismissedIssueKeys = new Set(
      dismissedIssues
        .filter((d) => d.fund2Id === 0)
        .map((d) => `${d.fund1Id}|${d.category}|${d.message}`)
    );

    // Filter using Set.has() - O(1) per item
    duplicates = duplicates.filter((dup) => {
      const key = `${Math.min(dup.fund1Id, dup.fund2Id)}-${Math.max(dup.fund1Id, dup.fund2Id)}`;
      return !dismissedDuplicateKeys.has(key);
    });

    issues = issues.filter((issue) => {
      const key = `${issue.fundId}|${issue.category}|${issue.message}`;
      return !dismissedIssueKeys.has(key);
    });
  }

  // Check for group issues
  const groupIssues = checkGroups(groups, funds);

  // Sort by severity (errors first, then warnings, then info)
  const severityOrder: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Recalculate fundsWithIssues after filtering
  fundsWithIssuesSet.clear();
  for (const issue of issues) {
    fundsWithIssuesSet.add(issue.fundId);
  }

  // Single-pass severity counting instead of 6 separate filter operations
  const severityCounts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    severityCounts[issue.severity]++;
  }
  for (const issue of groupIssues) {
    severityCounts[issue.severity]++;
  }

  return {
    totalFunds: funds.length,
    fundsWithIssues: fundsWithIssuesSet.size,
    issues,
    duplicates,
    groupIssues,
    errorCount: severityCounts.error,
    warningCount: severityCounts.warning,
    infoCount: severityCounts.info,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check groups for issues (e.g., ID 0 indicating a creation bug, orphaned groups)
 */
function checkGroups(groups: Group[], funds: Fund[]): GroupIssue[] {
  const issues: GroupIssue[] = [];

  // Build a set of group IDs that have funds assigned
  const groupsWithFunds = new Set<number>();
  for (const fund of funds) {
    if (fund.groupId != null) {
      groupsWithFunds.add(fund.groupId);
    }
  }

  // Build a set of group IDs that have child groups
  const groupsWithChildren = new Set<number>();
  for (const group of groups) {
    if (group.parentGroupId != null) {
      groupsWithChildren.add(group.parentGroupId);
    }
  }

  for (const group of groups) {
    // Check for groups with ID 0 (indicates a bug from previous version)
    if (group.id === 0) {
      issues.push({
        groupId: group.id,
        groupName: group.name,
        severity: 'error',
        message: 'Group has ID 0 (data corruption). Delete and recreate this group.',
      });
    }

    // Check for orphaned groups (no funds or child groups linked)
    if (group.id != null && group.id !== 0) {
      const hasFunds = groupsWithFunds.has(group.id);
      const hasChildren = groupsWithChildren.has(group.id);

      if (!hasFunds && !hasChildren) {
        issues.push({
          groupId: group.id,
          groupName: group.name,
          severity: 'warning',
          message: 'Orphaned group: no investments or sub-groups assigned.',
        });
      }
    }
  }

  return issues;
}

/**
 * Run all checks on a single fund
 */
function checkFund(fund: Fund): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const fundId = fund.id!;
  const fundName = fund.fundName;

  // Pre-compute valid entries once for reuse throughout (avoid repeated isValidDate calls)
  const validCashFlows = (fund.cashFlows || []).filter((cf) => isValidDate(cf.date));
  const validNavs = (fund.monthlyNav || []).filter((nav) => isValidDate(nav.date));

  // Pre-compute future threshold once
  const futureThreshold = new Date();
  futureThreshold.setDate(futureThreshold.getDate() + 30);
  const futureDateStr = futureThreshold.toISOString().split('T')[0]!;

  // Check: Zero or negative commitment
  if (fund.commitment <= 0) {
    issues.push({
      fundId,
      fundName,
      severity: 'error',
      category: 'Invalid Data',
      message: `Commitment is ${fund.commitment <= 0 ? (fund.commitment === 0 ? 'zero' : 'negative') : 'invalid'}`,
    });
  }

  // Check: No cash flows
  if (!fund.cashFlows || fund.cashFlows.length === 0) {
    issues.push({
      fundId,
      fundName,
      severity: 'info',
      category: 'Incomplete Data',
      message: 'No cash flows recorded',
    });
  } else {
    // Use pre-computed validCashFlows from above
    const contributions = validCashFlows
      .filter((cf) => cf.type === 'Contribution')
      .sort((a, b) => a.date.localeCompare(b.date));

    const distributions = validCashFlows
      .filter((cf) => cf.type === 'Distribution')
      .sort((a, b) => a.date.localeCompare(b.date));

    // Check: Distributions before first contribution
    if (contributions.length > 0 && distributions.length > 0) {
      const firstContribution = contributions[0]!;
      const earlyDistributions = distributions.filter((d) => d.date < firstContribution.date);
      if (earlyDistributions.length > 0) {
        issues.push({
          fundId,
          fundName,
          severity: 'warning',
          category: 'Timeline Issue',
          message: `${earlyDistributions.length} distribution(s) before first contribution (${firstContribution.date})`,
        });
      }
    }

    // Check: Duplicate cash flows (same date, type, amount, and affectsCommitment)
    const seen = new Map<string, number>();
    for (const cf of fund.cashFlows) {
      // Include affectsCommitment in the key - different values mean different cash flows
      const affectsCommitment = cf.affectsCommitment !== false; // Default to true if undefined
      const key = `${cf.date}|${cf.type}|${cf.amount}|${affectsCommitment}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const duplicates = Array.from(seen.entries()).filter(([, count]) => count > 1);
    if (duplicates.length > 0) {
      const totalDuplicates = duplicates.reduce((sum, [, count]) => sum + count - 1, 0);
      issues.push({
        fundId,
        fundName,
        severity: 'warning',
        category: 'Duplicate Data',
        message: `${totalDuplicates} duplicate cash flow(s) detected`,
      });
    }

    // Check: Future dates (more than 30 days from now)
    // Note: futureDateStr is pre-computed at the start of this function

    // Use pre-filtered validCashFlows instead of re-filtering
    const futureCashFlows = validCashFlows.filter((cf) => cf.date > futureDateStr);
    if (futureCashFlows.length > 0) {
      issues.push({
        fundId,
        fundName,
        severity: 'warning',
        category: 'Timeline Issue',
        message: `${futureCashFlows.length} cash flow(s) dated more than 30 days in the future`,
      });
    }

    // Check: Contributions significantly exceed commitment (>120%)
    if (fund.commitment > 0) {
      const totalContributions = getTotalByType(fund, 'Contribution');
      const ratio = totalContributions / fund.commitment;
      if (ratio > 1.2) {
        issues.push({
          fundId,
          fundName,
          severity: 'warning',
          category: 'Data Anomaly',
          message: `Contributions (${formatAmount(totalContributions)}) exceed commitment (${formatAmount(fund.commitment)}) by ${Math.round((ratio - 1) * 100)}%`,
        });
      }
    }
  }

  // NAV checks (use pre-computed validNavs and validCashFlows)
  if (validNavs.length > 0) {
    // Check: NAV before first cash flow
    const sortedCashFlows = [...validCashFlows].sort((a, b) => a.date.localeCompare(b.date));

    if (sortedCashFlows.length > 0) {
      const firstCashFlowDate = sortedCashFlows[0]!.date;
      const earlyNavs = validNavs.filter((nav) => nav.date < firstCashFlowDate);
      if (earlyNavs.length > 0) {
        issues.push({
          fundId,
          fundName,
          severity: 'info',
          category: 'Timeline Issue',
          message: `${earlyNavs.length} NAV entry(ies) before first cash flow`,
        });
      }
    }

    // Check: Duplicate NAV dates (use pre-computed validNavs)
    const navDates = validNavs.map((n) => n.date);
    const uniqueNavDates = new Set(navDates);
    if (navDates.length !== uniqueNavDates.size) {
      issues.push({
        fundId,
        fundName,
        severity: 'warning',
        category: 'Duplicate Data',
        message: `${navDates.length - uniqueNavDates.size} duplicate NAV date(s)`,
      });
    }

    // Check: Future NAV dates (use pre-computed futureDateStr)
    const futureNavs = validNavs.filter((nav) => nav.date > futureDateStr);
    if (futureNavs.length > 0) {
      issues.push({
        fundId,
        fundName,
        severity: 'warning',
        category: 'Timeline Issue',
        message: `${futureNavs.length} NAV entry(ies) dated more than 30 days in the future`,
      });
    }
  }

  // Metrics-based checks
  const metrics = calculateMetrics(fund);

  // Check: Short holding period - IRR may not be meaningful
  // Use pre-computed validCashFlows and validNavs
  const sortedDates = validCashFlows
    .map((cf) => cf.date)
    .concat(validNavs.map((n) => n.date))
    .sort();
  if (sortedDates.length >= 2) {
    const firstDate = new Date(sortedDates[0]! + 'T00:00:00').getTime();
    const lastDate = new Date(sortedDates[sortedDates.length - 1]! + 'T00:00:00').getTime();
    const daysDiff = (lastDate - firstDate) / (24 * 60 * 60 * 1000);
    if (daysDiff > 0 && daysDiff < 30) {
      issues.push({
        fundId,
        fundName,
        severity: 'info',
        category: 'Calculation Note',
        message: `Short holding period (${Math.round(daysDiff)} days) - IRR not calculated for periods under 30 days`,
      });
    }
  }

  // Check: Has NAV but no cash flows - incomplete data for IRR/MOIC
  if (fund.monthlyNav && fund.monthlyNav.length > 0 && (!fund.cashFlows || fund.cashFlows.length === 0)) {
    issues.push({
      fundId,
      fundName,
      severity: 'info',
      category: 'Incomplete Data',
      message: 'Has NAV but no cash flows - IRR and MOIC cannot be calculated',
    });
  }

  // Check: Has distributions but no contributions - unusual pattern
  if (fund.cashFlows && fund.cashFlows.length > 0) {
    const hasContributions = fund.cashFlows.some((cf) => cf.type === 'Contribution');
    const hasDistributions = fund.cashFlows.some((cf) => cf.type === 'Distribution');
    if (hasDistributions && !hasContributions) {
      issues.push({
        fundId,
        fundName,
        severity: 'warning',
        category: 'Data Anomaly',
        message: 'Has distributions but no contributions - MOIC cannot be calculated',
      });
    }
  }

  // Check: Has cash flows but no NAV - may be missing current valuation
  if (fund.cashFlows && fund.cashFlows.length > 0 && (!fund.monthlyNav || fund.monthlyNav.length === 0)) {
    // Only flag if there's still outstanding commitment (fund isn't fully realized)
    if (metrics.outstandingCommitment > 0) {
      issues.push({
        fundId,
        fundName,
        severity: 'info',
        category: 'Incomplete Data',
        message: 'No NAV recorded - investment return may be understated if fund holds unrealized value',
      });
    }
  }

  // Check: Very high IRR (>500%) - possible data error
  if (metrics.irr !== null && metrics.irr > 5) {
    issues.push({
      fundId,
      fundName,
      severity: 'warning',
      category: 'Data Anomaly',
      message: `Extremely high IRR (${(metrics.irr * 100).toFixed(1)}%) - verify data accuracy`,
    });
  }

  // Check: Distributions exceed contributions + NAV (impossible math)
  if (metrics.calledCapital > 0 && metrics.nav >= 0) {
    const maxPossibleDistributions = metrics.calledCapital + metrics.nav;
    if (metrics.distributions > maxPossibleDistributions * 1.5) {
      issues.push({
        fundId,
        fundName,
        severity: 'warning',
        category: 'Data Anomaly',
        message: `Distributions (${formatAmount(metrics.distributions)}) significantly exceed contributions + NAV`,
      });
    }
  }

  // Check: Negative NAV with no explanation
  if (metrics.nav < 0 && Math.abs(metrics.nav) > 1000) {
    issues.push({
      fundId,
      fundName,
      severity: 'info',
      category: 'Review Needed',
      message: `Negative NAV (${formatAmount(metrics.nav)}) - verify if this is expected`,
    });
  }

  // Check: Vintage year mismatch
  if (metrics.vintageYear !== null) {
    const firstContribution = (fund.cashFlows || [])
      .filter((cf) => cf.type === 'Contribution' && isValidDate(cf.date))
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    if (firstContribution) {
      const firstYear = new Date(firstContribution.date + 'T00:00:00').getFullYear();
      if (firstYear !== metrics.vintageYear) {
        issues.push({
          fundId,
          fundName,
          severity: 'info',
          category: 'Data Anomaly',
          message: `Calculated vintage (${firstYear}) differs from stored value`,
        });
      }
    }
  }

  return issues;
}

/**
 * Format amount for display
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get severity badge class
 */
export function getSeverityClass(severity: IssueSeverity): string {
  switch (severity) {
    case 'error':
      return 'severity-error';
    case 'warning':
      return 'severity-warning';
    case 'info':
      return 'severity-info';
    default:
      return '';
  }
}

/**
 * Get severity label
 */
export function getSeverityLabel(severity: IssueSeverity): string {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
    default:
      return severity;
  }
}

/**
 * Get confidence badge class
 */
export function getConfidenceClass(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high':
      return 'confidence-high';
    case 'medium':
      return 'confidence-medium';
    case 'low':
      return 'confidence-low';
    default:
      return '';
  }
}

// ===========================
// Proportionality Check
// ===========================

/**
 * Check for funds with non-proportional cash flows compared to other investments in the same fund.
 *
 * Instead of pairwise comparisons (which generate N-1 alerts for one outlier among N funds),
 * this groups funds by name and identifies outliers based on deviation from the group average.
 * This generates ONE alert per outlier fund.
 */
function checkProportionalityIssues(funds: Fund[]): HealthIssue[] {
  const issues: HealthIssue[] = [];

  // Group funds by normalized name
  const fundGroups = new Map<string, Fund[]>();
  for (const fund of funds) {
    if (fund.id == null || fund.commitment <= 0) continue;
    const key = normalizeName(fund.fundName);
    if (!fundGroups.has(key)) {
      fundGroups.set(key, []);
    }
    fundGroups.get(key)!.push(fund);
  }

  // Check each group with multiple funds
  for (const [, groupFunds] of fundGroups) {
    if (groupFunds.length < 2) continue;

    // Calculate metrics for each fund
    const fundMetrics = groupFunds.map((fund) => ({
      fund,
      metrics: calculateMetrics(fund),
    }));

    // Calculate group totals
    const totalCommitment = fundMetrics.reduce((sum, f) => sum + f.fund.commitment, 0);
    const totalContributions = fundMetrics.reduce((sum, f) => sum + f.metrics.calledCapital, 0);
    const totalDistributions = fundMetrics.reduce((sum, f) => sum + f.metrics.distributions, 0);

    // Skip if no contributions or no distributions to compare
    if (totalContributions === 0 && totalDistributions === 0) continue;

    // Check each fund for proportionality deviation
    for (const { fund, metrics } of fundMetrics) {
      const expectedContributions = (fund.commitment / totalCommitment) * totalContributions;
      const expectedDistributions = (fund.commitment / totalCommitment) * totalDistributions;

      // Check contributions (if fund and group have contributions)
      if (metrics.calledCapital > 0 && totalContributions > 0) {
        const deviation = Math.abs(metrics.calledCapital - expectedContributions) / expectedContributions;
        if (deviation > 0.10) {
          const otherCount = groupFunds.length - 1;
          issues.push({
            fundId: fund.id!,
            fundName: fund.fundName,
            severity: 'info',
            category: 'Data Anomaly',
            message: `Contributions not proportional to commitment (${Math.round(deviation * 100)}% deviation vs ${otherCount} other investment${otherCount > 1 ? 's' : ''} in same fund)`,
          });
          continue; // Only one issue per fund
        }
      }

      // Check distributions (if fund and group have distributions)
      if (metrics.distributions > 0 && totalDistributions > 0) {
        const deviation = Math.abs(metrics.distributions - expectedDistributions) / expectedDistributions;
        if (deviation > 0.10) {
          const otherCount = groupFunds.length - 1;
          issues.push({
            fundId: fund.id!,
            fundName: fund.fundName,
            severity: 'info',
            category: 'Data Anomaly',
            message: `Distributions not proportional to commitment (${Math.round(deviation * 100)}% deviation vs ${otherCount} other investment${otherCount > 1 ? 's' : ''} in same fund)`,
          });
        }
      }
    }
  }

  return issues;
}

// ===========================
// Duplicate Detection
// ===========================

/**
 * Pre-computed fund data for efficient duplicate detection
 */
interface PrecomputedFundData {
  fund: Fund;
  normalizedName: string;
  normalizedAccount: string;
  vintageYear: number | null;
}

/**
 * Find potential duplicate funds
 * Optimized: O(n) pre-computation + O(m²) per account group instead of O(n²) global
 */
function findDuplicateFunds(funds: Fund[]): DuplicatePair[] {
  const duplicates: DuplicatePair[] = [];
  const seen = new Set<string>(); // Track pairs we've already flagged

  // Step 1: Pre-compute normalized data for all funds (O(n))
  const precomputed: PrecomputedFundData[] = [];
  for (const fund of funds) {
    if (fund.id == null) continue;
    precomputed.push({
      fund,
      normalizedName: normalizeName(fund.fundName),
      normalizedAccount: fund.accountNumber ? normalizeAccountNumber(fund.accountNumber) : '',
      vintageYear: calculateMetrics(fund).vintageYear,
    });
  }

  // Step 2: Group funds by normalized account number (O(n))
  // Duplicates must share an account number, so we only compare within groups
  const accountGroups = new Map<string, PrecomputedFundData[]>();
  for (const data of precomputed) {
    if (!data.normalizedAccount) continue; // Skip funds without account numbers
    if (!accountGroups.has(data.normalizedAccount)) {
      accountGroups.set(data.normalizedAccount, []);
    }
    accountGroups.get(data.normalizedAccount)!.push(data);
  }

  // Step 3: Compare only within account groups (O(m²) per group, much smaller than O(n²))
  for (const [, groupFunds] of accountGroups) {
    if (groupFunds.length < 2) continue;

    for (let i = 0; i < groupFunds.length; i++) {
      for (let j = i + 1; j < groupFunds.length; j++) {
        const data1 = groupFunds[i]!;
        const data2 = groupFunds[j]!;
        const fund1 = data1.fund;
        const fund2 = data2.fund;

        const pairKey = `${Math.min(fund1.id!, fund2.id!)}-${Math.max(fund1.id!, fund2.id!)}`;
        if (seen.has(pairKey)) continue;

        // Use pre-computed values for comparison
        const match = checkDuplicatePairOptimized(data1, data2);
        if (match) {
          seen.add(pairKey);
          duplicates.push({
            fund1Id: fund1.id!,
            fund1Name: fund1.fundName,
            fund2Id: fund2.id!,
            fund2Name: fund2.fundName,
            reason: match.reason,
            confidence: match.confidence,
          });
        }
      }
    }
  }

  // Sort by confidence (high first)
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  duplicates.sort((a, b) => confidenceOrder[a.confidence]! - confidenceOrder[b.confidence]!);

  return duplicates;
}

/**
 * Check if two funds are potential duplicates using pre-computed data
 * Optimized: Uses pre-computed normalized names and vintage years
 */
function checkDuplicatePairOptimized(
  data1: PrecomputedFundData,
  data2: PrecomputedFundData
): { reason: string; confidence: 'high' | 'medium' | 'low' } | null {
  // Both funds have the same account (guaranteed by grouping)
  const sameFundName = data1.normalizedName === data2.normalizedName;

  // Check 1: Same name + same account number = likely duplicate
  if (sameFundName) {
    return { reason: 'Identical fund name and account number', confidence: 'high' };
  }

  // Check 2: Very similar names + same account = possible typo/duplicate
  // Use pre-computed vintage years to avoid recalculating metrics
  const similarity = calculateNameSimilarity(data1.fund.fundName, data2.fund.fundName);
  if (similarity >= 0.85) {
    const differentVintageYears =
      data1.vintageYear != null &&
      data2.vintageYear != null &&
      data1.vintageYear !== data2.vintageYear;

    // Fund series with different vintage years are not duplicates
    if (!differentVintageYears) {
      return {
        reason: `Same account with similar fund names (${Math.round(similarity * 100)}% match)`,
        confidence: 'medium',
      };
    }
  }

  return null;
}

/**
 * Roman numeral to Arabic mapping (longest patterns first for correct matching)
 */
const ROMAN_TO_ARABIC: Record<string, string> = {
  xxv: '25', xxiv: '24', xxiii: '23', xxii: '22', xxi: '21', xx: '20',
  xix: '19', xviii: '18', xvii: '17', xvi: '16', xv: '15', xiv: '14',
  xiii: '13', xii: '12', xi: '11', x: '10', ix: '9', viii: '8',
  vii: '7', vi: '6', v: '5', iv: '4', iii: '3', ii: '2', i: '1',
};

/**
 * Pre-compiled regex for Roman numeral matching (longest patterns first)
 * Optimized: single regex with alternation instead of 26 sequential replacements
 */
const ROMAN_PATTERN = /\b(xxv|xxiv|xxiii|xxii|xxi|xx|xix|xviii|xvii|xvi|xv|xiv|xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/gi;

/**
 * Convert Roman numerals to Arabic numerals in a string
 * Optimized: O(n) single-pass instead of 26 sequential passes
 */
function romanToArabic(str: string): string {
  return str.replace(ROMAN_PATTERN, (match) => ROMAN_TO_ARABIC[match.toLowerCase()] || match);
}

/**
 * Normalize fund name for comparison
 */
function normalizeName(name: string): string {
  let normalized = name.toLowerCase();

  // Convert Roman numerals to Arabic before removing non-alphanumeric
  normalized = romanToArabic(normalized);

  return normalized
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    .replace(/fund/g, '')
    .replace(/lp/g, '')
    .replace(/llc/g, '')
    .replace(/inc/g, '')
    .trim();
}

/**
 * Normalize account number for comparison
 */
function normalizeAccountNumber(accountNumber: string): string {
  return accountNumber.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Calculate name similarity using Levenshtein distance
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const s1 = normalizeName(name1);
  const s2 = normalizeName(name2);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  return 1 - distance / maxLength;
}

/**
 * Calculate Levenshtein distance between two strings
 * Optimized: O(min(m,n)) space using two-row approach instead of O(m×n) matrix
 */
function levenshteinDistance(s1: string, s2: string): number {
  // Ensure s1 is the shorter string for minimal space usage
  if (s1.length > s2.length) {
    [s1, s2] = [s2, s1];
  }

  const m = s1.length;
  const n = s2.length;

  // Use two rows instead of full matrix
  let prevRow = new Array<number>(m + 1);
  let currRow = new Array<number>(m + 1);

  // Initialize first row
  for (let i = 0; i <= m; i++) {
    prevRow[i] = i;
  }

  // Fill rows
  for (let j = 1; j <= n; j++) {
    currRow[0] = j;

    for (let i = 1; i <= m; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i]! + 1,      // deletion
        currRow[i - 1]! + 1,  // insertion
        prevRow[i - 1]! + cost // substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[m]!;
}

