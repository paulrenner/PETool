/**
 * Export functionality for the application
 */

import type { FundWithMetrics } from '../types';
import { CONFIG } from '../core/config';
import { AppState } from '../core/state';
import { getAllFunds, getAllGroups, getAllFundNameObjects, getAuditLog } from '../core/db';
import { calculateMetrics } from '../calculations';
import { escapeCSV } from '../utils/escaping';
import { safeLocalStorageGet } from '../ui/utils';
import { showStatus, showLoading, hideLoading } from './modals';
import { applyCurrentFilters } from './filters';
import { sortData, consolidateFundsByName } from './table';

/**
 * Format number for CSV export
 */
function formatNumberForCSV(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  // TypeScript guarantees value is a number at this point
  if (!Number.isFinite(value)) return '';
  return value.toFixed(2);
}

/**
 * Sanitize value for CSV to prevent formula injection
 * Prefixes dangerous characters with single quote to prevent Excel/Sheets formula execution
 */
function sanitizeForCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  // If it's already a number type, it's safe
  if (typeof value === 'number') {
    return isFinite(value) ? String(value) : '';
  }

  const str = String(value);
  if (str.length === 0) return '';

  // Check first character for formula injection characters
  // Must check BEFORE numeric validation since "=2+3" would pass Number() check
  const firstChar = str.charAt(0);
  if (['=', '+', '@', '\t', '\r'].includes(firstChar)) {
    return "'" + str;
  }

  // For strings starting with '-', only prefix if NOT a valid negative number
  // This prevents "-100" from becoming "'-100" while still protecting "-DANGEROUS"
  if (firstChar === '-') {
    const num = Number(str);
    if (isNaN(num) || !isFinite(num)) {
      return "'" + str;
    }
  }

  return str;
}

/**
 * Export database to JSON
 */
export async function exportDatabase(): Promise<void> {
  try {
    const funds = await getAllFunds();
    const fundNamesData = await getAllFundNameObjects();
    const groupsData = await getAllGroups();
    const auditLog = await getAuditLog();

    const exportData = {
      funds,
      fundNames: fundNamesData,
      groups: groupsData,
      auditLog,
      exportDate: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pe-funds-export-${timestamp}.json`;

    // Try modern File System Access API
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'JSON Files',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();

        AppState.markDataExported();
        showStatus('Data exported successfully');
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        throw err;
      }
    }

    // Fallback to download link - use try/finally to ensure URL cleanup
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(url);
    }

    AppState.markDataExported();
    showStatus('Data exported successfully');
  } catch (err) {
    showStatus('Error exporting data: ' + (err as Error).message, 'error');
    console.error('Error exporting data:', err);
  }
}

/**
 * Export filtered data to CSV
 */
export async function exportToCSV(): Promise<void> {
  showLoading('Exporting to CSV...');
  try {
    const funds = await getAllFunds();
    let filtered = applyCurrentFilters(funds);

    if (AppState.sortColumns.length > 0) {
      filtered = sortData(filtered, AppState.sortColumns);
    }

    // Get cutoff date (append time to force local timezone interpretation)
    const cutoffDateInput = document.getElementById('cutoffDate') as HTMLInputElement;
    const cutoffDateValue = cutoffDateInput?.value;
    const cutoffDate = cutoffDateValue ? new Date(cutoffDateValue + 'T00:00:00') : undefined;

    // Calculate metrics for each fund
    const fundsWithMetrics: FundWithMetrics[] = filtered.map((fund) => ({
      ...fund,
      metrics: calculateMetrics(fund, cutoffDate),
    }));

    // Check if "group by fund" toggle is enabled
    const groupByFund = safeLocalStorageGet(CONFIG.STORAGE_GROUP_BY_FUND) === 'true';

    let headers: string[];
    let rows: string[];

    if (groupByFund) {
      // Export consolidated view (grouped by fund name)
      const consolidatedFunds = consolidateFundsByName(fundsWithMetrics, cutoffDate, AppState.sortColumns);

      headers = [
        'Fund Name',
        'Vintage',
        'Investor Count',
        'Total Commitment',
        'Total Contributions',
        'Total Distributions',
        'Total NAV',
        'Investment Return',
        'MOIC',
        'IRR',
        'Outstanding Commitment',
      ];

      rows = consolidatedFunds.map((fund) => {
        const m = fund.consolidatedMetrics;
        const investmentReturn = m.investmentReturn ?? m.distributions + m.nav - m.calledCapital;
        return [
          escapeCSV(fund.fundName),
          escapeCSV(m.vintageYear?.toString() || ''),
          sanitizeForCSV(fund.investorCount.toString()),
          sanitizeForCSV(formatNumberForCSV(m.commitment)),
          sanitizeForCSV(formatNumberForCSV(m.calledCapital)),
          sanitizeForCSV(formatNumberForCSV(m.distributions)),
          sanitizeForCSV(formatNumberForCSV(m.nav)),
          sanitizeForCSV(formatNumberForCSV(investmentReturn)),
          sanitizeForCSV(m.moic !== null && isFinite(m.moic) ? m.moic.toFixed(2) : ''),
          sanitizeForCSV(m.irr !== null ? (m.irr * 100).toFixed(2) : ''),
          sanitizeForCSV(formatNumberForCSV(m.outstandingCommitment)),
        ].join(',');
      });
    } else {
      // Export individual fund view
      headers = [
        'Fund Name',
        'Account Number',
        'Vintage',
        'Commitment',
        'Total Contributions',
        'Total Distributions',
        'NAV',
        'Investment Return',
        'MOIC',
        'IRR',
        'Outstanding Commitment',
      ];

      rows = fundsWithMetrics.map((fund) => {
        const m = fund.metrics;
        const investmentReturn = m.investmentReturn ?? m.distributions + m.nav - m.calledCapital;
        return [
          escapeCSV(fund.fundName),
          escapeCSV(fund.accountNumber),
          escapeCSV(m.vintageYear?.toString() || ''),
          sanitizeForCSV(formatNumberForCSV(m.commitment)),
          sanitizeForCSV(formatNumberForCSV(m.calledCapital)),
          sanitizeForCSV(formatNumberForCSV(m.distributions)),
          sanitizeForCSV(formatNumberForCSV(m.nav)),
          sanitizeForCSV(formatNumberForCSV(investmentReturn)),
          sanitizeForCSV(m.moic !== null && isFinite(m.moic) ? m.moic.toFixed(2) : ''),
          sanitizeForCSV(m.irr !== null ? (m.irr * 100).toFixed(2) : ''),
          sanitizeForCSV(formatNumberForCSV(m.outstandingCommitment)),
        ].join(',');
      });
    }

    // Combine header and rows
    const csv = [headers.join(','), ...rows].join('\n');

    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `pe-funds-export-${timestamp}.csv`;

    const link = document.createElement('a');
    if (link.download !== undefined) {
      // Use try/finally to ensure URL cleanup even if click fails
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

    showStatus('CSV exported successfully');
  } catch (err) {
    showStatus('Error exporting CSV: ' + (err as Error).message, 'error');
    console.error('Error exporting CSV:', err);
  } finally {
    hideLoading();
  }
}

/**
 * Export to PDF using browser print dialog
 */
export function exportToPDF(): void {
  window.print();
}
