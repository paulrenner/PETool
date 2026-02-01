/**
 * Table rendering and sorting functionality
 */

import type { Fund, FundMetrics, FundWithMetrics, SortColumn, CashFlow, Nav } from '../types';
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
 * Format MOIC for display
 */
function formatMOIC(moic: number | null): string {
  if (moic === null || moic === undefined || !isFinite(moic)) return 'N/A';
  return moic.toFixed(2) + 'x';
}

/**
 * Format IRR for display
 */
function formatIRR(irr: number | null): string {
  if (irr === null || irr === undefined || !isFinite(irr)) return 'N/A';
  return (irr * 100).toFixed(2) + '%';
}

/**
 * Get immediate parent group name for a fund
 */
function getImmediateParentName(fund: Fund): string {
  if (!fund.groupId) return '';
  const group = AppState.getGroupByIdSync(fund.groupId);
  return group ? group.name : '';
}

/**
 * Get parent name + account display text
 */
function getParentAccountDisplay(fund: Fund): string {
  const parentName = getImmediateParentName(fund);
  return parentName ? `${parentName} (${fund.accountNumber})` : fund.accountNumber;
}

/**
 * Get HTML for investor cell display
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
 */
export function sortData(funds: Fund[], sortColumns: SortColumn[], cutoffDate?: Date): Fund[] {
  if (sortColumns.length === 0) return funds;

  // Pre-calculate metrics for all funds using cache to avoid redundant calculations
  const metricsMap = new Map<number, FundMetrics>();
  for (const fund of funds) {
    if (fund.id != null) {
      metricsMap.set(fund.id, calculateMetricsCached(fund, cutoffDate));
    }
  }

  return [...funds].sort((a, b) => {
    for (const { column, direction } of sortColumns) {
      const multiplier = direction === 'asc' ? 1 : -1;
      let comparison = 0;

      // Use pre-calculated metrics (already cached)
      const metricsA = a.id != null ? metricsMap.get(a.id) : calculateMetricsCached(a, cutoffDate);
      const metricsB = b.id != null ? metricsMap.get(b.id) : calculateMetricsCached(b, cutoffDate);

      switch (column) {
        case 'fundName':
          comparison = a.fundName.localeCompare(b.fundName);
          break;
        case 'accountNumber':
          comparison = getParentAccountDisplay(a).localeCompare(getParentAccountDisplay(b));
          break;
        case 'vintage':
          const vintageA = metricsA?.vintageYear || 0;
          const vintageB = metricsB?.vintageYear || 0;
          comparison = vintageA - vintageB;
          break;
        case 'commitment':
          comparison = (metricsA?.commitment || 0) - (metricsB?.commitment || 0);
          break;
        case 'totalContributions':
          comparison = (metricsA?.calledCapital || 0) - (metricsB?.calledCapital || 0);
          break;
        case 'totalDistributions':
          comparison = (metricsA?.distributions || 0) - (metricsB?.distributions || 0);
          break;
        case 'nav':
          comparison = (metricsA?.nav || 0) - (metricsB?.nav || 0);
          break;
        case 'investmentReturn':
          comparison = (metricsA?.investmentReturn || 0) - (metricsB?.investmentReturn || 0);
          break;
        case 'moic':
          comparison = (metricsA?.moic || 0) - (metricsB?.moic || 0);
          break;
        case 'irr':
          comparison = (metricsA?.irr || 0) - (metricsB?.irr || 0);
          break;
        case 'outstandingCommitment':
          comparison = (metricsA?.outstandingCommitment || 0) - (metricsB?.outstandingCommitment || 0);
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
 */
export function renderFundRow(
  fund: FundWithMetrics,
  _index: number,
  showTags: boolean = false
): string {
  const m = fund.metrics;
  const fundNameObj = AppState.fundNameData.get(fund.fundName);
  const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
  const tagsHtml =
    showTags && tags.length > 0
      ? `<div class="table-tags">${tags.map((tag) => `<span class="table-tag">${escapeHtml(tag)}</span>`).join('')}</div>`
      : '';

  const investmentReturn = m.investmentReturn ?? (m.distributions + m.nav - m.calledCapital);

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
      <button class="btn-icon fund-actions-btn" data-fund-id="${escapeAttribute(String(fund.id))}" title="Actions" aria-label="Actions for ${escapeHtml(fund.fundName)}">⚙</button>
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
 */
export function updatePortfolioSummary(
  fundsWithMetrics: FundWithMetrics[],
  cutoffDate?: Date
): void {
  const totals = calculateTotals(fundsWithMetrics, cutoffDate);
  const uniqueFunds = new Set(fundsWithMetrics.map((f) => f.fundName));

  // Update DOM elements
  const setElement = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setElement('summaryInvestmentCount', fundsWithMetrics.length.toString());
  setElement('summaryFundCount', uniqueFunds.size.toString());
  setElement('summaryCommitment', formatCurrency(totals.commitment));
  setElement('summaryNav', formatCurrency(totals.nav));
  setElement('summaryIRR', formatIRR(totals.aggregateIRR));
  setElement('summaryMOIC', formatMOIC(totals.aggregateMOIC));
  setElement('summaryDPI', totals.aggregateDPI !== null ? totals.aggregateDPI.toFixed(2) + 'x' : 'N/A');
  setElement('summaryRVPI', totals.aggregateRVPI !== null ? totals.aggregateRVPI.toFixed(2) + 'x' : 'N/A');
  setElement('summaryTVPI', totals.aggregateTVPI !== null ? totals.aggregateTVPI.toFixed(2) + 'x' : 'N/A');
}

/**
 * Update sort indicator in table headers using CSS classes
 * Uses CSS ::after pseudo-elements for indicators (no DOM manipulation)
 */
export function updateSortIndicators(sortColumns: SortColumn[]): void {
  // Clear existing indicators using CSS classes only
  document.querySelectorAll('#fundsTable th').forEach((th) => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    (th as HTMLElement).removeAttribute('data-sort-priority');
  });

  // Add CSS-based indicators for current sort columns
  sortColumns.forEach(({ column, direction }, index) => {
    const th = document.querySelector(`#fundsTable th[data-sort="${column}"]`);
    if (th) {
      th.classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
      // Set priority for multi-column sort (CSS handles the display)
      if (sortColumns.length > 1) {
        (th as HTMLElement).setAttribute('data-sort-priority', (index + 1).toString());
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
        allCashFlows.push(...fund.cashFlows);
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
            comparison = (metricsA.vintageYear || 0) - (metricsB.vintageYear || 0);
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
  const fundNameObj = AppState.fundNameData.get(fund.fundName);
  const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
  const tagsHtml =
    showTags && tags.length > 0
      ? `<div class="table-tags">${tags.map((tag) => `<span class="table-tag">${escapeHtml(tag)}</span>`).join('')}</div>`
      : '';

  const investmentReturn = m.investmentReturn ?? (m.distributions + m.nav - m.calledCapital);

  return `
    <td>
      <div>${escapeHtml(fund.fundName)}</div>
      ${tagsHtml}
    </td>
    <td class="center"><span class="investor-count">${fund.investorCount} investor${fund.investorCount !== 1 ? 's' : ''}</span></td>
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
      <button class="btn-icon grouped-fund-edit-btn" data-fund-name="${escapeAttribute(fund.fundName)}" title="Edit Fund Name" aria-label="Edit ${escapeHtml(fund.fundName)}">⚙</button>
    </td>
  `;
}
