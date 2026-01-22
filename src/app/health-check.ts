/**
 * Data Health Check - validates data integrity across all funds
 */

import type { Fund } from '../types';
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
 * Health check results summary
 */
export interface HealthCheckResult {
  totalFunds: number;
  fundsWithIssues: number;
  issues: HealthIssue[];
  duplicates: DuplicatePair[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  timestamp: string;
}

/**
 * Run all health checks on a list of funds
 */
export function runHealthCheck(funds: Fund[]): HealthCheckResult {
  const issues: HealthIssue[] = [];
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
  const duplicates = findDuplicateFunds(funds);

  // Sort by severity (errors first, then warnings, then info)
  const severityOrder: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    totalFunds: funds.length,
    fundsWithIssues: fundsWithIssuesSet.size,
    issues,
    duplicates,
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
    infoCount: issues.filter((i) => i.severity === 'info').length,
    timestamp: new Date().toISOString(),
  };
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

    // Check: Duplicate cash flows (same date, type, amount)
    const seen = new Map<string, number>();
    for (const cf of fund.cashFlows) {
      const key = `${cf.date}|${cf.type}|${cf.amount}`;
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
 */
function checkDuplicatePair(
  fund1: Fund,
  fund2: Fund
): { reason: string; confidence: 'high' | 'medium' | 'low' } | null {
  // Check 1: Exact name match (case-insensitive)
  if (normalizeName(fund1.fundName) === normalizeName(fund2.fundName)) {
    return { reason: 'Identical fund names', confidence: 'high' };
  }

  // Check 2: Same investor + same commitment + same vintage
  const metrics1 = calculateMetrics(fund1);
  const metrics2 = calculateMetrics(fund2);

  if (
    fund1.accountNumber &&
    fund2.accountNumber &&
    normalizeAccountNumber(fund1.accountNumber) === normalizeAccountNumber(fund2.accountNumber)
  ) {
    // Same investor - check for more similarity
    if (
      fund1.commitment === fund2.commitment &&
      metrics1.vintageYear === metrics2.vintageYear &&
      metrics1.vintageYear !== null
    ) {
      return {
        reason: `Same investor, commitment, and vintage year (${metrics1.vintageYear})`,
        confidence: 'high',
      };
    }

    // Same investor with similar commitment (within 5%)
    if (fund1.commitment > 0 && fund2.commitment > 0) {
      const ratio = fund1.commitment / fund2.commitment;
      if (ratio >= 0.95 && ratio <= 1.05) {
        return {
          reason: 'Same investor with nearly identical commitment',
          confidence: 'medium',
        };
      }
    }
  }

  // Check 3: Very similar names (fuzzy match)
  const similarity = calculateNameSimilarity(fund1.fundName, fund2.fundName);
  if (similarity >= 0.85) {
    return {
      reason: `Very similar fund names (${Math.round(similarity * 100)}% match)`,
      confidence: 'medium',
    };
  }

  // Check 4: Significant cash flow overlap
  const cashFlowOverlap = calculateCashFlowOverlap(fund1, fund2);
  if (cashFlowOverlap >= 0.8) {
    return {
      reason: `${Math.round(cashFlowOverlap * 100)}% of cash flows are identical`,
      confidence: 'high',
    };
  } else if (cashFlowOverlap >= 0.5) {
    return {
      reason: `${Math.round(cashFlowOverlap * 100)}% of cash flows are identical`,
      confidence: 'medium',
    };
  }

  // Check 5: Similar names with same vintage
  if (similarity >= 0.7 && metrics1.vintageYear === metrics2.vintageYear && metrics1.vintageYear !== null) {
    return {
      reason: `Similar names with same vintage year (${metrics1.vintageYear})`,
      confidence: 'low',
    };
  }

  return null;
}

/**
 * Normalize fund name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
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

/**
 * Calculate cash flow overlap between two funds
 * Returns ratio of matching cash flows to total unique cash flows
 */
function calculateCashFlowOverlap(fund1: Fund, fund2: Fund): number {
  const cf1 = fund1.cashFlows || [];
  const cf2 = fund2.cashFlows || [];

  if (cf1.length === 0 || cf2.length === 0) return 0;

  // Create sets of cash flow signatures
  const sig1 = new Set(cf1.map((cf) => `${cf.date}|${cf.type}|${cf.amount}`));
  const sig2 = new Set(cf2.map((cf) => `${cf.date}|${cf.type}|${cf.amount}`));

  // Count matches
  let matches = 0;
  for (const sig of sig1) {
    if (sig2.has(sig)) matches++;
  }

  // Return ratio of matches to smaller set
  const minSize = Math.min(sig1.size, sig2.size);
  return minSize > 0 ? matches / minSize : 0;
}
