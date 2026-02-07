/**
 * Table rendering and sorting functionality
 */

import type { Fund, FundMetrics, FundWithMetrics, SortColumn, CashFlow, Nav, Group } from '../types';
import { AppState } from '../core/state';
import { calculateMetricsCached, calculateIRR, calculateMOIC, parseCashFlowsForIRR, calculateMetrics } from '../calculations';
import { escapeHtml, escapeAttribute } from '../utils/escaping';
import { formatCurrency } from '../utils/formatting';

/**
 * Represents a consolidated fund (grouped by fund name across multiple investors)
 */
export interface ConsolidatedFund extends Fund {
  investorCount: number;
  consolidatedMetrics: FundMetrics;
}

/**
 * Represents a group with aggregated metrics from all funds in the group
 */
export interface ConsolidatedGroup {
  groupId: number | null; // null for "No Group"
  groupName: string;
  group: Group | null;
  fundCount: number;
  investorCount: number;
  metrics: FundMetrics;
  children: ConsolidatedGroup[];
  depth: number;
  isExpanded: boolean;
}

/**
 * Format MOIC (Multiple on Invested Capital) for display
 * @param moic - MOIC value as decimal (e.g., 1.5 = 1.5x)
 * @returns Formatted string with 'x' suffix, or 'N/A' if invalid
 */
function formatMOIC(moic: number | null): string {
  if (moic === null || moic === undefined || !isFinite(moic)) return 'N/A';
  return moic.toFixed(2) + 'x';
}

/**
 * Format IRR (Internal Rate of Return) for display
 * @param irr - IRR as decimal (e.g., 0.15 = 15%)
 * @returns Formatted percentage string, or 'N/A' if invalid
 */
function formatIRR(irr: number | null): string {
  if (irr === null || irr === undefined || !isFinite(irr)) return 'N/A';
  return (irr * 100).toFixed(2) + '%';
}

/**
 * Render fund tags as HTML badges
 * @param fundName - The fund name to look up tags for
 * @param showTags - Whether tags should be displayed
 * @returns HTML string with tag badges, or empty string
 */
function renderFundTags(fundName: string, showTags: boolean): string {
  if (!showTags) return '';
  const fundNameObj = AppState.fundNameData.get(fundName);
  const tags = fundNameObj?.tags || [];
  if (tags.length === 0) return '';
  return `<div class="table-tags">${tags.map((tag) => `<span class="table-tag">${escapeHtml(tag)}</span>`).join('')}</div>`;
}

/**
 * Calculate investment return from fund metrics
 * @param m - Fund metrics object
 * @returns Investment return value (distributions + NAV - called capital)
 */
function getInvestmentReturn(m: FundMetrics): number {
  return m.investmentReturn ?? (m.distributions + m.nav - m.calledCapital);
}

/**
 * Get the immediate parent group name for a fund
 * @param fund - The fund to look up
 * @returns Parent group name, or empty string if no group
 */
function getImmediateParentName(fund: Fund): string {
  if (!fund.groupId) return '';
  const group = AppState.getGroupByIdSync(fund.groupId);
  return group ? group.name : '';
}

/**
 * Get display text showing parent group and account number
 * @param fund - The fund to display
 * @returns Formatted string like "Parent Name (ACC123)" or just account number
 */
function getParentAccountDisplay(fund: Fund): string {
  const parentName = getImmediateParentName(fund);
  return parentName ? `${parentName} (${fund.accountNumber})` : fund.accountNumber;
}

/**
 * Generate HTML for investor cell with group name and account number
 * @param fund - The fund to display
 * @returns HTML string for investor cell content
 */
function getInvestorCellHtml(fund: Fund): string {
  const groupName = getImmediateParentName(fund);
  if (groupName) {
    return `<div>${escapeHtml(groupName)}</div><div style="font-size: 0.85em; color: var(--color-text-light);">${escapeHtml(fund.accountNumber)}</div>`;
  }
  return escapeHtml(fund.accountNumber);
}

/**
 * Sort data by multiple columns
 * Uses lazy evaluation - only calculates metrics when needed for comparison
 */
export function sortData(funds: Fund[], sortColumns: SortColumn[], cutoffDate?: Date): Fund[] {
  if (sortColumns.length === 0) return funds;

  // Check if any sort column requires metrics calculation
  const metricsColumns = new Set(['vintage', 'commitment', 'totalContributions', 'totalDistributions', 'nav', 'investmentReturn', 'moic', 'irr', 'outstandingCommitment']);
  const needsMetrics = sortColumns.some(({ column }) => metricsColumns.has(column));

  // Lazy metrics map - only populated when needed
  const metricsMap = new Map<number, FundMetrics>();
  const getMetrics = (fund: Fund): FundMetrics => {
    if (fund.id != null) {
      let metrics = metricsMap.get(fund.id);
      if (!metrics) {
        metrics = calculateMetricsCached(fund, cutoffDate);
        metricsMap.set(fund.id, metrics);
      }
      return metrics;
    }
    return calculateMetricsCached(fund, cutoffDate);
  };

  // Cache parent account display strings to avoid repeated group lookups during sort
  // This is O(n) upfront vs O(n log n) lookups in the comparator
  const needsAccountSort = sortColumns.some(({ column }) => column === 'accountNumber');
  const accountDisplayMap = new Map<number, string>();
  if (needsAccountSort) {
    for (const fund of funds) {
      if (fund.id != null) {
        accountDisplayMap.set(fund.id, getParentAccountDisplay(fund));
      }
    }
  }
  const getAccountDisplay = (fund: Fund): string => {
    if (fund.id != null) {
      return accountDisplayMap.get(fund.id) ?? getParentAccountDisplay(fund);
    }
    return getParentAccountDisplay(fund);
  };

  return [...funds].sort((a, b) => {
    for (const { column, direction } of sortColumns) {
      const multiplier = direction === 'asc' ? 1 : -1;
      let comparison = 0;

      // Only calculate metrics when sorting by metrics-based columns
      const metricsA = needsMetrics ? getMetrics(a) : undefined;
      const metricsB = needsMetrics ? getMetrics(b) : undefined;

      switch (column) {
        case 'fundName':
          comparison = a.fundName.localeCompare(b.fundName);
          break;
        case 'accountNumber':
          comparison = getAccountDisplay(a).localeCompare(getAccountDisplay(b));
          break;
        case 'vintage':
          // Treat N/A (null) as newest so it appears at end when ascending, start when descending
          comparison = (metricsA!.vintageYear ?? Infinity) - (metricsB!.vintageYear ?? Infinity);
          break;
        case 'commitment':
          comparison = (metricsA!.commitment || 0) - (metricsB!.commitment || 0);
          break;
        case 'totalContributions':
          comparison = (metricsA!.calledCapital || 0) - (metricsB!.calledCapital || 0);
          break;
        case 'totalDistributions':
          comparison = (metricsA!.distributions || 0) - (metricsB!.distributions || 0);
          break;
        case 'nav':
          comparison = (metricsA!.nav || 0) - (metricsB!.nav || 0);
          break;
        case 'investmentReturn':
          comparison = (metricsA!.investmentReturn || 0) - (metricsB!.investmentReturn || 0);
          break;
        case 'moic':
          comparison = (metricsA!.moic || 0) - (metricsB!.moic || 0);
          break;
        case 'irr':
          comparison = (metricsA!.irr || 0) - (metricsB!.irr || 0);
          break;
        case 'outstandingCommitment':
          comparison = (metricsA!.outstandingCommitment || 0) - (metricsB!.outstandingCommitment || 0);
          break;
        default:
          comparison = 0;
      }

      if (comparison !== 0) {
        return comparison * multiplier;
      }
    }
    return 0;
  });
}

/**
 * Render fund row HTML
 * @param fund - Fund with calculated metrics
 * @param _index - Row index (unused, kept for API consistency with array.map callbacks)
 * @param showTags - Whether to display fund tags
 * @returns HTML string for the table row cells
 */
export function renderFundRow(
  fund: FundWithMetrics,
  _index: number,
  showTags: boolean = false
): string {
  const m = fund.metrics;
  const tagsHtml = renderFundTags(fund.fundName, showTags);
  const investmentReturn = getInvestmentReturn(m);

  return `
    <td>
      <div>${escapeHtml(fund.fundName)}</div>
      ${tagsHtml}
    </td>
    <td title="${escapeHtml(getParentAccountDisplay(fund))}">${getInvestorCellHtml(fund)}</td>
    <td class="center">${m.vintageYear || 'N/A'}</td>
    <td class="number">${formatCurrency(m.commitment || 0)}</td>
    <td class="number">${formatCurrency(m.calledCapital)}</td>
    <td class="number">${formatCurrency(m.distributions)}</td>
    <td class="number">${formatCurrency(m.nav)}</td>
    <td class="number ${investmentReturn >= 0 ? 'positive' : 'negative'}">${formatCurrency(investmentReturn)}</td>
    <td class="number">${formatMOIC(m.moic)}</td>
    <td class="number ${m.irr !== null && m.irr >= 0 ? 'positive' : 'negative'}">${formatIRR(m.irr)}</td>
    <td class="number">${formatCurrency(m.outstandingCommitment)}</td>
    <td class="center">
      <button class="btn-icon table-action-btn" data-action="menu" data-fund-id="${escapeAttribute(String(fund.id))}" title="Actions" aria-label="Actions for ${escapeHtml(fund.fundName)}">⚙</button>
    </td>
  `;
}

/**
 * Calculate aggregate totals for a list of funds
 */
export function calculateTotals(
  fundsWithMetrics: FundWithMetrics[],
  cutoffDate?: Date
): {
  commitment: number;
  calledCapital: number;
  distributions: number;
  nav: number;
  investmentReturn: number;
  outstandingCommitment: number;
  aggregateIRR: number | null;
  aggregateMOIC: number | null;
  aggregateDPI: number | null;
  aggregateRVPI: number | null;
  aggregateTVPI: number | null;
} {
  const totals = {
    commitment: 0,
    calledCapital: 0,
    distributions: 0,
    nav: 0,
    investmentReturn: 0,
    outstandingCommitment: 0,
    aggregateFlows: [] as { date: string; amount: number }[],
  };

  fundsWithMetrics.forEach((fund) => {
    const m = fund.metrics;
    totals.commitment += m.commitment || 0;
    totals.calledCapital += m.calledCapital;
    totals.distributions += m.distributions;
    totals.nav += m.nav;
    totals.investmentReturn += m.investmentReturn ?? (m.distributions + m.nav - m.calledCapital);
    totals.outstandingCommitment += m.outstandingCommitment;

    const flows = parseCashFlowsForIRR(fund, cutoffDate);
    totals.aggregateFlows.push(...flows);
  });

  const aggregateIRR = calculateIRR(totals.aggregateFlows);
  const aggregateMOIC = calculateMOIC(totals.aggregateFlows);

  // Calculate aggregate DPI, RVPI, TVPI
  const aggregateDPI = totals.calledCapital > 0 ? totals.distributions / totals.calledCapital : null;
  const aggregateRVPI = totals.calledCapital > 0 ? totals.nav / totals.calledCapital : null;
  const aggregateTVPI =
    totals.calledCapital > 0 ? (totals.distributions + totals.nav) / totals.calledCapital : null;

  return {
    commitment: totals.commitment,
    calledCapital: totals.calledCapital,
    distributions: totals.distributions,
    nav: totals.nav,
    investmentReturn: totals.investmentReturn,
    outstandingCommitment: totals.outstandingCommitment,
    aggregateIRR,
    aggregateMOIC,
    aggregateDPI,
    aggregateRVPI,
    aggregateTVPI,
  };
}

/**
 * Render totals row HTML
 */
export function renderTotalsRow(
  totals: ReturnType<typeof calculateTotals>
): string {
  return `
    <td><strong>Total</strong></td>
    <td></td>
    <td></td>
    <td class="number"><strong>${formatCurrency(totals.commitment)}</strong></td>
    <td class="number"><strong>${formatCurrency(totals.calledCapital)}</strong></td>
    <td class="number"><strong>${formatCurrency(totals.distributions)}</strong></td>
    <td class="number"><strong>${formatCurrency(totals.nav)}</strong></td>
    <td class="number ${totals.investmentReturn >= 0 ? 'positive' : 'negative'}"><strong>${formatCurrency(totals.investmentReturn)}</strong></td>
    <td class="number"><strong>${formatMOIC(totals.aggregateMOIC)}</strong></td>
    <td class="number ${totals.aggregateIRR !== null && totals.aggregateIRR >= 0 ? 'positive' : 'negative'}"><strong>${formatIRR(totals.aggregateIRR)}</strong></td>
    <td class="number"><strong>${formatCurrency(totals.outstandingCommitment)}</strong></td>
    <td></td>
  `;
}

/**
 * Update portfolio summary statistics
 * Batches DOM lookups and updates for better performance
 */
export function updatePortfolioSummary(
  fundsWithMetrics: FundWithMetrics[],
  cutoffDate?: Date
): void {
  const totals = calculateTotals(fundsWithMetrics, cutoffDate);
  const uniqueFunds = new Set(fundsWithMetrics.map((f) => f.fundName));

  // Batch DOM lookups - get all elements at once
  const elements = {
    investmentCount: document.getElementById('summaryInvestmentCount'),
    fundCount: document.getElementById('summaryFundCount'),
    commitment: document.getElementById('summaryCommitment'),
    nav: document.getElementById('summaryNav'),
    irr: document.getElementById('summaryIRR'),
    moic: document.getElementById('summaryMOIC'),
    dpi: document.getElementById('summaryDPI'),
    rvpi: document.getElementById('summaryRVPI'),
    tvpi: document.getElementById('summaryTVPI'),
  };

  // Batch DOM updates - apply all changes
  if (elements.investmentCount) elements.investmentCount.textContent = fundsWithMetrics.length.toString();
  if (elements.fundCount) elements.fundCount.textContent = uniqueFunds.size.toString();
  if (elements.commitment) elements.commitment.textContent = formatCurrency(totals.commitment);
  if (elements.nav) elements.nav.textContent = formatCurrency(totals.nav);
  if (elements.irr) elements.irr.textContent = formatIRR(totals.aggregateIRR);
  if (elements.moic) elements.moic.textContent = formatMOIC(totals.aggregateMOIC);
  if (elements.dpi) elements.dpi.textContent = totals.aggregateDPI !== null ? totals.aggregateDPI.toFixed(2) + 'x' : 'N/A';
  if (elements.rvpi) elements.rvpi.textContent = totals.aggregateRVPI !== null ? totals.aggregateRVPI.toFixed(2) + 'x' : 'N/A';
  if (elements.tvpi) elements.tvpi.textContent = totals.aggregateTVPI !== null ? totals.aggregateTVPI.toFixed(2) + 'x' : 'N/A';
}

/**
 * Update sort indicator in table headers using CSS classes
 * Uses CSS ::after pseudo-elements for indicators (no DOM manipulation)
 */
export function updateSortIndicators(sortColumns: SortColumn[]): void {
  // Single DOM query, cache for reuse
  const allThs = document.querySelectorAll('#fundsTable th');

  // Build a map of column name to sort info for O(1) lookup
  const sortMap = new Map<string, { direction: string; priority: number }>();
  sortColumns.forEach(({ column, direction }, index) => {
    sortMap.set(column, { direction, priority: index + 1 });
  });

  // Single pass through all headers
  allThs.forEach((th) => {
    // Clear existing indicators
    th.classList.remove('sorted-asc', 'sorted-desc');
    (th as HTMLElement).removeAttribute('data-sort-priority');

    // Apply new indicators if this column is sorted
    const sortCol = (th as HTMLElement).getAttribute('data-sort');
    if (sortCol) {
      const sortInfo = sortMap.get(sortCol);
      if (sortInfo) {
        th.classList.add(sortInfo.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
        if (sortColumns.length > 1) {
          (th as HTMLElement).setAttribute('data-sort-priority', sortInfo.priority.toString());
        }
      }
    }
  });
}

/**
 * Consolidate funds by fund name, aggregating metrics from all investors
 */
export function consolidateFundsByName(
  fundsWithMetrics: FundWithMetrics[],
  cutoffDate?: Date,
  sortColumns: SortColumn[] = []
): ConsolidatedFund[] {
  const fundGroups = new Map<string, FundWithMetrics[]>();

  // Group funds by fundName
  for (const fund of fundsWithMetrics) {
    const existing = fundGroups.get(fund.fundName) || [];
    existing.push(fund);
    fundGroups.set(fund.fundName, existing);
  }

  // Create consolidated funds
  const consolidated: ConsolidatedFund[] = [];
  const cutoffStr: string = cutoffDate ? cutoffDate.toISOString().split('T')[0] ?? '' : '';

  for (const [fundName, funds] of fundGroups) {
    // Collect fund IDs for cache lookup
    const fundIds = funds.map((f) => f.id).filter((id): id is number => id != null);

    // Check cache first
    const cachedMetrics = AppState.getConsolidatedMetricsFromCache(fundName, cutoffStr, fundIds);

    let consolidatedMetrics: FundMetrics;

    if (cachedMetrics) {
      // Use cached metrics
      consolidatedMetrics = cachedMetrics;
    } else {
      // Calculate metrics - merge all cash flows and sum NAVs
      const allCashFlows: CashFlow[] = [];
      let sumCommitment = 0;
      let totalNav = 0;
      let latestNavDate: string | null = null;

      for (const fund of funds) {
        // Use direct iteration instead of spread to avoid repeated array allocations
        for (const cf of fund.cashFlows) {
          allCashFlows.push(cf);
        }
        sumCommitment += fund.commitment;

        // Sum each fund's NAV (already correctly calculated in metrics)
        totalNav += fund.metrics.nav;

        // Track the latest NAV date across all funds
        if (fund.metrics.navDate) {
          if (!latestNavDate || fund.metrics.navDate > latestNavDate) {
            latestNavDate = fund.metrics.navDate;
          }
        }
      }

      // Create a synthetic NAV entry with the summed total
      const syntheticNavDate: string = latestNavDate ?? new Date().toISOString().split('T')[0] ?? '';
      const syntheticNav: Nav[] = [{ date: syntheticNavDate, amount: totalNav }];

      // Create a synthetic fund for metrics calculation
      const syntheticFund: Fund = {
        fundName,
        accountNumber: `${funds.length} investor${funds.length !== 1 ? 's' : ''}`,
        commitment: sumCommitment,
        cashFlows: allCashFlows,
        monthlyNav: syntheticNav,
        groupId: null,
        timestamp: new Date().toISOString(),
      };

      // Calculate consolidated metrics
      consolidatedMetrics = calculateMetrics(syntheticFund, cutoffDate);

      // Cache the result
      AppState.setConsolidatedMetricsCache(fundName, cutoffStr, fundIds, consolidatedMetrics);
    }

    // Build the consolidated fund object
    const firstFund = funds[0];
    const totalCommitment = funds.reduce((sum, f) => sum + f.commitment, 0);

    const consolidatedFund: ConsolidatedFund = {
      fundName,
      accountNumber: `${funds.length} investor${funds.length !== 1 ? 's' : ''}`,
      commitment: totalCommitment,
      cashFlows: [], // Not needed for display
      monthlyNav: [], // Not needed for display
      groupId: null,
      timestamp: new Date().toISOString(),
      id: firstFund?.id, // Use first fund's ID for fund name lookup
      investorCount: funds.length,
      consolidatedMetrics,
    };

    consolidated.push(consolidatedFund);
  }

  // Sort consolidated funds
  if (sortColumns.length > 0) {
    consolidated.sort((a, b) => {
      for (const { column, direction } of sortColumns) {
        const multiplier = direction === 'asc' ? 1 : -1;
        let comparison = 0;

        const metricsA = a.consolidatedMetrics;
        const metricsB = b.consolidatedMetrics;

        switch (column) {
          case 'fundName':
            comparison = a.fundName.localeCompare(b.fundName);
            break;
          case 'accountNumber':
            // Sort by investor count when grouped
            comparison = a.investorCount - b.investorCount;
            break;
          case 'vintage':
            // Treat N/A (null) as newest so it appears at end when ascending, start when descending
            comparison = (metricsA.vintageYear ?? Infinity) - (metricsB.vintageYear ?? Infinity);
            break;
          case 'commitment':
            comparison = (metricsA.commitment || 0) - (metricsB.commitment || 0);
            break;
          case 'totalContributions':
            comparison = metricsA.calledCapital - metricsB.calledCapital;
            break;
          case 'totalDistributions':
            comparison = metricsA.distributions - metricsB.distributions;
            break;
          case 'nav':
            comparison = metricsA.nav - metricsB.nav;
            break;
          case 'investmentReturn':
            comparison = (metricsA.investmentReturn || 0) - (metricsB.investmentReturn || 0);
            break;
          case 'moic':
            comparison = (metricsA.moic || 0) - (metricsB.moic || 0);
            break;
          case 'irr':
            comparison = (metricsA.irr || 0) - (metricsB.irr || 0);
            break;
          case 'outstandingCommitment':
            comparison = metricsA.outstandingCommitment - metricsB.outstandingCommitment;
            break;
          default:
            comparison = 0;
        }

        if (comparison !== 0) {
          return comparison * multiplier;
        }
      }
      return 0;
    });
  } else {
    // Default sort by fund name
    consolidated.sort((a, b) => a.fundName.localeCompare(b.fundName));
  }

  return consolidated;
}

/**
 * Render a consolidated (grouped) fund row
 */
export function renderGroupedFundRow(
  fund: ConsolidatedFund,
  _index: number,
  showTags: boolean = false
): string {
  const m = fund.consolidatedMetrics;
  const tagsHtml = renderFundTags(fund.fundName, showTags);
  const investmentReturn = getInvestmentReturn(m);

  return `
    <td>
      <div>${escapeHtml(fund.fundName)}</div>
      ${tagsHtml}
    </td>
    <td class="center"><span class="investor-count" aria-label="${fund.investorCount} investor${fund.investorCount !== 1 ? 's' : ''}">${fund.investorCount} investor${fund.investorCount !== 1 ? 's' : ''}</span></td>
    <td class="center">${m.vintageYear || 'N/A'}</td>
    <td class="number">${formatCurrency(m.commitment || 0)}</td>
    <td class="number">${formatCurrency(m.calledCapital)}</td>
    <td class="number">${formatCurrency(m.distributions)}</td>
    <td class="number">${formatCurrency(m.nav)}</td>
    <td class="number ${investmentReturn >= 0 ? 'positive' : 'negative'}">${formatCurrency(investmentReturn)}</td>
    <td class="number">${formatMOIC(m.moic)}</td>
    <td class="number ${m.irr !== null && m.irr >= 0 ? 'positive' : 'negative'}">${formatIRR(m.irr)}</td>
    <td class="number">${formatCurrency(m.outstandingCommitment)}</td>
    <td class="center">
      <button class="btn-icon table-action-btn" data-action="edit-fund" data-fund-name="${escapeAttribute(fund.fundName)}" title="Edit Fund Name" aria-label="Edit ${escapeHtml(fund.fundName)}">⚙</button>
    </td>
  `;
}

/**
 * Consolidate funds by group, creating a hierarchical tree structure
 */
export function consolidateFundsByGroup(
  fundsWithMetrics: FundWithMetrics[],
  cutoffDate?: Date,
  expandedGroupIds: Set<number | string> = new Set()
): ConsolidatedGroup[] {
  // Group funds by their groupId
  const fundsByGroupId = new Map<number | null, FundWithMetrics[]>();

  for (const fund of fundsWithMetrics) {
    const groupId = fund.groupId ?? null;
    const existing = fundsByGroupId.get(groupId) || [];
    existing.push(fund);
    fundsByGroupId.set(groupId, existing);
  }

  // Build a map of all groups that have funds (directly or via descendants)
  const groupsWithFunds = new Set<number>();

  // First, mark all groups that directly have funds
  for (const groupId of fundsByGroupId.keys()) {
    if (groupId !== null) {
      groupsWithFunds.add(groupId);
      // Also mark all ancestors as having funds (so they show in the tree)
      const ancestors = AppState.getAncestorIds(groupId);
      for (const ancestorId of ancestors) {
        groupsWithFunds.add(ancestorId);
      }
    }
  }

  // Calculate metrics for a group (aggregating all funds in the group and descendants)
  function calculateGroupMetrics(groupId: number | null): {
    metrics: FundMetrics;
    fundCount: number;
    investorCount: number;
    allFunds: FundWithMetrics[];
  } {
    let allFunds: FundWithMetrics[] = [];

    if (groupId === null) {
      // "No Group" - just the ungrouped funds
      allFunds = fundsByGroupId.get(null) || [];
    } else {
      // Get all funds in this group and all descendant groups
      const descendantIds = AppState.getDescendantIds(groupId);
      for (const descId of descendantIds) {
        const funds = fundsByGroupId.get(descId);
        if (funds) {
          allFunds.push(...funds);
        }
      }
    }

    if (allFunds.length === 0) {
      return {
        metrics: {
          vintageYear: null,
          commitment: 0,
          calledCapital: 0,
          distributions: 0,
          nav: 0,
          navDate: null,
          outstandingCommitment: 0,
          investmentReturn: 0,
          irr: null,
          moic: null,
          dpi: null,
          rvpi: null,
          tvpi: null,
        },
        fundCount: 0,
        investorCount: 0,
        allFunds: [],
      };
    }

    // Merge all cash flows and sum values
    const allCashFlows: CashFlow[] = [];
    let sumCommitment = 0;
    let totalNav = 0;
    let latestNavDate: string | null = null;
    const uniqueFunds = new Set<string>();

    for (const fund of allFunds) {
      // Use direct iteration instead of spread to avoid repeated array allocations
      for (const cf of fund.cashFlows) {
        allCashFlows.push(cf);
      }
      sumCommitment += fund.commitment;
      totalNav += fund.metrics.nav;
      uniqueFunds.add(fund.fundName);

      if (fund.metrics.navDate) {
        if (!latestNavDate || fund.metrics.navDate > latestNavDate) {
          latestNavDate = fund.metrics.navDate;
        }
      }
    }

    // Create synthetic fund for metrics calculation
    const syntheticNavDate: string = latestNavDate ?? new Date().toISOString().split('T')[0] ?? '';
    const syntheticNav: Nav[] = [{ date: syntheticNavDate, amount: totalNav }];

    const syntheticFund: Fund = {
      fundName: 'Synthetic',
      accountNumber: 'Synthetic',
      commitment: sumCommitment,
      cashFlows: allCashFlows,
      monthlyNav: syntheticNav,
      groupId: null,
      timestamp: new Date().toISOString(),
    };

    const metrics = calculateMetrics(syntheticFund, cutoffDate);

    return {
      metrics,
      fundCount: uniqueFunds.size,
      investorCount: allFunds.length,
      allFunds,
    };
  }

  // Build tree recursively
  function buildGroupNode(groupId: number | null, depth: number): ConsolidatedGroup | null {
    const group = groupId !== null ? (AppState.getGroupByIdSync(groupId) ?? null) : null;
    const groupName = group?.name ?? 'No Group';

    // For non-null groups, check if this group or any descendant has funds
    if (groupId !== null && !groupsWithFunds.has(groupId)) {
      return null;
    }

    const { metrics, fundCount, investorCount } = calculateGroupMetrics(groupId);

    // Build children (only for actual groups, not "No Group")
    const children: ConsolidatedGroup[] = [];
    if (groupId !== null) {
      const childIds = AppState.getDirectChildIds(groupId);
      for (const childId of childIds) {
        const childNode = buildGroupNode(childId, depth + 1);
        if (childNode) {
          children.push(childNode);
        }
      }
      // Sort children by name
      children.sort((a, b) => a.groupName.localeCompare(b.groupName));
    }

    const isExpanded = groupId === null || expandedGroupIds.has(groupId) || expandedGroupIds.has(String(groupId));

    return {
      groupId,
      groupName,
      group,
      fundCount,
      investorCount,
      metrics,
      children,
      depth,
      isExpanded,
    };
  }

  // Build the tree starting from top-level groups
  const result: ConsolidatedGroup[] = [];

  // Get all top-level groups (parentGroupId is null)
  const topLevelGroups = AppState.getGroups().filter(g => g.parentGroupId === null);

  for (const group of topLevelGroups) {
    const node = buildGroupNode(group.id, 0);
    if (node) {
      result.push(node);
    }
  }

  // Sort top-level groups by name
  result.sort((a, b) => a.groupName.localeCompare(b.groupName));

  // Add "No Group" if there are ungrouped funds
  const ungroupedFunds = fundsByGroupId.get(null);
  if (ungroupedFunds && ungroupedFunds.length > 0) {
    const noGroupNode = buildGroupNode(null, 0);
    if (noGroupNode) {
      result.push(noGroupNode);
    }
  }

  return result;
}

/**
 * Flatten the group tree for rendering, respecting expanded state
 */
export function flattenGroupTree(groups: ConsolidatedGroup[]): ConsolidatedGroup[] {
  const result: ConsolidatedGroup[] = [];

  function traverse(nodes: ConsolidatedGroup[]): void {
    for (const node of nodes) {
      result.push(node);
      if (node.isExpanded && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(groups);
  return result;
}

/**
 * Render a group row for the group-by-group view
 */
export function renderGroupRow(
  group: ConsolidatedGroup,
  _index: number
): string {
  const m = group.metrics;
  const investmentReturn = getInvestmentReturn(m);
  const hasChildren = group.children.length > 0;
  const expandIcon = hasChildren
    ? (group.isExpanded ? '&#9660;' : '&#9654;')
    : '<span style="display:inline-block;width:12px;"></span>';

  const indentPx = group.depth * 20;
  const groupType = group.group?.type ? ` <span class="group-type-badge">${escapeHtml(group.group.type)}</span>` : '';
  const expandLabel = group.isExpanded ? `Collapse ${group.groupName}` : `Expand ${group.groupName}`;

  return `
    <td style="--group-indent: ${indentPx + 8}px">
      <div class="group-name-cell">
        ${hasChildren ? `<button class="btn-expand" data-group-id="${group.groupId}" title="${group.isExpanded ? 'Collapse' : 'Expand'}" aria-label="${escapeAttribute(expandLabel)}" aria-expanded="${group.isExpanded}">${expandIcon}</button>` : `<span class="expand-placeholder">${expandIcon}</span>`}
        <span class="group-name">${escapeHtml(group.groupName)}</span>${groupType}
      </div>
    </td>
    <td class="center"><span class="investor-count" aria-label="${group.fundCount} fund${group.fundCount !== 1 ? 's' : ''}, ${group.investorCount} position${group.investorCount !== 1 ? 's' : ''}">${group.fundCount} fund${group.fundCount !== 1 ? 's' : ''}, ${group.investorCount} position${group.investorCount !== 1 ? 's' : ''}</span></td>
    <td class="center">${m.vintageYear || 'N/A'}</td>
    <td class="number">${formatCurrency(m.commitment || 0)}</td>
    <td class="number">${formatCurrency(m.calledCapital)}</td>
    <td class="number">${formatCurrency(m.distributions)}</td>
    <td class="number">${formatCurrency(m.nav)}</td>
    <td class="number ${investmentReturn >= 0 ? 'positive' : 'negative'}">${formatCurrency(investmentReturn)}</td>
    <td class="number">${formatMOIC(m.moic)}</td>
    <td class="number ${m.irr !== null && m.irr >= 0 ? 'positive' : 'negative'}">${formatIRR(m.irr)}</td>
    <td class="number">${formatCurrency(m.outstandingCommitment)}</td>
    <td class="center">
      ${group.groupId !== null ? `<button class="btn-icon table-action-btn" data-action="edit-group" data-group-id="${group.groupId}" title="Edit Group" aria-label="Edit ${escapeHtml(group.groupName)}">⚙</button>` : ''}
    </td>
  `;
}
