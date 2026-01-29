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

  // Check for duplicate funds
  let duplicates = findDuplicateFunds(funds);

  // Filter out dismissed items
  if (dismissedIssues.length > 0) {
    // Filter dismissed duplicate pairs (fund2Id > 0)
    duplicates = duplicates.filter((dup) => {
      const normalizedId1 = Math.min(dup.fund1Id, dup.fund2Id);
      const normalizedId2 = Math.max(dup.fund1Id, dup.fund2Id);
      return !dismissedIssues.some(
        (d) => d.fund2Id > 0 && d.fund1Id === normalizedId1 && d.fund2Id === normalizedId2
      );
    });

    // Filter dismissed fund issues (fund2Id === 0)
    issues = issues.filter((issue) => {
      return !dismissedIssues.some(
        (d) => d.fund2Id === 0 && d.fund1Id === issue.fundId && d.category === issue.category && d.message === issue.message
      );
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

  return {
    totalFunds: funds.length,
    fundsWithIssues: fundsWithIssuesSet.size,
    issues,
    duplicates,
    groupIssues,
    errorCount: issues.filter((i) => i.severity === 'error').length + groupIssues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length + groupIssues.filter((i) => i.severity === 'warning').length,
    infoCount: issues.filter((i) => i.severity === 'info').length + groupIssues.filter((i) => i.severity === 'info').length,
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
    // Cash flow checks
    const contributions = fund.cashFlows
      .filter((cf) => cf.type === 'Contribution' && isValidDate(cf.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const distributions = fund.cashFlows
      .filter((cf) => cf.type === 'Distribution' && isValidDate(cf.date))
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
    const futureThreshold = new Date();
    futureThreshold.setDate(futureThreshold.getDate() + 30);
    const futureDateStr = futureThreshold.toISOString().split('T')[0]!;

    const futureCashFlows = fund.cashFlows.filter(
      (cf) => isValidDate(cf.date) && cf.date > futureDateStr
    );
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

  // NAV checks
  if (fund.monthlyNav && fund.monthlyNav.length > 0) {
    // Check: NAV before first cash flow
    const sortedCashFlows = (fund.cashFlows || [])
      .filter((cf) => isValidDate(cf.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (sortedCashFlows.length > 0) {
      const firstCashFlowDate = sortedCashFlows[0]!.date;
      const earlyNavs = fund.monthlyNav.filter(
        (nav) => isValidDate(nav.date) && nav.date < firstCashFlowDate
      );
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

    // Check: Duplicate NAV dates
    const navDates = fund.monthlyNav.filter((n) => isValidDate(n.date)).map((n) => n.date);
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

    // Check: Future NAV dates
    const futureThreshold = new Date();
    futureThreshold.setDate(futureThreshold.getDate() + 30);
    const futureDateStr = futureThreshold.toISOString().split('T')[0]!;

    const futureNavs = fund.monthlyNav.filter(
      (nav) => isValidDate(nav.date) && nav.date > futureDateStr
    );
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
// Duplicate Detection
// ===========================

/**
 * Find potential duplicate funds
 */
function findDuplicateFunds(funds: Fund[]): DuplicatePair[] {
  const duplicates: DuplicatePair[] = [];
  const seen = new Set<string>(); // Track pairs we've already flagged

  for (let i = 0; i < funds.length; i++) {
    for (let j = i + 1; j < funds.length; j++) {
      const fund1 = funds[i]!;
      const fund2 = funds[j]!;

      if (fund1.id == null || fund2.id == null) continue;

      const pairKey = `${Math.min(fund1.id, fund2.id)}-${Math.max(fund1.id, fund2.id)}`;
      if (seen.has(pairKey)) continue;

      const match = checkDuplicatePair(fund1, fund2);
      if (match) {
        seen.add(pairKey);
        duplicates.push({
          fund1Id: fund1.id,
          fund1Name: fund1.fundName,
          fund2Id: fund2.id,
          fund2Name: fund2.fundName,
          reason: match.reason,
          confidence: match.confidence,
        });
      }
    }
  }

  // Sort by confidence (high first)
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  duplicates.sort((a, b) => confidenceOrder[a.confidence]! - confidenceOrder[b.confidence]!);

  return duplicates;
}

/**
 * Check if two funds are potential duplicates
 *
 * Note: Multiple investments can legitimately share the same fund name
 * (different investors in the same PE fund). Only flag as duplicate if
 * there's evidence of accidental duplication (same account, same data).
 */
function checkDuplicatePair(
  fund1: Fund,
  fund2: Fund
): { reason: string; confidence: 'high' | 'medium' | 'low' } | null {
  const sameAccountNumber =
    fund1.accountNumber &&
    fund2.accountNumber &&
    normalizeAccountNumber(fund1.accountNumber) === normalizeAccountNumber(fund2.accountNumber);
  const sameFundName = normalizeName(fund1.fundName) === normalizeName(fund2.fundName);

  // Check 1: Same name + same account number = likely duplicate
  if (sameFundName && sameAccountNumber) {
    return { reason: 'Identical fund name and account number', confidence: 'high' };
  }

  // Check 2: Same fund, different accounts - check if cash flows are proportional to commitment
  // (if not proportional, there may be a data issue)
  const proportionalityCheck = checkCashFlowProportionality(fund1, fund2);
  if (proportionalityCheck) {
    return proportionalityCheck;
  }

  // Check 3: Very similar names + same account = possible typo/duplicate
  // BUT: If vintage years are different, they're likely a fund series (e.g., "Fund X" and "Fund XI")
  const similarity = calculateNameSimilarity(fund1.fundName, fund2.fundName);
  if (similarity >= 0.85 && sameAccountNumber) {
    const metrics1 = calculateMetrics(fund1);
    const metrics2 = calculateMetrics(fund2);
    const vintage1 = metrics1.vintageYear;
    const vintage2 = metrics2.vintageYear;
    const differentVintageYears = vintage1 != null && vintage2 != null && vintage1 !== vintage2;

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
 * Check if cash flows are proportional to commitment for same-fund investors
 *
 * For two investors in the same fund, their cash flows should be proportional
 * to their commitment amounts. E.g., if Investor A has 2x the commitment of
 * Investor B, they should have ~2x the distributions/contributions.
 *
 * Flags when the deviation exceeds 10%.
 */
function checkCashFlowProportionality(
  fund1: Fund,
  fund2: Fund
): { reason: string; confidence: 'medium' } | null {
  // Only check same-fund investments (different accounts in same fund)
  if (normalizeName(fund1.fundName) !== normalizeName(fund2.fundName)) {
    return null;
  }

  // Need both to have commitment > 0
  if (fund1.commitment <= 0 || fund2.commitment <= 0) {
    return null;
  }

  const metrics1 = calculateMetrics(fund1);
  const metrics2 = calculateMetrics(fund2);
  const commitmentRatio = fund1.commitment / fund2.commitment;

  // Check contributions proportionality (if both have contributions)
  if (metrics1.calledCapital > 0 && metrics2.calledCapital > 0) {
    const contributionRatio = metrics1.calledCapital / metrics2.calledCapital;
    const contributionDeviation = Math.abs(contributionRatio - commitmentRatio) / commitmentRatio;

    if (contributionDeviation > 0.10) {
      return {
        reason: `Same fund: contributions not proportional to commitment (${Math.round(contributionDeviation * 100)}% deviation)`,
        confidence: 'medium',
      };
    }
  }

  // Check distributions proportionality (if both have distributions)
  if (metrics1.distributions > 0 && metrics2.distributions > 0) {
    const distRatio = metrics1.distributions / metrics2.distributions;
    const distDeviation = Math.abs(distRatio - commitmentRatio) / commitmentRatio;

    if (distDeviation > 0.10) {
      return {
        reason: `Same fund: distributions not proportional to commitment (${Math.round(distDeviation * 100)}% deviation)`,
        confidence: 'medium',
      };
    }
  }

  return null;
}

/**
 * Convert Roman numerals to Arabic numerals in a string
 */
function romanToArabic(str: string): string {
  const romanNumerals: [RegExp, string][] = [
    [/\bxxv\b/gi, '25'],
    [/\bxxiv\b/gi, '24'],
    [/\bxxiii\b/gi, '23'],
    [/\bxxii\b/gi, '22'],
    [/\bxxi\b/gi, '21'],
    [/\bxx\b/gi, '20'],
    [/\bxix\b/gi, '19'],
    [/\bxviii\b/gi, '18'],
    [/\bxvii\b/gi, '17'],
    [/\bxvi\b/gi, '16'],
    [/\bxv\b/gi, '15'],
    [/\bxiv\b/gi, '14'],
    [/\bxiii\b/gi, '13'],
    [/\bxii\b/gi, '12'],
    [/\bxi\b/gi, '11'],
    [/\bx\b/gi, '10'],
    [/\bix\b/gi, '9'],
    [/\bviii\b/gi, '8'],
    [/\bvii\b/gi, '7'],
    [/\bvi\b/gi, '6'],
    [/\bv\b/gi, '5'],
    [/\biv\b/gi, '4'],
    [/\biii\b/gi, '3'],
    [/\bii\b/gi, '2'],
    [/\bi\b/gi, '1'],
  ];

  let result = str;
  for (const [pattern, replacement] of romanNumerals) {
    result = result.replace(pattern, replacement);
  }
  return result;
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
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  // Create matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1, // deletion
        dp[i]![j - 1]! + 1, // insertion
        dp[i - 1]![j - 1]! + cost // substitution
      );
    }
  }

  return dp[m]![n]!;
}

