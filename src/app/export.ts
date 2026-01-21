/**
 * Export functionality for the application
 */

import type { FundWithMetrics } from '../types';
import { AppState } from '../core/state';
import { getAllFunds, getAllGroups, getAllFundNameObjects } from '../core/db';
import { calculateMetrics } from '../calculations';
import { escapeCSV } from '../utils/escaping';
import { showStatus, showLoading, hideLoading } from './modals';
import { applyCurrentFilters } from './filters';
import { sortData } from './table';

/**
 * Format number for CSV export
 */
function formatNumberForCSV(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const val = typeof value === 'number' ? value : parseFloat(String(value));
  if (!isFinite(val) || isNaN(val)) return '';
  return val.toFixed(2);
}

/**
 * Sanitize value for CSV to prevent formula injection
 */
function sanitizeForCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const firstChar = str.charAt(0);
  if (str.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
    return "'" + str;
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

    const exportData = {
      funds,
      fundNames: fundNamesData,
      groups: groupsData,
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

        showStatus('Data exported successfully');
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        throw err;
      }
    }

    // Fallback to download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

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

    // Get cutoff date
    const cutoffDateInput = document.getElementById('cutoffDate') as HTMLInputElement;
    const cutoffDateValue = cutoffDateInput?.value;
    const cutoffDate = cutoffDateValue ? new Date(cutoffDateValue) : undefined;

    // Calculate metrics for each fund
    const fundsWithMetrics: FundWithMetrics[] = filtered.map((fund) => ({
      ...fund,
      metrics: calculateMetrics(fund, cutoffDate),
    }));

    // Create CSV header
    const headers = [
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

    // Create CSV rows
    const rows = fundsWithMetrics.map((fund) => {
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

    // Combine header and rows
    const csv = [headers.join(','), ...rows].join('\n');

    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `pe-funds-export-${timestamp}.csv`;

    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
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
