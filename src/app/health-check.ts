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
 * Health check results summary
 */
export interface HealthCheckResult {
  totalFunds: number;
  fundsWithIssues: number;
  issues: HealthIssue[];
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

  // Sort by severity (errors first, then warnings, then info)
  const severityOrder: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    totalFunds: funds.length,
    fundsWithIssues: fundsWithIssuesSet.size,
    issues,
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
