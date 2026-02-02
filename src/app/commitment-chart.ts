/**
 * Remaining Commitment History Chart
 * Renders an SVG stepped area chart showing how total unfunded capital changes over time
 */

import type { Fund } from '../types';
import { AppState } from '../core/state';
import { formatCurrency as formatCurrencyFull } from '../utils/formatting';
import { escapeHtml } from '../utils/escaping';
import { getOutstandingCommitment } from '../calculations/metrics';
import { applyCurrentFilters } from './filters';
import { CONFIG } from '../core/config';

// ===========================
// Types
// ===========================

interface CommitmentDataPoint {
  date: string;
  totalCommitment: number;
  byFund: Record<string, number>;
}

// ===========================
// Data Calculation
// ===========================

/**
 * Parse date string to timestamp, forcing local timezone interpretation
 */
function parseDateLocal(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  const date = parseDateLocal(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Get all unique cash flow dates from filtered funds
 */
function getUniqueCashFlowDates(funds: Fund[], cutoffDate: Date | null): string[] {
  const datesSet = new Set<string>();

  funds.forEach((fund) => {
    (fund.cashFlows || []).forEach((cf) => {
      if (!cf.date) return;
      const cfDate = parseDateLocal(cf.date);
      if (cutoffDate && cfDate > cutoffDate) return;
      datesSet.add(cf.date);
    });
  });

  // Sort dates chronologically
  return Array.from(datesSet).sort((a, b) => parseDateLocal(a).getTime() - parseDateLocal(b).getTime());
}

/**
 * Get the first contribution date for a fund
 */
function getFirstContributionDate(fund: Fund): string | null {
  const contributions = (fund.cashFlows || [])
    .filter((cf) => cf.type === 'Contribution' && cf.date)
    .sort((a, b) => parseDateLocal(a.date).getTime() - parseDateLocal(b.date).getTime());

  return contributions.length > 0 ? contributions[0]!.date : null;
}

/**
 * Calculate commitment history data points
 * Note: A fund's commitment only appears in the chart starting from its first capital call.
 * Before a fund's first contribution, it contributes zero to the total.
 */
function calculateCommitmentHistory(funds: Fund[], cutoffDate: Date | null): CommitmentDataPoint[] {
  if (funds.length === 0) return [];

  const dates = getUniqueCashFlowDates(funds, cutoffDate);
  if (dates.length === 0) return [];

  // Build a map of each fund's first contribution date
  const fundFirstContribution = new Map<string, string | null>();
  funds.forEach((fund) => {
    fundFirstContribution.set(fund.fundName, getFirstContributionDate(fund));
  });

  const dataPoints: CommitmentDataPoint[] = [];

  // Add initial point (before first cash flow) showing zero commitment
  const firstDate = dates[0]!;
  const dayBeforeFirst = new Date(parseDateLocal(firstDate));
  dayBeforeFirst.setDate(dayBeforeFirst.getDate() - 1);
  const initialDateStr = dayBeforeFirst.toISOString().split('T')[0]!;

  dataPoints.push({
    date: initialDateStr,
    totalCommitment: 0,
    byFund: {},
  });

  // Calculate commitment at each cash flow date
  // A fund's commitment only counts after its first contribution
  dates.forEach((dateStr) => {
    const asOfDate = parseDateLocal(dateStr);
    const byFund: Record<string, number> = {};
    let total = 0;

    funds.forEach((fund) => {
      const firstContrib = fundFirstContribution.get(fund.fundName);
      // Only include fund if it has a first contribution on or before this date
      if (firstContrib && parseDateLocal(firstContrib) <= asOfDate) {
        const outstanding = getOutstandingCommitment(fund, asOfDate);
        byFund[fund.fundName] = outstanding;
        total += outstanding;
      }
    });

    dataPoints.push({
      date: dateStr,
      totalCommitment: total,
      byFund,
    });
  });

  // Add final point at cutoff date (or today) if different from last cash flow
  const lastDataDate = dataPoints[dataPoints.length - 1]!.date;
  const endDate = cutoffDate || new Date();
  const endDateStr = endDate.toISOString().split('T')[0]!;

  if (endDateStr > lastDataDate) {
    const byFund: Record<string, number> = {};
    let total = 0;

    funds.forEach((fund) => {
      const firstContrib = fundFirstContribution.get(fund.fundName);
      // Only include fund if it has made at least one contribution
      if (firstContrib) {
        const outstanding = getOutstandingCommitment(fund, cutoffDate || undefined);
        byFund[fund.fundName] = outstanding;
        total += outstanding;
      }
    });

    dataPoints.push({
      date: endDateStr,
      totalCommitment: total,
      byFund,
    });
  }

  return dataPoints;
}

// ===========================
// SVG Rendering
// ===========================

/**
 * Render the commitment chart SVG
 */
function renderChartSVG(dataPoints: CommitmentDataPoint[]): string {
  if (dataPoints.length < 2) {
    return '<p class="timeline-no-data">Not enough data to display chart.</p>';
  }

  // Chart dimensions
  const width = 800;
  const height = 300;
  const margin = { top: 20, right: 30, bottom: 40, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Calculate scales
  const dates = dataPoints.map((d) => parseDateLocal(d.date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateRange = maxDate - minDate || 1;

  const commitments = dataPoints.map((d) => d.totalCommitment);
  const maxCommitment = Math.max(...commitments);
  const yMax = maxCommitment * 1.1 || 1; // Add 10% padding at top

  // X scale function
  const xScale = (timestamp: number): number => {
    return margin.left + ((timestamp - minDate) / dateRange) * chartWidth;
  };

  // Y scale function
  const yScale = (value: number): number => {
    return margin.top + chartHeight - (value / yMax) * chartHeight;
  };

  // Build stepped path
  let pathD = '';
  let areaD = '';
  const hoverPoints: string[] = [];

  dataPoints.forEach((point, index) => {
    const x = xScale(parseDateLocal(point.date).getTime());
    const y = yScale(point.totalCommitment);

    if (index === 0) {
      pathD = `M ${x} ${y}`;
      areaD = `M ${x} ${margin.top + chartHeight} L ${x} ${y}`;
    } else {
      // Stepped line: horizontal to current x, then vertical to current y
      pathD += ` H ${x} V ${y}`;
      areaD += ` H ${x} V ${y}`;
    }

    // Build tooltip content
    const fundEntries = Object.entries(point.byFund)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);

    let tooltipContent = `<div class="chart-tooltip-date">${escapeHtml(formatDate(point.date))}</div>`;
    tooltipContent += `<div class="chart-tooltip-total">Total: ${formatChartCurrency(point.totalCommitment)}</div>`;

    if (fundEntries.length > 0 && fundEntries.length <= 10) {
      tooltipContent += '<div class="chart-tooltip-breakdown">';
      fundEntries.forEach(([fundName, amount]) => {
        tooltipContent += `<div class="chart-tooltip-fund">${escapeHtml(fundName)}: ${formatChartCurrency(amount)}</div>`;
      });
      tooltipContent += '</div>';
    } else if (fundEntries.length > 10) {
      tooltipContent += `<div class="chart-tooltip-breakdown"><div class="chart-tooltip-fund">${fundEntries.length} funds</div></div>`;
    }

    // Add hover point
    hoverPoints.push(`
      <g class="chart-hover-point" data-index="${index}">
        <circle cx="${x}" cy="${y}" r="20" class="chart-hover-target" />
        <circle cx="${x}" cy="${y}" r="4" class="chart-point" />
        <foreignObject x="${x - 100}" y="${y - 120}" width="200" height="110" class="chart-tooltip-container">
          <div class="chart-tooltip">${tooltipContent}</div>
        </foreignObject>
      </g>
    `);
  });

  // Close area path
  const lastX = xScale(parseDateLocal(dataPoints[dataPoints.length - 1]!.date).getTime());
  areaD += ` H ${lastX} V ${margin.top + chartHeight} Z`;

  // Generate Y-axis ticks
  const yTickCount = 5;
  const yTicks: string[] = [];
  for (let i = 0; i <= yTickCount; i++) {
    const value = (yMax / yTickCount) * i;
    const y = yScale(value);
    yTicks.push(`
      <g class="chart-tick">
        <line x1="${margin.left - 5}" y1="${y}" x2="${margin.left}" y2="${y}" />
        <text x="${margin.left - 10}" y="${y}" dy="0.35em" text-anchor="end">${formatChartCurrency(value, true)}</text>
      </g>
    `);
  }

  // Generate X-axis ticks (show ~5 dates)
  const xTickCount = Math.min(5, dataPoints.length);
  const xTicks: string[] = [];
  const step = Math.floor(dataPoints.length / xTickCount) || 1;
  for (let i = 0; i < dataPoints.length; i += step) {
    const point = dataPoints[i]!;
    const x = xScale(parseDateLocal(point.date).getTime());
    xTicks.push(`
      <g class="chart-tick">
        <line x1="${x}" y1="${margin.top + chartHeight}" x2="${x}" y2="${margin.top + chartHeight + 5}" />
        <text x="${x}" y="${margin.top + chartHeight + 20}" text-anchor="middle">${formatDate(point.date)}</text>
      </g>
    `);
  }

  // Build SVG
  return `
    <svg class="commitment-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <!-- Grid lines -->
      <g class="chart-grid">
        ${yTicks.map((_, i) => {
          const y = yScale((yMax / yTickCount) * i);
          return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" />`;
        }).join('')}
      </g>

      <!-- Area fill -->
      <path class="chart-area" d="${areaD}" />

      <!-- Line -->
      <path class="chart-line" d="${pathD}" />

      <!-- Axes -->
      <g class="chart-axis chart-axis-y">
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" />
        ${yTicks.join('')}
      </g>
      <g class="chart-axis chart-axis-x">
        <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}" />
        ${xTicks.join('')}
      </g>

      <!-- Hover points (rendered last for z-index) -->
      <g class="chart-hover-points">
        ${hoverPoints.join('')}
      </g>
    </svg>
  `;
}

/**
 * Format currency for chart display
 * @param value - The currency value
 * @param compact - If true, use compact format (e.g., $1.2M, $500K)
 */
function formatChartCurrency(value: number, compact: boolean = false): string {
  if (compact) {
    if (value >= 1000000) {
      return '$' + (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return '$' + (value / 1000).toFixed(0) + 'K';
    }
    return '$' + value.toFixed(0);
  }
  return formatCurrencyFull(value);
}

// ===========================
// Main Render Function
// ===========================

/**
 * Render the commitment chart
 */
export function renderCommitmentChart(): void {
  const container = document.getElementById('commitmentChartContainer');
  const panel = document.getElementById('commitmentChartPanel');

  if (!container) return;

  // Lazy rendering: skip if panel is collapsed
  if (CONFIG.LAZY_RENDER_TIMELINE && panel && !panel.classList.contains('expanded')) {
    container.innerHTML = '';
    return;
  }

  // Get filtered funds
  const funds = AppState.getFunds();
  const filtered = applyCurrentFilters(funds);

  if (!filtered || filtered.length === 0) {
    container.innerHTML = '<p class="timeline-no-data">No investments to display. <a href="#" data-action="showAddFundModal" style="color: var(--color-action);">Add your first investment</a> to see the commitment chart.</p>';
    attachChartActionListeners(container);
    return;
  }

  // Get cutoff date
  const cutoffDateInput = document.getElementById('cutoffDate') as HTMLInputElement;
  const cutoffDateValue = cutoffDateInput?.value;
  const cutoffDate = cutoffDateValue ? new Date(cutoffDateValue + 'T00:00:00') : null;

  // Calculate commitment history
  const dataPoints = calculateCommitmentHistory(filtered, cutoffDate);

  if (dataPoints.length < 2) {
    container.innerHTML = '<p class="timeline-no-data">Not enough cash flow data to display chart. Add cash flows to see the commitment history.</p>';
    return;
  }

  // Render chart
  container.innerHTML = renderChartSVG(dataPoints);
}

/**
 * Attach event listeners for chart action links
 */
function attachChartActionListeners(container: HTMLElement): void {
  container.querySelectorAll('a[data-action]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const action = (link as HTMLElement).dataset.action;
      if (action === 'showAddFundModal' && typeof (window as any).showAddFundModal === 'function') {
        (window as any).showAddFundModal();
      }
    });
  });
}
