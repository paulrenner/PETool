/**
 * Cash Flow Timeline functionality
 * Handles rendering the timeline with historical and projected capital calls
 */

import type { Fund, FundNameData } from '../types';
import { AppState } from '../core/state';
import { formatCurrency } from '../utils/formatting';
import { escapeHtml, escapeAttribute, escapeCSV } from '../utils/escaping';
import { applyCurrentFilters } from './filters';
import { formatNumberForCSV, sanitizeForCSV } from './export';
import { showStatus } from './modals/common';
import { CONFIG } from '../core/config';

// ===========================
// Types
// ===========================

interface HistoricalCashFlows {
  calls: Record<number, number>;
  distributions: Record<number, number>;
  byFund: Record<string, { calls: Record<number, number>; distributions: Record<number, number> }>;
}

interface ProjectedCalls {
  projectedCalls: Record<number, number>;
  byFund: Record<string, Record<number, number>>;
  estimatedCalls: Record<number, number>;
  estimatedByFund: Record<string, Record<number, number>>;
  estimatedYears: Set<number>;
}

interface TimelineYearRange {
  years: number[];
  cutoffYear: number;
  firstProjectedYear: number | null;
  estimatedYears: Set<number>;
}

// ===========================
// Helper Functions
// ===========================

/**
 * Calculate uncalled capital for a fund, matching the metrics.ts formula.
 * Accounts for adjustments, the affectsCommitment flag, and recallable distributions.
 */
function calculateUncalledCapital(fund: Fund, cutoffDate: Date | null): number {
  let outstanding = fund.commitment || 0;
  for (const cf of fund.cashFlows || []) {
    if (cutoffDate && new Date(cf.date + 'T00:00:00') > cutoffDate) continue;
    if (cf.type === 'Adjustment') {
      outstanding -= cf.amount;
    } else if (cf.affectsCommitment !== false) {
      if (cf.type === 'Contribution') {
        outstanding -= Math.abs(cf.amount);
      } else if (cf.type === 'Distribution') {
        outstanding += Math.abs(cf.amount);
      }
    }
  }
  return Math.max(0, outstanding);
}

/**
 * Aggregate historical cash flows by year
 * @param funds - Array of fund objects
 * @param cutoffDate - Cutoff date for separating historical from projected
 * @returns Historical cash flow data grouped by year and fund
 */
function aggregateHistoricalCashFlows(funds: Fund[], cutoffDate: Date | null): HistoricalCashFlows {
  const result: HistoricalCashFlows = {
    calls: {},
    distributions: {},
    byFund: {},
  };

  // Use cutoff date if provided, otherwise use current date
  const cutoffYear = cutoffDate ? cutoffDate.getFullYear() : new Date().getFullYear();

  funds.forEach((fund) => {
    if (!fund.cashFlows || fund.cashFlows.length === 0) return;

    const fundKey = fund.fundName;
    if (!result.byFund[fundKey]) {
      result.byFund[fundKey] = { calls: {}, distributions: {} };
    }

    fund.cashFlows.forEach((cf) => {
      if (!cf.date) return;
      const cfDate = new Date(cf.date + 'T00:00:00');
      const year = cfDate.getFullYear();

      // Skip adjustment type cash flows - they shouldn't appear in timeline
      if (cf.type === 'Adjustment') return;

      // Only include historical data (on or before cutoff date)
      if (cutoffDate && cfDate > cutoffDate) return;
      if (year > cutoffYear) return;

      const amount = Math.abs(cf.amount);

      if (cf.type === 'Contribution') {
        // Capital call (contribution)
        result.calls[year] = (result.calls[year] || 0) + amount;
        result.byFund[fundKey]!.calls[year] = (result.byFund[fundKey]!.calls[year] || 0) + amount;
      } else if (cf.type === 'Distribution') {
        // Distribution
        result.distributions[year] = (result.distributions[year] || 0) + amount;
        result.byFund[fundKey]!.distributions[year] = (result.byFund[fundKey]!.distributions[year] || 0) + amount;
      }
    });
  });

  return result;
}

/**
 * Calculate projected capital calls by year for a set of funds
 * @param funds - Array of fund objects
 * @param fundNameData - Map of fund name to fund name object (with terms)
 * @param cutoffDate - Cutoff date for separating historical from projected
 * @returns Projected call data grouped by year and fund
 */
function calculateProjectedCalls(
  funds: Fund[],
  fundNameData: Map<string, FundNameData>,
  cutoffDate: Date | null
): ProjectedCalls {
  const result: ProjectedCalls = {
    projectedCalls: {},
    byFund: {},
    estimatedCalls: {},
    estimatedByFund: {},
    estimatedYears: new Set(),
  };

  // Use cutoff date if provided, otherwise use current date
  const referenceDate = cutoffDate || new Date();
  const referenceYear = referenceDate.getFullYear();
  const DEFAULT_ESTIMATION_YEARS = 4; // Spread across 4 years when term start date is missing

  funds.forEach((fund) => {
    const fundNameObj = fundNameData.get(fund.fundName);
    if (!fundNameObj) return;

    const { investmentTermStartDate, investmentTermYears } = fundNameObj;

    // Handle funds missing term start date or investment term
    if (!investmentTermStartDate || !investmentTermYears) {
      // Calculate remaining uncalled capital (matching metrics.ts formula)
      const uncalledCapital = calculateUncalledCapital(fund, cutoffDate);

      if (uncalledCapital > 0) {
        // Spread remaining commitment across DEFAULT_ESTIMATION_YEARS starting next year
        const startYear = referenceYear + 1;
        const annualCall = uncalledCapital / DEFAULT_ESTIMATION_YEARS;
        const fundKey = fund.fundName;

        if (!result.estimatedByFund[fundKey]) {
          result.estimatedByFund[fundKey] = {};
        }

        for (let i = 0; i < DEFAULT_ESTIMATION_YEARS; i++) {
          const year = startYear + i;
          result.estimatedCalls[year] = (result.estimatedCalls[year] || 0) + annualCall;
          result.estimatedByFund[fundKey]![year] = (result.estimatedByFund[fundKey]![year] || 0) + annualCall;
          result.estimatedYears.add(year);
        }
      }
      return;
    }

    // Calculate investment period end
    const termStart = new Date(investmentTermStartDate + 'T00:00:00');
    const investmentEndDate = new Date(termStart);
    investmentEndDate.setFullYear(investmentEndDate.getFullYear() + investmentTermYears);

    // Skip if investment period has ended relative to cutoff date
    if (investmentEndDate < referenceDate) return;

    // Calculate remaining uncalled capital as of cutoff date (matching metrics.ts formula)
    const uncalledCapital = calculateUncalledCapital(fund, cutoffDate);

    if (uncalledCapital <= 0) return;

    // Calculate years remaining in investment period
    // Include cutoff year only when an explicit cutoff date is set AND it's mid-year
    // (not Dec 31), meaning there are remaining days in the year for projected calls.
    // Without an explicit cutoff, or when cutoff is Dec 31, start from next year.
    const cutoffIsMidYear = cutoffDate !== null
      && !(referenceDate.getMonth() === 11 && referenceDate.getDate() === 31);
    const startYear = Math.max(
      cutoffIsMidYear ? referenceYear : referenceYear + 1,
      termStart.getFullYear()
    );
    const endYear = investmentEndDate.getFullYear();
    const yearsRemaining: number[] = [];

    for (let year = startYear; year <= endYear; year++) {
      yearsRemaining.push(year);
    }

    if (yearsRemaining.length === 0) return;

    // Distribute uncalled capital linearly across remaining years
    const annualCall = uncalledCapital / yearsRemaining.length;

    const fundKey = fund.fundName;
    if (!result.byFund[fundKey]) {
      result.byFund[fundKey] = {};
    }

    yearsRemaining.forEach((year) => {
      result.projectedCalls[year] = (result.projectedCalls[year] || 0) + annualCall;
      result.byFund[fundKey]![year] = (result.byFund[fundKey]![year] || 0) + annualCall;
    });
  });

  return result;
}

/**
 * Get the range of years to display in the timeline
 * @param historical - Historical cash flow data
 * @param projected - Projected call data
 * @param cutoffYear - The cutoff year (last historical year)
 * @returns Year range with metadata
 */
function getTimelineYearRange(
  historical: HistoricalCashFlows,
  projected: ProjectedCalls,
  cutoffYear: number | null
): TimelineYearRange {
  // Use cutoff year if provided, otherwise use current year
  const dividerYear = cutoffYear || new Date().getFullYear();

  // Collect all years that have data
  const dataYears = new Set<number>();
  Object.keys(historical.calls).forEach((y) => dataYears.add(parseInt(y, 10)));
  Object.keys(historical.distributions).forEach((y) => dataYears.add(parseInt(y, 10)));
  Object.keys(projected.projectedCalls).forEach((y) => dataYears.add(parseInt(y, 10)));
  // Include estimated years (from funds missing term start date)
  Object.keys(projected.estimatedCalls || {}).forEach((y) => dataYears.add(parseInt(y, 10)));

  // Find the min and max years with data
  const yearsWithData = Array.from(dataYears);
  if (yearsWithData.length === 0) {
    // No data, show cutoff year and next 4 years
    const years: number[] = [];
    for (let y = dividerYear; y <= dividerYear + 4; y++) {
      years.push(y);
    }
    return { years, cutoffYear: dividerYear, firstProjectedYear: dividerYear + 1, estimatedYears: new Set() };
  }

  const minDataYear = Math.min(...yearsWithData);
  const maxDataYear = Math.max(...yearsWithData);

  // Determine display range:
  // Historical: from minDataYear to cutoffYear (at least 10 years back from cutoff if data exists)
  // Projected: from cutoffYear+1 to at least 6 years out or maxDataYear
  const historicalStart = Math.min(minDataYear, dividerYear - 9);
  const projectedEnd = Math.max(maxDataYear, dividerYear + 6);

  // Build continuous year range
  const allYears: number[] = [];
  for (let y = historicalStart; y <= projectedEnd; y++) {
    allYears.push(y);
  }

  // Limit to reasonable display (last 10 historical + next 6 projected = 16 years max)
  const historicalYears = allYears.filter((y) => y <= dividerYear);
  const projectedYears = allYears.filter((y) => y > dividerYear);

  const displayHistorical = historicalYears.slice(-10);
  const displayProjected = projectedYears.slice(0, 6);

  return {
    years: [...displayHistorical, ...displayProjected],
    cutoffYear: dividerYear,
    firstProjectedYear: displayProjected.length > 0 ? displayProjected[0]! : null,
    estimatedYears: projected.estimatedYears || new Set(),
  };
}

/**
 * Build a timeline row with expandable fund breakdown
 */
function buildTimelineRow(
  label: string,
  type: string,
  yearRange: TimelineYearRange,
  historicalData: Record<number, number>,
  projectedData: Record<number, number>,
  expandable: boolean,
  fundNames: string[],
  historicalByFund: Record<string, { calls: Record<number, number>; distributions: Record<number, number> }>,
  projectedByFund: Record<string, Record<number, number>>,
  dataType: 'calls' | 'distributions',
  estimatedData: Record<number, number> = {},
  estimatedByFund: Record<string, Record<number, number>> = {}
): string {
  let html = '';

  // Main row
  const safeLabel = escapeHtml(label);
  const safeType = escapeAttribute(type);
  const rowClass = type === 'calls' ? 'row-calls' : 'row-distributions';
  html += `<tr class="${rowClass} ${expandable ? 'timeline-expand-row' : ''}" ${expandable ? `data-type="${safeType}"` : ''}>`;
  html += `<td class="row-label">${expandable ? '<span class="timeline-expand-icon">▶</span>' : ''}${safeLabel}</td>`;

  yearRange.years.forEach((year) => {
    const isProjected = yearRange.firstProjectedYear !== null && year >= yearRange.firstProjectedYear;
    const isDivider = year === yearRange.firstProjectedYear;
    const isEstimated = yearRange.estimatedYears && yearRange.estimatedYears.has(year);

    let value = 0;
    let hasEstimatedValue = false;
    if (isProjected) {
      // Combine projected and estimated values
      const projectedValue = projectedData[year] || 0;
      const estimatedValue = estimatedData[year] || 0;
      value = projectedValue + estimatedValue;
      hasEstimatedValue = estimatedValue > 0;
    } else {
      value = historicalData[year] || 0;
      if (year === yearRange.cutoffYear) {
        const projectedValue = projectedData[year] || 0;
        const estimatedValue = estimatedData[year] || 0;
        value += projectedValue + estimatedValue;
        hasEstimatedValue = estimatedValue > 0;
      }
    }

    let cellClass = isDivider ? 'timeline-divider' : '';
    if (isEstimated && hasEstimatedValue) {
      cellClass += ' year-estimated';
    } else if (isProjected || (year === yearRange.cutoffYear && (projectedData[year] || estimatedData[year]))) {
      cellClass += ' year-projected';
    }
    // Show capital calls as negative (cash outflow)
    const displayValue = value > 0 ? (type === 'calls' ? formatCurrency(-value) : formatCurrency(value)) : '-';
    html += `<td class="${cellClass}">${displayValue}</td>`;
  });

  html += '</tr>';

  // Fund breakdown rows (hidden by default)
  if (expandable && fundNames) {
    fundNames.forEach((fundName) => {
      html += `<tr class="timeline-fund-row" data-type="${safeType}">`;
      html += `<td>${escapeHtml(fundName)}</td>`;

      yearRange.years.forEach((year) => {
        const isProjected = yearRange.firstProjectedYear !== null && year >= yearRange.firstProjectedYear;
        const isDivider = year === yearRange.firstProjectedYear;
        const isEstimated = yearRange.estimatedYears && yearRange.estimatedYears.has(year);

        let value = 0;
        let hasEstimatedValue = false;
        if (isProjected) {
          const projectedValue = (projectedByFund[fundName] && projectedByFund[fundName]![year]) || 0;
          const estimatedValue = (estimatedByFund[fundName] && estimatedByFund[fundName]![year]) || 0;
          value = projectedValue + estimatedValue;
          hasEstimatedValue = estimatedValue > 0;
        } else {
          if (historicalByFund[fundName]?.[dataType]?.[year]) {
            value = historicalByFund[fundName]![dataType][year]!;
          }
          if (year === yearRange.cutoffYear) {
            const projectedValue = (projectedByFund[fundName]?.[year]) || 0;
            const estimatedValue = (estimatedByFund[fundName]?.[year]) || 0;
            value += projectedValue + estimatedValue;
            hasEstimatedValue = estimatedValue > 0;
          }
        }

        let cellClass = isDivider ? 'timeline-divider' : '';
        if (isEstimated && hasEstimatedValue) {
          cellClass += ' year-estimated';
        } else if (isProjected || (year === yearRange.cutoffYear && ((projectedByFund[fundName]?.[year]) || (estimatedByFund[fundName]?.[year])))) {
          cellClass += ' year-projected';
        }
        // Show capital calls as negative (cash outflow)
        const fundDisplayValue = value > 0 ? (type === 'calls' ? formatCurrency(-value) : formatCurrency(value)) : '-';
        html += `<td class="${cellClass}">${fundDisplayValue}</td>`;
      });

      html += '</tr>';
    });
  }

  return html;
}

/**
 * Build the net cash flow row
 */
function buildNetCashFlowRow(yearRange: TimelineYearRange, historical: HistoricalCashFlows, projected: ProjectedCalls): string {
  let html = '<tr class="row-net">';
  html += '<td class="row-label">Net Cash Flow</td>';

  yearRange.years.forEach((year) => {
    const isProjected = yearRange.firstProjectedYear !== null && year >= yearRange.firstProjectedYear;
    const isDivider = year === yearRange.firstProjectedYear;
    const isEstimated = yearRange.estimatedYears && yearRange.estimatedYears.has(year);

    let calls = 0;
    let distributions = 0;
    let hasEstimatedValue = false;

    if (isProjected) {
      // Combine projected and estimated calls
      const projectedCalls = projected.projectedCalls[year] || 0;
      const estimatedCalls = projected.estimatedCalls ? (projected.estimatedCalls[year] || 0) : 0;
      calls = projectedCalls + estimatedCalls;
      hasEstimatedValue = estimatedCalls > 0;
      // No projected distributions
    } else {
      calls = historical.calls[year] || 0;
      distributions = historical.distributions[year] || 0;
      if (year === yearRange.cutoffYear) {
        calls += (projected.projectedCalls[year] || 0)
               + (projected.estimatedCalls?.[year] || 0);
        hasEstimatedValue = (projected.estimatedCalls?.[year] || 0) > 0;
      }
    }

    const net = distributions - calls;
    let cellClass = isDivider ? 'timeline-divider' : '';
    if (isEstimated && hasEstimatedValue) {
      cellClass += ' year-estimated';
    } else if (isProjected || (year === yearRange.cutoffYear && ((projected.projectedCalls[year] || 0) + (projected.estimatedCalls?.[year] || 0)) > 0)) {
      cellClass += ' year-projected';
    }
    cellClass += ` ${net >= 0 ? 'positive' : 'negative'}`;

    let displayValue = '-';
    if (calls > 0 || distributions > 0) {
      displayValue = (net >= 0 ? '+' : '') + formatCurrency(net);
    }

    html += `<td class="${cellClass}">${displayValue}</td>`;
  });

  html += '</tr>';
  return html;
}

// ===========================
// Main Render Function
// ===========================

/**
 * Render the cash flow timeline table
 * @param funds - Filtered funds to display
 */
function renderTimelineTable(funds: Fund[]): void {
  const container = document.getElementById('timelineTableContainer');
  const panel = document.getElementById('timelinePanel');

  if (!container) return;

  // Lazy rendering: skip if panel is collapsed (will render when expanded)
  if (CONFIG.LAZY_RENDER_TIMELINE && panel && !panel.classList.contains('expanded')) {
    // Clear existing content to trigger re-render when expanded
    container.innerHTML = '';
    return;
  }

  if (!funds || funds.length === 0) {
    container.innerHTML = '<p class="timeline-no-data">No investments to display. <a href="#" data-action="showAddFundModal" style="color: var(--color-action);">Add your first investment</a> with cash flows to see the timeline.</p>';
    setupTimelineEventDelegation(container);
    return;
  }

  // Get the cutoff date from the filter
  const cutoffDateInput = document.getElementById('cutoffDate') as HTMLInputElement;
  const cutoffDateValue = cutoffDateInput?.value;
  const cutoffDate = cutoffDateValue ? new Date(cutoffDateValue + 'T00:00:00') : null;
  const cutoffYear = cutoffDate ? cutoffDate.getFullYear() : null;

  // Aggregate data using cutoff date
  const historical = aggregateHistoricalCashFlows(funds, cutoffDate);
  const projected = calculateProjectedCalls(funds, AppState.fundNameData, cutoffDate);
  const yearRange = getTimelineYearRange(historical, projected, cutoffYear);

  if (yearRange.years.length === 0) {
    container.innerHTML = '<p class="timeline-no-data">No cash flow data available for the selected funds.</p>';
    return;
  }

  // Build table HTML
  let html = '<table class="timeline-table">';

  // Check if there are any estimated years
  const hasEstimatedData = yearRange.estimatedYears && yearRange.estimatedYears.size > 0;

  // Header row
  html += '<thead><tr><th></th>';
  yearRange.years.forEach((year) => {
    const isProjected = yearRange.firstProjectedYear !== null && year >= yearRange.firstProjectedYear;
    const isDivider = year === yearRange.firstProjectedYear;
    const isEstimated = yearRange.estimatedYears && yearRange.estimatedYears.has(year);
    const cellClass = `${isProjected && !isEstimated ? 'year-projected' : ''} ${isEstimated ? 'year-estimated' : ''} ${isDivider ? 'timeline-divider' : ''}`;
    let indicator = '';
    if (isEstimated) {
      indicator = '<span class="timeline-estimated-indicator" title="Estimated: fund(s) missing term start date">&#8224;</span>';
    } else if (isProjected) {
      indicator = '*';
    }
    html += `<th class="${cellClass}">${year}${indicator}</th>`;
  });
  html += '</tr></thead>';

  // Body
  html += '<tbody>';

  // Get unique fund names for expandable rows
  const fundNames = [...new Set(funds.map((f) => f.fundName))].sort();

  // Capital Calls row (expandable) - include estimated data
  html += buildTimelineRow(
    'Capital Calls',
    'calls',
    yearRange,
    historical.calls,
    projected.projectedCalls,
    true,
    fundNames,
    historical.byFund,
    projected.byFund,
    'calls',
    projected.estimatedCalls,
    projected.estimatedByFund
  );

  // Distributions row (expandable)
  html += buildTimelineRow(
    'Distributions',
    'distributions',
    yearRange,
    historical.distributions,
    {},
    true,
    fundNames,
    historical.byFund,
    {},
    'distributions',
    {},
    {}
  );

  // Net Cash Flow row
  html += buildNetCashFlowRow(yearRange, historical, projected);

  html += '</tbody></table>';

  // Add footnotes for projected and estimated
  if (yearRange.firstProjectedYear || hasEstimatedData) {
    let footnoteHtml = '<div style="margin-top: 10px; font-size: 11px; color: var(--color-text-light); font-style: italic;">';
    if (yearRange.firstProjectedYear && !hasEstimatedData) {
      const footnoteText = cutoffDate
        ? `* Projected values (after ${escapeHtml(cutoffDateValue || '')}) based on remaining uncalled capital distributed linearly across investment period`
        : '* Projected values based on remaining uncalled capital distributed linearly across investment period';
      footnoteHtml += `<p style="margin: 0;">${footnoteText}</p>`;
    } else if (hasEstimatedData && !yearRange.firstProjectedYear) {
      footnoteHtml += `<p style="margin: 0; color: var(--color-warning);">&#8224; Estimated projections for funds missing term start date (spread over 4 years). <a href="#" data-action="showManageFundsModal" style="color: var(--color-action);">Add fund terms</a> for more accurate projections.</p>`;
    } else if (yearRange.firstProjectedYear && hasEstimatedData) {
      const footnoteText = cutoffDate
        ? `* Projected values (after ${escapeHtml(cutoffDateValue || '')}) based on remaining uncalled capital distributed linearly across investment period`
        : '* Projected values based on remaining uncalled capital distributed linearly across investment period';
      footnoteHtml += `<p style="margin: 0 0 4px 0;">${footnoteText}</p>`;
      footnoteHtml += `<p style="margin: 0; color: var(--color-warning);">&#8224; Estimated projections for funds missing term start date (spread over 4 years). <a href="#" data-action="showManageFundsModal" style="color: var(--color-action);">Add fund terms</a> for more accurate projections.</p>`;
    }
    footnoteHtml += '</div>';
    html += footnoteHtml;
  }

  container.innerHTML = html;
  setupTimelineEventDelegation(container);
}

// Track if timeline event delegation has been set up
let timelineEventDelegationSetup = false;

/**
 * Set up event delegation for timeline action links
 * Called once, uses event delegation to avoid listener accumulation on re-renders
 */
function setupTimelineEventDelegation(container: HTMLElement): void {
  if (timelineEventDelegationSetup) return;
  timelineEventDelegationSetup = true;

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a[data-action]') as HTMLElement | null;
    if (!link) return;

    e.preventDefault();
    const action = link.dataset.action;
    if (action === 'showAddFundModal' && typeof (window as any).showAddFundModal === 'function') {
      (window as any).showAddFundModal();
    } else if (action === 'showManageFundsModal' && typeof (window as any).showManageFundsModal === 'function') {
      (window as any).showManageFundsModal();
    }
  });
}

/**
 * Render the timeline with current filters applied
 */
export function renderTimeline(): void {
  const funds = AppState.getFunds();
  const filtered = applyCurrentFilters(funds);
  renderTimelineTable(filtered);
}

/**
 * Export the cash flow timeline data to CSV
 */
export function exportTimelineToCSV(): void {
  const funds = AppState.getFunds();
  const filtered = applyCurrentFilters(funds);

  if (!filtered || filtered.length === 0) {
    showStatus('No data to export', 'error');
    return;
  }

  // Get the cutoff date from the filter
  const cutoffDateInput = document.getElementById('cutoffDate') as HTMLInputElement;
  const cutoffDateValue = cutoffDateInput?.value;
  const cutoffDate = cutoffDateValue ? new Date(cutoffDateValue + 'T00:00:00') : null;
  const cutoffYear = cutoffDate ? cutoffDate.getFullYear() : null;

  // Compute timeline data using existing helpers
  const historical = aggregateHistoricalCashFlows(filtered, cutoffDate);
  const projected = calculateProjectedCalls(filtered, AppState.fundNameData, cutoffDate);
  const yearRange = getTimelineYearRange(historical, projected, cutoffYear);

  if (yearRange.years.length === 0) {
    showStatus('No timeline data to export', 'error');
    return;
  }

  const fundNames = [...new Set(filtered.map((f) => f.fundName))].sort();

  // Helper to get value for a year in a given row type
  function getYearValue(
    year: number,
    historicalData: Record<number, number>,
    projectedData: Record<number, number>,
    estimatedData: Record<number, number> = {}
  ): number {
    const isProjected = yearRange.firstProjectedYear !== null && year >= yearRange.firstProjectedYear;
    if (isProjected) {
      return (projectedData[year] || 0) + (estimatedData[year] || 0);
    }
    let value = historicalData[year] || 0;
    if (year === yearRange.cutoffYear) {
      value += (projectedData[year] || 0) + (estimatedData[year] || 0);
    }
    return value;
  }

  function getFundYearValue(
    fundName: string,
    year: number,
    dataType: 'calls' | 'distributions'
  ): number {
    const isProjected = yearRange.firstProjectedYear !== null && year >= yearRange.firstProjectedYear;
    if (isProjected) {
      const projVal = (projected.byFund[fundName]?.[year]) || 0;
      const estVal = (projected.estimatedByFund[fundName]?.[year]) || 0;
      return projVal + estVal;
    }
    let value = historical.byFund[fundName]?.[dataType]?.[year] || 0;
    if (year === yearRange.cutoffYear) {
      value += (projected.byFund[fundName]?.[year] || 0)
             + (projected.estimatedByFund[fundName]?.[year] || 0);
    }
    return value;
  }

  // Build header row
  const headerCols = yearRange.years.map((year) => {
    const isProjected = yearRange.firstProjectedYear !== null && year >= yearRange.firstProjectedYear;
    const isEstimated = yearRange.estimatedYears && yearRange.estimatedYears.has(year);
    let suffix = '';
    if (isEstimated) {
      suffix = '\u2020'; // †
    } else if (isProjected) {
      suffix = '*';
    }
    return sanitizeForCSV(year + suffix);
  });

  const rows: string[] = [];
  rows.push(['', ...headerCols].join(','));

  // Capital Calls row (negative = outflow)
  const callsCols = yearRange.years.map((year) => {
    const val = getYearValue(year, historical.calls, projected.projectedCalls, projected.estimatedCalls);
    return val > 0 ? formatNumberForCSV(-val) : formatNumberForCSV(0);
  });
  rows.push([escapeCSV('Capital Calls'), ...callsCols].join(','));

  // Per-fund call breakdown
  fundNames.forEach((fundName) => {
    const hasAnyData = yearRange.years.some((year) => getFundYearValue(fundName, year, 'calls') > 0);
    if (!hasAnyData) return;
    const cols = yearRange.years.map((year) => {
      const val = getFundYearValue(fundName, year, 'calls');
      return val > 0 ? formatNumberForCSV(-val) : formatNumberForCSV(0);
    });
    rows.push([escapeCSV('  ' + fundName), ...cols].join(','));
  });

  // Distributions row (positive = inflow)
  const distCols = yearRange.years.map((year) => {
    const val = getYearValue(year, historical.distributions, {}, {});
    return formatNumberForCSV(val);
  });
  rows.push([escapeCSV('Distributions'), ...distCols].join(','));

  // Per-fund distribution breakdown
  fundNames.forEach((fundName) => {
    const hasAnyData = yearRange.years.some((year) => getFundYearValue(fundName, year, 'distributions') > 0);
    if (!hasAnyData) return;
    const cols = yearRange.years.map((year) => {
      const val = getFundYearValue(fundName, year, 'distributions');
      return formatNumberForCSV(val);
    });
    rows.push([escapeCSV('  ' + fundName), ...cols].join(','));
  });

  // Net Cash Flow row
  const netCols = yearRange.years.map((year) => {
    const calls = getYearValue(year, historical.calls, projected.projectedCalls, projected.estimatedCalls);
    const distributions = getYearValue(year, historical.distributions, {}, {});
    const net = distributions - calls;
    return formatNumberForCSV(net);
  });
  rows.push([escapeCSV('Net Cash Flow'), ...netCols].join(','));

  // Create and download CSV
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `pe-timeline-export-${timestamp}.csv`;

  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    try {
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  showStatus('Timeline CSV exported successfully');
}
