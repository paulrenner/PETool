/**
 * PE Fund Manager - Main Entry Point
 *
 * This file initializes the application and sets up event listeners.
 */

import './styles.css';

// Core imports
import { CONFIG } from './core/config';
import { AppState } from './core/state';
import {
  initDB,
  getAllFunds,
  getAllGroups,
  getAllFundNameObjects,
  clearAllData,
  getDismissedHealthIssues,
  dismissHealthIssue,
  dismissFundIssue,
} from './core/db';
import type { FundWithMetrics, FundNameData } from './types';

// Calculation imports
import { calculateMetrics } from './calculations';

// App imports
import {
  sortData,
  renderFundRow,
  renderGroupedFundRow,
  calculateTotals,
  renderTotalsRow,
  updatePortfolioSummary,
  updateSortIndicators,
  consolidateFundsByName,
} from './app/table';

import {
  getMultiSelectValues,
  hasActiveFilters,
  updateMultiSelectDisplay,
  filterMultiSelectOptions,
  clearMultiSelectSearch,
  toggleAllVisibleOptions,
  updateSelectAllCheckbox,
  applyCurrentFilters,
  resetFilters,
  updateActiveFiltersIndicator,
  handleGroupFilterCascade,
  updateFilterDropdowns,
} from './app/filters';

import {
  showStatus,
  showLoading,
  hideLoading,
  showConfirm,
  openModal,
  closeModal,
  populateGroupDropdown,
  setSearchableSelectValue,
  showAddFundModal,
  showEditFundModal,
  showDuplicateFundModal,
  saveFundFromModal,
  deleteFund,
  showDetailsModal,
  initFundFormChangeTracking,
  closeFundModalWithConfirm,
  addCashFlowRow,
  addNavRow,
  saveDetailsFromModal,
  updateDetailsSummary,
  showManageFundsModal,
  showManageGroupsModal,
  saveGroupFromModal,
  deleteGroupById,
  setCurrentActionFundId,
  getCurrentActionFundId,
  showEditFundNameModal,
  addEditTag,
  removeEditTag,
  saveEditedFundName,
  deleteFundNameByName,
  addNewFundNameFromModal,
  addNewFundNameInline,
  cancelNewFundNameInline,
  initAccountNumberAutoFill,
  showSyncAccountGroupsModal,
  applySyncAccountGroups,
  resetFundNamesModalState,
  resetGroupModalState,
} from './app/modals';

import {
  exportDatabase,
  exportToCSV,
  exportToPDF,
} from './app/export';

import {
  showImportPreviewModal,
  handleImportFileSelect,
  applyImport,
  loadSampleData,
} from './app/import';

import {
  showBulkCashFlowModal,
  showBulkRemoveFundModal,
  showBulkAssignGroupModal,
  initBulkOperationListeners,
} from './app/bulk';

import { renderTimeline } from './app/timeline';

import {
  runHealthCheck,
  getSeverityClass,
  getSeverityLabel,
  getConfidenceClass,
  type HealthCheckResult,
  type HealthIssue,
  type DuplicatePair,
  type GroupIssue,
} from './app/health-check';

import { escapeHtml, escapeAttribute } from './utils/escaping';
import { announceToScreenReader, safeJSONParse } from './ui/utils';

// ===========================
// Backup Reminder Functions
// ===========================

/**
 * Show backup warning modal
 */
function showBackupWarning(): void {
  const modal = document.getElementById('backupWarningModal');
  if (modal) {
    modal.classList.add('show');
  }
}

/**
 * Close backup warning modal
 */
function closeBackupWarning(): void {
  const modal = document.getElementById('backupWarningModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

/**
 * Update last backup timestamp
 */
function updateLastBackupTime(): void {
  localStorage.setItem(CONFIG.STORAGE_LAST_BACKUP, new Date().toISOString());
}

/**
 * Check if backup reminder should be shown
 */
function checkBackupReminder(): void {
  const lastBackup = localStorage.getItem(CONFIG.STORAGE_LAST_BACKUP);
  const warningDismissed = localStorage.getItem(CONFIG.STORAGE_BACKUP_WARNING);

  // If warning was permanently dismissed, don't show
  if (warningDismissed === 'true') {
    return;
  }

  // If no backup has ever been made, show warning
  if (!lastBackup) {
    showBackupWarning();
    return;
  }

  // Check if it's been more than BACKUP_REMINDER_DAYS since last backup
  const daysSinceBackup = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceBackup > CONFIG.BACKUP_REMINDER_DAYS) {
    showBackupWarning();
  }
}

/**
 * Initialize backup warning event listeners
 */
function initBackupWarningListeners(): void {
  const closeBtn = document.getElementById('closeBackupWarningBtn');
  const exportNowBtn = document.getElementById('exportNowBtn');
  const remindLaterBtn = document.getElementById('remindLaterBtn');
  const dontShowCheckbox = document.getElementById('dontShowBackupWarning') as HTMLInputElement;

  if (closeBtn) {
    closeBtn.addEventListener('click', closeBackupWarning);
  }

  if (exportNowBtn) {
    exportNowBtn.addEventListener('click', async () => {
      closeBackupWarning();
      await exportDatabase();
      updateLastBackupTime();
    });
  }

  if (remindLaterBtn) {
    remindLaterBtn.addEventListener('click', () => {
      if (dontShowCheckbox?.checked) {
        localStorage.setItem(CONFIG.STORAGE_BACKUP_WARNING, 'true');
      }
      closeBackupWarning();
    });
  }
}

// ===========================
// Export Reminder Functions
// ===========================

const EXPORT_REMINDER_INTERVAL = 5 * 60 * 1000; // 5 minutes
let exportReminderIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Check if we should show an export reminder
 */
function checkExportReminder(): void {
  if (AppState.shouldShowExportReminder(EXPORT_REMINDER_INTERVAL)) {
    showExportReminder();
  }
}

/**
 * Show a non-intrusive export reminder
 */
function showExportReminder(): void {
  // Dismiss this reminder occurrence (will show again in 5 minutes if still dirty)
  AppState.dismissExportReminder();

  // Show a status message instead of a modal (less intrusive)
  showStatus('You have unsaved changes. Consider exporting to JSON.', 'warning');
}

/**
 * Start the export reminder interval
 */
function startExportReminderInterval(): void {
  // Clear any existing interval first
  if (exportReminderIntervalId !== null) {
    clearInterval(exportReminderIntervalId);
  }
  exportReminderIntervalId = setInterval(checkExportReminder, EXPORT_REMINDER_INTERVAL);
}

/**
 * Stop the export reminder interval (called on page unload)
 */
function stopExportReminderInterval(): void {
  if (exportReminderIntervalId !== null) {
    clearInterval(exportReminderIntervalId);
    exportReminderIntervalId = null;
  }
}

// Clean up interval on page unload to prevent memory leaks
window.addEventListener('beforeunload', stopExportReminderInterval);

// ===========================
// Health Check Functions
// ===========================

// Cache for health check results with TTL
const HEALTH_CHECK_CACHE_TTL = 60 * 1000; // 1 minute TTL
let cachedHealthCheckResults: HealthCheckResult | null = null;
let healthCheckCacheTimestamp: number = 0;

/**
 * Check if health check cache is valid (not expired)
 */
function isHealthCheckCacheValid(): boolean {
  if (!cachedHealthCheckResults) return false;
  if (AppState.needsHealthCheckRefresh()) return false;
  return Date.now() - healthCheckCacheTimestamp < HEALTH_CHECK_CACHE_TTL;
}

/**
 * Show health check modal with results
 */
function showHealthCheckModal(): void {
  const summaryDiv = document.getElementById('healthCheckSummary');
  const resultsDiv = document.getElementById('healthCheckResults');

  // Check if we can use cached results (with TTL check)
  if (isHealthCheckCacheValid()) {
    // Use cached results - no loading spinner needed
    openModal('healthCheckModal');
    renderHealthCheckResults(cachedHealthCheckResults!);
    return;
  }

  // Show loading state
  if (summaryDiv) summaryDiv.innerHTML = '';
  if (resultsDiv) {
    resultsDiv.innerHTML = `
      <div class="health-check-loading">
        <div class="loading-spinner"></div>
        <p>Running health checks...</p>
      </div>
    `;
  }

  openModal('healthCheckModal');

  // Run health check after modal is visible (allows spinner to render)
  setTimeout(async () => {
    const funds = AppState.getFunds();
    const groups = AppState.getGroups();
    const dismissedPairs = await getDismissedHealthIssues();
    const results = runHealthCheck(funds, groups, dismissedPairs);

    // Cache results with timestamp and mark health check as run
    cachedHealthCheckResults = results;
    healthCheckCacheTimestamp = Date.now();
    AppState.markHealthCheckRun();

    renderHealthCheckResults(results);
  }, 50);
}

/**
 * Render health check results in modal
 */
function renderHealthCheckResults(results: HealthCheckResult): void {
  const summaryDiv = document.getElementById('healthCheckSummary');
  const resultsDiv = document.getElementById('healthCheckResults');

  if (!summaryDiv || !resultsDiv) return;

  const duplicateCount = results.duplicates.length;

  // Render summary
  summaryDiv.innerHTML = `
    <div class="health-check-stat">
      <div class="health-check-stat-value">${results.totalFunds}</div>
      <div class="health-check-stat-label">Total Funds</div>
    </div>
    <div class="health-check-stat">
      <div class="health-check-stat-value ${results.fundsWithIssues > 0 ? 'warning-count' : 'success-count'}">${results.fundsWithIssues}</div>
      <div class="health-check-stat-label">With Issues</div>
    </div>
    <div class="health-check-stat">
      <div class="health-check-stat-value ${duplicateCount > 0 ? 'warning-count' : 'success-count'}">${duplicateCount}</div>
      <div class="health-check-stat-label">Duplicates</div>
    </div>
    <div class="health-check-stat">
      <div class="health-check-stat-value error-count">${results.errorCount}</div>
      <div class="health-check-stat-label">Errors</div>
    </div>
    <div class="health-check-stat">
      <div class="health-check-stat-value warning-count">${results.warningCount}</div>
      <div class="health-check-stat-label">Warnings</div>
    </div>
    <div class="health-check-stat">
      <div class="health-check-stat-value info-count">${results.infoCount}</div>
      <div class="health-check-stat-label">Info</div>
    </div>
  `;

  // Build results HTML
  let html = '';
  let hasSections = false;

  // Render group issues section if any (show first as they're critical)
  if (results.groupIssues.length > 0) {
    html += `<div class="health-check-section-header">Group Issues</div>`;
    html += results.groupIssues.map((issue) => renderGroupIssue(issue)).join('');
    hasSections = true;
  }

  // Render duplicates section if any
  if (results.duplicates.length > 0) {
    html += `<div class="health-check-section-header">Potential Duplicates</div>`;
    html += results.duplicates.map((dup) => renderDuplicatePair(dup)).join('');
    hasSections = true;
  }

  // Render issues section
  if (results.issues.length > 0) {
    if (hasSections) {
      html += `<div class="health-check-section-header">Data Issues</div>`;
    }
    html += results.issues.map((issue) => renderHealthIssue(issue)).join('');
    hasSections = true;
  }

  // Show empty state if no issues, no duplicates, and no group issues
  if (!hasSections) {
    html = `
      <div class="health-check-empty">
        All funds and groups passed health checks!
      </div>
    `;
  }

  resultsDiv.innerHTML = html;
}

/**
 * Render a single health issue
 */
function renderHealthIssue(issue: HealthIssue): string {
  // Allow dismissing warnings and info, but not errors (errors are critical)
  const canDismiss = issue.severity === 'warning' || issue.severity === 'info';
  const dismissButton = canDismiss
    ? `<button class="btn-dismiss-issue btn-dismiss-fund-issue" data-fund-id="${escapeAttribute(String(issue.fundId))}" data-category="${escapeAttribute(issue.category)}" data-message="${escapeAttribute(issue.message)}" title="Dismiss this issue">Dismiss</button>`
    : '';

  return `
    <div class="health-issue" data-fund-id="${escapeAttribute(String(issue.fundId))}">
      <span class="health-issue-severity ${getSeverityClass(issue.severity)}">${getSeverityLabel(issue.severity)}</span>
      <div class="health-issue-content">
        <div class="health-issue-fund">${escapeHtml(issue.fundName)}</div>
        <div class="health-issue-message">${escapeHtml(issue.message)}</div>
        <div class="health-issue-category">${escapeHtml(issue.category)}</div>
      </div>
      ${dismissButton}
    </div>
  `;
}

/**
 * Render a duplicate fund pair
 */
function renderDuplicatePair(dup: DuplicatePair): string {
  return `
    <div class="duplicate-pair">
      <span class="duplicate-confidence ${getConfidenceClass(dup.confidence)}">${dup.confidence}</span>
      <div class="duplicate-content">
        <div class="duplicate-funds">
          <span class="duplicate-fund-link" data-fund-id="${escapeAttribute(String(dup.fund1Id))}">${escapeHtml(dup.fund1Name)}</span>
          <span class="duplicate-separator">&harr;</span>
          <span class="duplicate-fund-link" data-fund-id="${escapeAttribute(String(dup.fund2Id))}">${escapeHtml(dup.fund2Name)}</span>
        </div>
        <div class="duplicate-reason">${escapeHtml(dup.reason)}</div>
      </div>
      <button class="btn-dismiss-issue" data-fund1-id="${escapeAttribute(String(dup.fund1Id))}" data-fund2-id="${escapeAttribute(String(dup.fund2Id))}" data-reason="${escapeAttribute(dup.reason)}" title="Dismiss this issue">Dismiss</button>
    </div>
  `;
}

/**
 * Render a group issue
 */
function renderGroupIssue(issue: GroupIssue): string {
  return `
    <div class="health-issue group-issue">
      <span class="health-issue-severity ${getSeverityClass(issue.severity)}">${getSeverityLabel(issue.severity)}</span>
      <div class="health-issue-content">
        <div class="health-issue-fund">Group: ${escapeHtml(issue.groupName)}</div>
        <div class="health-issue-message">${escapeHtml(issue.message)}</div>
      </div>
    </div>
  `;
}

/**
 * Initialize health check modal event listeners
 */
function initHealthCheckModal(): void {
  const closeBtn = document.getElementById('closeHealthCheckModalBtn');
  const closeBtn2 = document.getElementById('closeHealthCheckModal2Btn');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal('healthCheckModal'));
  }
  if (closeBtn2) {
    closeBtn2.addEventListener('click', () => closeModal('healthCheckModal'));
  }

  // Click on issue or duplicate to open fund details
  const resultsDiv = document.getElementById('healthCheckResults');
  if (resultsDiv) {
    resultsDiv.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      // Check for dismiss button click (duplicate pair)
      const dismissBtn = target.closest('.btn-dismiss-issue:not(.btn-dismiss-fund-issue)') as HTMLElement;
      if (dismissBtn) {
        e.stopPropagation();
        const fund1Id = parseInt(dismissBtn.getAttribute('data-fund1-id') || '0', 10);
        const fund2Id = parseInt(dismissBtn.getAttribute('data-fund2-id') || '0', 10);
        const reason = dismissBtn.getAttribute('data-reason') || '';

        if (fund1Id > 0 && fund2Id > 0) {
          try {
            await dismissHealthIssue(fund1Id, fund2Id, reason);
            // Clear cache and refresh the health check modal
            cachedHealthCheckResults = null;
            AppState.markHealthCheckRun(); // Reset so it re-runs
            AppState.invalidateHealthCheck();
            showHealthCheckModal();
          } catch (err) {
            console.error('Error dismissing health issue:', err);
          }
        }
        return;
      }

      // Check for dismiss button click (fund issue)
      const dismissFundBtn = target.closest('.btn-dismiss-fund-issue') as HTMLElement;
      if (dismissFundBtn) {
        e.stopPropagation();
        const fundId = parseInt(dismissFundBtn.getAttribute('data-fund-id') || '0', 10);
        const category = dismissFundBtn.getAttribute('data-category') || '';
        const message = dismissFundBtn.getAttribute('data-message') || '';

        if (fundId > 0 && category && message) {
          try {
            await dismissFundIssue(fundId, category, message);
            // Clear cache and refresh the health check modal
            cachedHealthCheckResults = null;
            AppState.invalidateHealthCheck();
            showHealthCheckModal();
          } catch (err) {
            console.error('Error dismissing fund issue:', err);
          }
        }
        return;
      }

      // Check for health issue click
      const issueEl = target.closest('.health-issue');
      if (issueEl) {
        const fundId = parseInt(issueEl.getAttribute('data-fund-id') || '0', 10);
        if (fundId > 0) {
          closeModal('healthCheckModal');
          showDetailsModal(fundId, renderTable);
        }
        return;
      }

      // Check for duplicate fund link click
      const dupLinkEl = target.closest('.duplicate-fund-link');
      if (dupLinkEl) {
        const fundId = parseInt(dupLinkEl.getAttribute('data-fund-id') || '0', 10);
        if (fundId > 0) {
          closeModal('healthCheckModal');
          showDetailsModal(fundId, renderTable);
        }
      }
    });
  }
}

// ===========================
// Column Resize Functions
// ===========================

let isResizingColumn = false;
let lastMousedownOnResizer = false;

/**
 * Save column width to localStorage
 */
function saveColumnWidth(columnIndex: number, width: number): void {
  const savedWidths = safeJSONParse<Record<number, number>>(localStorage.getItem(CONFIG.STORAGE_COLUMN_WIDTHS) || '{}');
  savedWidths[columnIndex] = width;
  localStorage.setItem(CONFIG.STORAGE_COLUMN_WIDTHS, JSON.stringify(savedWidths));
}

/**
 * Restore column widths from localStorage
 */
function restoreColumnWidths(): void {
  const table = document.getElementById('fundsTable') as HTMLTableElement;
  if (!table) return;

  const savedWidths = safeJSONParse<Record<number, number>>(localStorage.getItem(CONFIG.STORAGE_COLUMN_WIDTHS) || '{}');
  const ths = table.querySelectorAll('thead th');

  ths.forEach((th, index) => {
    const savedWidth = savedWidths[index];
    if (savedWidth) {
      (th as HTMLElement).style.width = savedWidth + 'px';
      (th as HTMLElement).style.minWidth = savedWidth + 'px';
      (th as HTMLElement).style.maxWidth = savedWidth + 'px';
    }
  });
}

/**
 * Initialize column resizing functionality
 */
function initColumnResizing(): void {
  const table = document.getElementById('fundsTable') as HTMLTableElement;
  if (!table) return;

  const ths = table.querySelectorAll('thead th');

  ths.forEach((th) => {
    // Add resizer element (skip the last column - actions)
    if (th.querySelector('.resizer') || !th.getAttribute('data-sort')) return;

    const resizer = document.createElement('span');
    resizer.className = 'resizer';
    th.appendChild(resizer);
    (th as HTMLElement).style.position = 'relative';

    resizer.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.pageX;
      const startWidth = (th as HTMLElement).offsetWidth;
      const columnIndex = Array.from(ths).indexOf(th);

      // Cache TD elements on mousedown to avoid repeated DOM queries during drag
      const columnTds = table.querySelectorAll(`tbody tr td:nth-child(${columnIndex + 1})`);

      isResizingColumn = true;
      lastMousedownOnResizer = true;
      th.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // Track current width for saving on mouseup (avoid localStorage writes during drag)
      let currentWidth = startWidth;

      const onMouseMove = (e: MouseEvent) => {
        const diff = e.pageX - startX;
        currentWidth = Math.max(CONFIG.MIN_COLUMN_WIDTH, startWidth + diff);
        (th as HTMLElement).style.width = currentWidth + 'px';
        (th as HTMLElement).style.minWidth = currentWidth + 'px';
        (th as HTMLElement).style.maxWidth = currentWidth + 'px';

        // Apply width to cached TD elements
        columnTds.forEach((td) => {
          (td as HTMLElement).style.width = currentWidth + 'px';
          (td as HTMLElement).style.minWidth = currentWidth + 'px';
          (td as HTMLElement).style.maxWidth = currentWidth + 'px';
        });
      };

      const cleanup = () => {
        th.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', cleanup);
        window.removeEventListener('blur', cleanup);
        // Save final width to localStorage only once on mouseup
        if (currentWidth !== startWidth) {
          saveColumnWidth(columnIndex, currentWidth);
        }
        // Reset flag after a short delay so click handler can check it
        setTimeout(() => {
          isResizingColumn = false;
          lastMousedownOnResizer = false;
        }, 50);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', cleanup);
      window.addEventListener('blur', cleanup);
    });
  });

  // Restore saved column widths
  restoreColumnWidths();
}

// ===========================
// Utility Functions
// ===========================

/**
 * Debounce function
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Show/hide filter loading indicator
 */
function setFilterLoading(show: boolean): void {
  const indicator = document.getElementById('filterLoading');
  if (indicator) {
    indicator.classList.toggle('show', show);
  }
}

// ===========================
// Pagination Functions
// ===========================

/**
 * Update the pagination UI (showing X of Y indicator and Load More button)
 */
function updatePaginationUI(displayedCount: number, totalCount: number): void {
  // Get or create pagination container
  let paginationContainer = document.getElementById('tablePaginationContainer');
  if (!paginationContainer) {
    // Create container after the table
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      paginationContainer = document.createElement('div');
      paginationContainer.id = 'tablePaginationContainer';
      paginationContainer.className = 'table-pagination';
      tableContainer.after(paginationContainer);
    }
  }

  if (!paginationContainer) return;

  // If all items are displayed, hide the pagination container
  if (displayedCount >= totalCount) {
    paginationContainer.innerHTML = '';
    paginationContainer.style.display = 'none';
    return;
  }

  // Show pagination info and Load More button
  paginationContainer.style.display = 'flex';
  paginationContainer.innerHTML = `
    <div class="pagination-info">
      Showing <strong>${displayedCount}</strong> of <strong>${totalCount}</strong> investments
    </div>
    <button type="button" class="btn-secondary load-more-btn" id="loadMoreBtn">
      Load More
    </button>
  `;

  // Attach click handler
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      AppState.loadMore();
      await renderTable();
    });
  }
}

// ===========================
// Main Render Function
// ===========================

/**
 * Render the main funds table
 */
async function renderTable(): Promise<void> {
  // Set up debounced loading indicator
  const tbody = document.getElementById('fundsTableBody');
  const loadingTimeout = setTimeout(() => {
    if (tbody) {
      tbody.innerHTML = `
        <tr class="table-loading-row">
          <td colspan="12">
            <div class="table-loading-content">
              <div class="table-loading-spinner"></div>
              <div class="table-loading-text">Loading investments...</div>
            </div>
          </td>
        </tr>
      `;
    }
  }, CONFIG.TABLE_LOADING_DELAY);

  try {
    const funds = await getAllFunds();
    AppState.setFunds(funds);

    // Apply filters
    let filtered = applyCurrentFilters(funds);

    // Get cutoff date (needed for consistent sorting and display)
    const cutoffDateInput = document.getElementById('cutoffDate') as HTMLInputElement;
    const cutoffDateValue = cutoffDateInput?.value;
    // Append time to force local timezone interpretation (see CLAUDE.md)
    const cutoffDate = cutoffDateValue ? new Date(cutoffDateValue + 'T00:00:00') : undefined;

    // Apply sorting (with cutoffDate for consistent metrics calculation)
    if (AppState.sortColumns.length > 0) {
      filtered = sortData(filtered, AppState.sortColumns, cutoffDate);
    }

    // Update filter dropdowns
    updateFilterDropdowns(funds);
    updateActiveFiltersIndicator();

    // Calculate metrics for each fund
    const fundsWithMetrics: FundWithMetrics[] = filtered.map((fund) => ({
      ...fund,
      metrics: calculateMetrics(fund, cutoffDate),
    }));

    // Update portfolio summary
    updatePortfolioSummary(fundsWithMetrics, cutoffDate);

    // Clear loading timeout and render table body
    clearTimeout(loadingTimeout);
    if (!tbody) return;

    tbody.innerHTML = '';

    if (fundsWithMetrics.length === 0) {
      const hasFilters = hasActiveFilters();

      const hasAnyFunds = funds.length > 0;

      let emptyStateHtml: string;
      if (hasFilters && hasAnyFunds) {
        emptyStateHtml = `
          <tr>
            <td colspan="12" class="empty-state">
              <div style="padding: 40px;">
                <h3 style="margin-bottom: 10px;">No matching investments</h3>
                <p style="margin-bottom: 15px;">No investments match your current filters.</p>
                <button type="button" class="btn-secondary" id="clearFiltersBtn">Clear All Filters</button>
              </div>
            </td>
          </tr>
        `;
      } else {
        emptyStateHtml = `
          <tr>
            <td colspan="12" class="empty-state">
              <div style="padding: 40px;">
                <h3 style="margin-bottom: 10px;">No investments yet</h3>
                <p style="margin-bottom: 15px;">Add your first investment to start tracking your portfolio.</p>
                <button type="button" class="btn-primary" id="addFirstInvestmentBtn">Add Investment</button>
              </div>
            </td>
          </tr>
        `;
      }
      tbody.innerHTML = emptyStateHtml;

      // Attach event listeners for empty state buttons
      const clearFiltersBtn = document.getElementById('clearFiltersBtn');
      if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
          resetFilters();
          applyFilters();
        });
      }

      const addFirstBtn = document.getElementById('addFirstInvestmentBtn');
      if (addFirstBtn) {
        addFirstBtn.addEventListener('click', showAddFundModal);
      }

      return;
    }

    const showTags = (document.getElementById('sidebarShowTagsCheckbox') as HTMLInputElement)?.checked ?? true;
    const groupByFund = localStorage.getItem(CONFIG.STORAGE_GROUP_BY_FUND) === 'true';

    // Calculate totals from ALL filtered funds (before pagination)
    const totals = calculateTotals(fundsWithMetrics, cutoffDate);
    const totalCount = fundsWithMetrics.length;
    const displayLimit = AppState.displayLimit;

    if (groupByFund) {
      // Render consolidated view (grouped by fund name)
      const consolidatedFunds = consolidateFundsByName(fundsWithMetrics, cutoffDate, AppState.sortColumns);
      const displayedConsolidated = consolidatedFunds.slice(0, displayLimit);

      displayedConsolidated.forEach((fund, index) => {
        const row = document.createElement('tr');
        row.classList.add('grouped-fund-row');
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'row');
        row.setAttribute('aria-rowindex', (index + 2).toString());
        row.innerHTML = renderGroupedFundRow(fund, index, showTags);
        tbody.appendChild(row);
      });

      // Add totals row (calculated from ALL funds, not just displayed)
      const totalRow = document.createElement('tr');
      totalRow.innerHTML = renderTotalsRow(totals);
      tbody.appendChild(totalRow);

      // Update pagination UI for grouped view
      updatePaginationUI(displayedConsolidated.length, consolidatedFunds.length);
    } else {
      // Render normal view (individual fund rows) with pagination
      const displayedFunds = fundsWithMetrics.slice(0, displayLimit);

      displayedFunds.forEach((fund, index) => {
        const row = document.createElement('tr');
        row.setAttribute('tabindex', '0');
        row.setAttribute('data-fund-id', fund.id?.toString() || '');
        row.setAttribute('role', 'row');
        row.setAttribute('aria-rowindex', (index + 2).toString());
        row.innerHTML = renderFundRow(fund, index, showTags);
        tbody.appendChild(row);
      });

      // Add totals row (calculated from ALL funds, not just displayed)
      const totalRow = document.createElement('tr');
      totalRow.innerHTML = renderTotalsRow(totals);
      tbody.appendChild(totalRow);

      // Update pagination UI
      updatePaginationUI(displayedFunds.length, totalCount);
    }
  } catch (err) {
    clearTimeout(loadingTimeout);
    console.error('Error rendering table:', err);
    showStatus('Error loading data: ' + (err as Error).message, 'error');
  }
}

/**
 * Apply filters with debouncing and race condition protection
 */
async function applyFilters(): Promise<void> {
  if (AppState.abortController) {
    AppState.abortController.abort();
  }

  // Reset pagination when filters change
  AppState.resetDisplayLimit();

  AppState.setAbortController(new AbortController());
  const signal = AppState.abortController!.signal;

  setFilterLoading(true);

  try {
    if (signal.aborted) return;
    updateHeader();
    if (signal.aborted) return;
    await renderTable();

    const investmentCount = document.getElementById('summaryInvestmentCount')?.textContent || '0';
    announceToScreenReader(`Filter applied. Showing ${investmentCount} investments.`);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    console.error('Error applying filters:', err);
    showStatus('Error applying filters: ' + (err as Error).message, 'error');
  } finally {
    setFilterLoading(false);
    if (AppState.abortController && !AppState.abortController.signal.aborted) {
      AppState.setAbortController(null);
    }
  }
}

const applyFiltersDebounced = debounce(applyFilters, CONFIG.DEBOUNCE_FILTER);

/**
 * Update header based on selected groups
 */
function updateHeader(): void {
  const groupFilterValues = getMultiSelectValues('groupFilter');
  const headerTitle = document.getElementById('headerTitle');
  const headerSubtitle = document.getElementById('headerSubtitle');

  if (!headerTitle || !headerSubtitle) return;

  if (groupFilterValues.length === 1 && groupFilterValues[0]) {
    const groupId = parseInt(groupFilterValues[0]);
    const group = AppState.getGroupByIdSync(groupId);

    if (group) {
      headerTitle.textContent = group.name;
      if (group.parentGroupId) {
        const parentGroup = AppState.getGroupByIdSync(group.parentGroupId);
        headerSubtitle.textContent = parentGroup?.name || group.type || 'Account Group';
      } else {
        headerSubtitle.textContent = '';
      }
    }
  } else if (groupFilterValues.length > 1) {
    // Check if all selected groups share a parent
    const selectedGroups = groupFilterValues.map((id) => AppState.getGroupByIdSync(parseInt(id)));
    const parentIds = new Set(selectedGroups.map((g) => g?.parentGroupId).filter((id) => id != null));

    if (parentIds.size === 1) {
      const parentId = Array.from(parentIds)[0];
      const parentGroup = AppState.getGroupByIdSync(parentId as number);
      if (parentGroup) {
        headerTitle.textContent = parentGroup.name;
        headerSubtitle.textContent = 'Multiple Groups Selected';
      } else {
        headerTitle.textContent = 'PE Fund Manager';
        headerSubtitle.textContent = 'Multiple Groups Selected';
      }
    } else {
      headerTitle.textContent = 'PE Fund Manager';
      headerSubtitle.textContent = 'Multiple Groups Selected';
    }
  } else {
    headerTitle.textContent = 'PE Fund Manager';
    headerSubtitle.textContent = 'Private Equity Fund Analytics & Management Tool';
  }
}

// ===========================
// Event Handlers
// ===========================

/**
 * Handle header click for sorting
 */
async function handleHeaderClick(event: Event): Promise<void> {
  const target = event.target as HTMLElement;

  // Skip if clicking on resizer or currently resizing
  if (lastMousedownOnResizer || isResizingColumn || target.closest('.resizer')) {
    return;
  }

  const th = target.closest('th[data-sort]') as HTMLElement;
  if (!th) return;

  const column = th.dataset.sort;
  if (!column) return;

  const shiftKey = (event as MouseEvent).shiftKey;

  if (shiftKey) {
    // Multi-column sort - use immutable update pattern
    const existingIndex = AppState.sortColumns.findIndex((s) => s.column === column);
    if (existingIndex !== -1) {
      const current = AppState.sortColumns[existingIndex]!;
      if (current.direction === 'asc') {
        // Toggle to desc
        const newColumns = [...AppState.sortColumns];
        newColumns[existingIndex] = { column, direction: 'desc' };
        AppState.setSortColumns(newColumns);
      } else {
        // Remove from sort
        const newColumns = AppState.sortColumns.filter((_, i) => i !== existingIndex);
        AppState.setSortColumns(newColumns);
      }
    } else {
      // Add new sort column
      AppState.setSortColumns([...AppState.sortColumns, { column, direction: 'asc' }]);
    }
  } else {
    // Single column sort
    const existing = AppState.sortColumns.find((s) => s.column === column);
    if (existing) {
      if (existing.direction === 'asc') {
        AppState.setSortColumns([{ column, direction: 'desc' }]);
      } else {
        AppState.setSortColumns([]);
      }
    } else {
      AppState.setSortColumns([{ column, direction: 'asc' }]);
    }
  }

  updateSortIndicators(AppState.sortColumns);
  await renderTable();
}

/**
 * Handle action button click
 */
function handleActionButtonClick(event: Event): void {
  const target = event.target as HTMLElement;
  const button = target.closest('.fund-actions-btn') as HTMLElement;
  if (!button) return;

  event.stopPropagation();
  const fundId = parseInt(button.dataset.fundId || '0');
  if (!fundId) return;

  setCurrentActionFundId(fundId);

  const dropdown = document.getElementById('actionDropdown') as HTMLElement;
  if (!dropdown) return;

  const rect = button.getBoundingClientRect();

  // Get dropdown dimensions (temporarily show to measure)
  dropdown.style.visibility = 'hidden';
  dropdown.classList.add('show');
  const dropdownWidth = dropdown.offsetWidth || 160;
  const dropdownHeight = dropdown.offsetHeight || 200;
  dropdown.classList.remove('show');
  dropdown.style.visibility = '';

  // Calculate position with viewport boundary checks
  let top = rect.bottom + 2;
  let left = rect.left - (dropdownWidth - rect.width);

  // Check if dropdown would go below viewport
  if (top + dropdownHeight > window.innerHeight) {
    // Position above the button instead
    top = rect.top - dropdownHeight - 2;
  }

  // Check if dropdown would go past left edge
  if (left < 8) {
    left = 8;
  }

  // Check if dropdown would go past right edge
  if (left + dropdownWidth > window.innerWidth - 8) {
    left = window.innerWidth - dropdownWidth - 8;
  }

  // Apply position (use fixed positioning for viewport-relative)
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
  dropdown.classList.add('show');
}

// ===========================
// Sidebar Functions
// ===========================

function openSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.add('show');
  if (overlay) overlay.classList.add('show');
}

function closeSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

// ===========================
// Dark Mode
// ===========================

function initializeDarkMode(): void {
  const checkbox = document.getElementById('sidebarDarkModeCheckbox') as HTMLInputElement;
  if (!checkbox) return;

  // Check saved preference or system preference
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme ? savedTheme === 'dark' : prefersDark;

  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  checkbox.checked = isDark;

  checkbox.addEventListener('change', () => {
    const theme = checkbox.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  });
}

// ===========================
// Cutoff Date Initialization
// ===========================

/**
 * Get the most recent quarter-end date
 * Quarter-ends are: March 31, June 30, September 30, December 31
 */
function getMostRecentQuarterEnd(): Date {
  const today = new Date();
  const year = today.getFullYear();

  // Quarter end months: 2 (March), 5 (June), 8 (September), 11 (December)
  const quarterEnds = [
    new Date(year, 2, 31),  // March 31
    new Date(year, 5, 30),  // June 30
    new Date(year, 8, 30),  // September 30
    new Date(year, 11, 31), // December 31
  ];

  // Find the most recent quarter-end that's not in the future
  for (let i = quarterEnds.length - 1; i >= 0; i--) {
    if (quarterEnds[i]! <= today) {
      return quarterEnds[i]!;
    }
  }

  // If all this year's quarter-ends are in the future, return last year's Q4
  return new Date(year - 1, 11, 31);
}

/**
 * Initialize the cutoff date to the most recent quarter-end
 */
function initializeCutoffDate(): void {
  const cutoffInput = document.getElementById('cutoffDate') as HTMLInputElement;
  if (!cutoffInput) return;

  const quarterEnd = getMostRecentQuarterEnd();
  const year = quarterEnd.getFullYear();
  const month = String(quarterEnd.getMonth() + 1).padStart(2, '0');
  const day = String(quarterEnd.getDate()).padStart(2, '0');
  cutoffInput.value = `${year}-${month}-${day}`;
}

// ===========================
// Multi-Select Initialization
// ===========================

/**
 * Close all open multi-select dropdowns
 * Extracted to avoid redundant DOM queries
 */
function closeAllOpenMultiSelects(clearHighlight: boolean = false): void {
  document.querySelectorAll('.multi-select.open').forEach((ms) => {
    ms.classList.remove('open');
    ms.querySelector('.multi-select-trigger')?.setAttribute('aria-expanded', 'false');
    clearMultiSelectSearch(ms as HTMLElement);
    if (clearHighlight) {
      clearMultiSelectHighlight(ms as HTMLElement);
    }
  });
}

function initMultiSelectDropdowns(): void {
  const multiSelects = document.querySelectorAll('.multi-select');

  multiSelects.forEach((container) => {
    // Skip if already initialized to prevent duplicate listeners
    if ((container as HTMLElement).dataset.initialized === 'true') return;
    (container as HTMLElement).dataset.initialized = 'true';

    const trigger = container.querySelector('.multi-select-trigger');
    const dropdown = container.querySelector('.multi-select-dropdown');

    if (!trigger || !dropdown) return;

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = container.classList.contains('open');

      // Close all others
      closeAllOpenMultiSelects();

      if (!wasOpen) {
        container.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        setTimeout(() => {
          const searchInput = dropdown.querySelector('.multi-select-search input') as HTMLInputElement;
          if (searchInput) searchInput.focus();
        }, 0);
      }
    });

    // Keyboard navigation
    trigger.addEventListener('keydown', (e) => {
      const event = e as KeyboardEvent;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        (trigger as HTMLElement).click();
      } else if (event.key === 'Escape') {
        container.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        clearMultiSelectSearch(container as HTMLElement);
      }
    });

    // Handle search input
    dropdown.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (target.matches('.multi-select-search input')) {
        filterMultiSelectOptions(container as HTMLElement, (target as HTMLInputElement).value);
        // Reset highlight when search changes
        clearMultiSelectHighlight(container as HTMLElement);
        // Update Select All checkbox based on new visible options
        updateSelectAllCheckbox(container as HTMLElement);
      }
    });

    // Handle dropdown keyboard (arrow navigation + enter to toggle)
    dropdown.addEventListener('keydown', (e) => {
      const event = e as KeyboardEvent;

      if (event.key === 'Escape') {
        container.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        clearMultiSelectSearch(container as HTMLElement);
        clearMultiSelectHighlight(container as HTMLElement);
        (trigger as HTMLElement).focus();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        navigateMultiSelectOptions(container as HTMLElement, event.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const highlighted = container.querySelector('.multi-select-option.highlighted') as HTMLElement;
        if (highlighted && !highlighted.classList.contains('search-hidden')) {
          toggleMultiSelectOption(container as HTMLElement, highlighted, applyFiltersDebounced);
        }
        return;
      }
    });

    // Handle option clicks
    dropdown.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target.closest('.multi-select-search')) {
        e.stopPropagation();
        return;
      }

      const option = target.closest('.multi-select-option') as HTMLElement;
      if (option) {
        e.stopPropagation();

        // Handle "Select All" option
        if (option.classList.contains('multi-select-all-option')) {
          toggleAllVisibleOptions(container as HTMLElement);

          // Handle cascading for group filter if needed
          if (container.id === 'groupFilter') {
            const selectedOptions = container.querySelectorAll('.multi-select-option.selected:not(.multi-select-all-option)');
            selectedOptions.forEach((opt) => {
              const groupId = parseInt((opt as HTMLElement).getAttribute('data-value') || '0');
              handleGroupFilterCascade(container as HTMLElement, groupId, true);
            });
          }

          applyFiltersDebounced();
          return;
        }

        toggleMultiSelectOption(container as HTMLElement, option, applyFiltersDebounced);
      }
    });

    // Handle mouseover to update highlight
    dropdown.addEventListener('mouseover', (e) => {
      const option = (e.target as HTMLElement).closest('.multi-select-option') as HTMLElement;
      if (option && !option.classList.contains('search-hidden')) {
        clearMultiSelectHighlight(container as HTMLElement);
        option.classList.add('highlighted');
      }
    });
  });

}

// ===========================
// Searchable Select Initialization
// ===========================

function initSearchableSelects(): void {
  const searchableSelects = document.querySelectorAll('.searchable-select');

  searchableSelects.forEach((container) => {
    // Skip if already initialized to prevent duplicate listeners
    if ((container as HTMLElement).dataset.initialized === 'true') return;
    (container as HTMLElement).dataset.initialized = 'true';

    const trigger = container.querySelector('.searchable-select-trigger');
    const dropdown = container.querySelector('.searchable-select-dropdown');
    const hiddenInput = container.querySelector('input[type="hidden"]') as HTMLInputElement;

    if (!trigger || !dropdown || !hiddenInput) return;

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = container.classList.contains('open');

      // Close all other searchable selects
      document.querySelectorAll('.searchable-select.open').forEach((ss) => {
        ss.classList.remove('open');
        ss.querySelector('.searchable-select-trigger')?.setAttribute('aria-expanded', 'false');
        const searchInput = ss.querySelector('.searchable-select-search input') as HTMLInputElement;
        if (searchInput) searchInput.value = '';
        filterSearchableOptions(ss as HTMLElement, '');
      });

      if (!wasOpen) {
        container.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        setTimeout(() => {
          const searchInput = dropdown.querySelector('.searchable-select-search input') as HTMLInputElement;
          if (searchInput) searchInput.focus();
        }, 0);
      }
    });

    // Keyboard navigation
    trigger.addEventListener('keydown', (e) => {
      const event = e as KeyboardEvent;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        (trigger as HTMLElement).click();
      } else if (event.key === 'Escape') {
        container.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    // Handle search input
    dropdown.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (target.matches('.searchable-select-search input')) {
        filterSearchableOptions(container as HTMLElement, (target as HTMLInputElement).value);
        // Reset highlight when search changes
        clearSearchableHighlight(container as HTMLElement);
      }
    });

    // Handle dropdown keyboard (arrow navigation + enter to select)
    dropdown.addEventListener('keydown', (e) => {
      const event = e as KeyboardEvent;

      if (event.key === 'Escape') {
        container.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        clearSearchableHighlight(container as HTMLElement);
        (trigger as HTMLElement).focus();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        navigateSearchableOptions(container as HTMLElement, event.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const highlighted = container.querySelector('.searchable-select-option.highlighted') as HTMLElement;
        if (highlighted && !highlighted.classList.contains('search-hidden')) {
          selectSearchableOption(container as HTMLElement, highlighted, hiddenInput, trigger as HTMLElement);
        }
        return;
      }
    });

    // Handle option clicks
    dropdown.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.searchable-select-search')) {
        e.stopPropagation();
        return;
      }

      const option = target.closest('.searchable-select-option') as HTMLElement;
      if (option) {
        e.stopPropagation();
        selectSearchableOption(container as HTMLElement, option, hiddenInput, trigger as HTMLElement);
      }
    });

    // Handle mouseover to update highlight
    dropdown.addEventListener('mouseover', (e) => {
      const option = (e.target as HTMLElement).closest('.searchable-select-option') as HTMLElement;
      if (option && !option.classList.contains('search-hidden')) {
        clearSearchableHighlight(container as HTMLElement);
        option.classList.add('highlighted');
      }
    });
  });

}

// ===========================
// Global Click Handler (Consolidated)
// ===========================

/**
 * Single consolidated handler for closing dropdowns on outside click.
 * This avoids multiple global document listeners.
 */
function initGlobalClickHandler(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Close multi-select dropdowns
    if (!target.closest('.multi-select')) {
      closeAllOpenMultiSelects(true);
    }

    // Close searchable-select dropdowns
    if (!target.closest('.searchable-select')) {
      document.querySelectorAll('.searchable-select.open').forEach((ss) => {
        ss.classList.remove('open');
        ss.querySelector('.searchable-select-trigger')?.setAttribute('aria-expanded', 'false');
        const searchInput = ss.querySelector('.searchable-select-search input') as HTMLInputElement;
        if (searchInput) searchInput.value = '';
        filterSearchableOptions(ss as HTMLElement, '');
      });
    }

    // Close action dropdown
    const actionDropdown = document.getElementById('actionDropdown');
    if (actionDropdown && !target.closest('#actionDropdown') && !target.closest('.fund-actions-btn')) {
      actionDropdown.classList.remove('show');
    }
  });
}

/**
 * Filter options in a searchable select based on search text
 */
function filterSearchableOptions(container: HTMLElement, searchText: string): void {
  const optionsContainer = container.querySelector('.searchable-select-options');
  const noResults = container.querySelector('.searchable-select-no-results');
  if (!optionsContainer) return;

  const options = optionsContainer.querySelectorAll('.searchable-select-option');
  const searchLower = searchText.toLowerCase().trim();
  let visibleCount = 0;

  options.forEach((option) => {
    const text = option.textContent?.toLowerCase() || '';

    if (searchLower === '' || text.includes(searchLower)) {
      option.classList.remove('search-hidden');
      visibleCount++;
    } else {
      option.classList.add('search-hidden');
    }
  });

  // Show/hide no results message
  if (noResults) {
    noResults.classList.toggle('visible', visibleCount === 0 && searchLower !== '');
  }
}

/**
 * Clear highlight from all options in a searchable select
 */
function clearSearchableHighlight(container: HTMLElement): void {
  container.querySelectorAll('.searchable-select-option.highlighted').forEach((opt) => {
    opt.classList.remove('highlighted');
  });
}

/**
 * Navigate through searchable select options with arrow keys
 */
function navigateSearchableOptions(container: HTMLElement, direction: number): void {
  const options = Array.from(
    container.querySelectorAll('.searchable-select-option:not(.search-hidden)')
  ) as HTMLElement[];

  if (options.length === 0) return;

  const currentHighlight = container.querySelector('.searchable-select-option.highlighted') as HTMLElement;
  let currentIndex = currentHighlight ? options.indexOf(currentHighlight) : -1;

  // Clear current highlight
  clearSearchableHighlight(container);

  // Calculate new index
  let newIndex = currentIndex + direction;
  if (newIndex < 0) newIndex = options.length - 1;
  if (newIndex >= options.length) newIndex = 0;

  // Apply new highlight
  const newOption = options[newIndex];
  if (newOption) {
    newOption.classList.add('highlighted');
    // Scroll into view if needed
    newOption.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Select an option in a searchable select
 */
function selectSearchableOption(
  container: HTMLElement,
  option: HTMLElement,
  hiddenInput: HTMLInputElement,
  trigger: HTMLElement
): void {
  // Update hidden input value
  const value = option.dataset.value || '';
  hiddenInput.value = value;

  // Dispatch change event so listeners can react
  hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));

  // Update display
  const display = container.querySelector('.searchable-select-display');
  if (display) {
    display.textContent = option.textContent?.trim() || container.getAttribute('data-placeholder') || 'Select...';
  }

  // Update selected state
  container.querySelectorAll('.searchable-select-option').forEach((opt) => {
    opt.classList.remove('selected');
  });
  option.classList.add('selected');

  // Close dropdown
  container.classList.remove('open');
  trigger.setAttribute('aria-expanded', 'false');

  // Clear search and highlight
  const searchInput = container.querySelector('.searchable-select-search input') as HTMLInputElement;
  if (searchInput) searchInput.value = '';
  filterSearchableOptions(container, '');
  clearSearchableHighlight(container);
}

// ===========================
// Multi-Select Keyboard Navigation Helpers
// ===========================

/**
 * Clear highlight from all options in a multi-select
 */
function clearMultiSelectHighlight(container: HTMLElement): void {
  container.querySelectorAll('.multi-select-option.highlighted').forEach((opt) => {
    opt.classList.remove('highlighted');
  });
}

/**
 * Navigate through multi-select options with arrow keys
 */
function navigateMultiSelectOptions(container: HTMLElement, direction: number): void {
  const options = Array.from(
    container.querySelectorAll('.multi-select-option:not(.search-hidden)')
  ) as HTMLElement[];

  if (options.length === 0) return;

  const currentHighlight = container.querySelector('.multi-select-option.highlighted') as HTMLElement;
  let currentIndex = currentHighlight ? options.indexOf(currentHighlight) : -1;

  // Clear current highlight
  clearMultiSelectHighlight(container);

  // Calculate new index
  let newIndex = currentIndex + direction;
  if (newIndex < 0) newIndex = options.length - 1;
  if (newIndex >= options.length) newIndex = 0;

  // Apply new highlight
  const newOption = options[newIndex];
  if (newOption) {
    newOption.classList.add('highlighted');
    // Scroll into view if needed
    newOption.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Toggle selection of highlighted option in a multi-select
 */
function toggleMultiSelectOption(
  container: HTMLElement,
  option: HTMLElement,
  applyFilters: () => void
): void {
  option.classList.toggle('selected');
  const checkbox = option.querySelector('input[type="checkbox"]') as HTMLInputElement;
  if (checkbox) checkbox.checked = option.classList.contains('selected');
  option.setAttribute('aria-selected', option.classList.contains('selected').toString());

  // Handle cascading for group filter
  if (container.id === 'groupFilter') {
    const groupId = parseInt(option.getAttribute('data-value') || '0');
    const isNowSelected = option.classList.contains('selected');
    handleGroupFilterCascade(container, groupId, isNowSelected);
  }

  // Update Select All checkbox state
  updateSelectAllCheckbox(container);

  updateMultiSelectDisplay(container.id);
  applyFilters();
}

// ===========================
// Event Listener Setup
// ===========================

function initializeEventListeners(): void {
  // Table header click (sorting)
  const tableHeader = document.querySelector('#fundsTable thead');
  if (tableHeader) {
    tableHeader.addEventListener('click', handleHeaderClick);
  }

  // Table body clicks
  const tableBody = document.getElementById('fundsTableBody');
  if (tableBody) {
    tableBody.addEventListener('click', handleActionButtonClick);
  }

  // Action dropdown actions
  const actionEdit = document.getElementById('actionEdit');
  const actionDuplicate = document.getElementById('actionDuplicate');
  const actionViewDetails = document.getElementById('actionViewDetails');
  const actionDelete = document.getElementById('actionDelete');

  if (actionEdit) {
    actionEdit.addEventListener('click', (e) => {
      e.preventDefault();
      const fundId = getCurrentActionFundId();
      if (fundId) {
        showEditFundModal(fundId);
      }
      document.getElementById('actionDropdown')?.classList.remove('show');
    });
  }

  if (actionDuplicate) {
    actionDuplicate.addEventListener('click', (e) => {
      e.preventDefault();
      const fundId = getCurrentActionFundId();
      if (fundId) {
        showDuplicateFundModal(fundId);
      }
      document.getElementById('actionDropdown')?.classList.remove('show');
    });
  }

  if (actionViewDetails) {
    actionViewDetails.addEventListener('click', (e) => {
      e.preventDefault();
      const fundId = getCurrentActionFundId();
      if (fundId) {
        showDetailsModal(fundId, renderTable);
      }
      document.getElementById('actionDropdown')?.classList.remove('show');
    });
  }

  if (actionDelete) {
    actionDelete.addEventListener('click', async (e) => {
      e.preventDefault();
      const fundId = getCurrentActionFundId();
      if (fundId) {
        await deleteFund(fundId, renderTable);
      }
      document.getElementById('actionDropdown')?.classList.remove('show');
    });
  }

  // Fund modal
  const fundForm = document.getElementById('fundForm');
  if (fundForm) {
    fundForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveFundFromModal(renderTable);
    });
  }

  const closeFundModalBtn = document.getElementById('closeFundModalBtn');
  const cancelFundModalBtn = document.getElementById('cancelFundModalBtn');
  [closeFundModalBtn, cancelFundModalBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => closeFundModalWithConfirm());
    }
  });

  // Fund name dropdown - handle "Add new" option
  const fundNameSelect = document.getElementById('fundName');
  if (fundNameSelect) {
    fundNameSelect.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      const newNameContainer = document.getElementById('newFundNameContainer');
      if (value === '__new__' && newNameContainer) {
        newNameContainer.style.display = 'block';
        (document.getElementById('newFundNameInline') as HTMLInputElement)?.focus();
      } else if (newNameContainer) {
        newNameContainer.style.display = 'none';
      }
    });
  }

  // Details modal
  const addCashFlowRowBtn = document.getElementById('addCashFlowRowBtn');
  const addNavRowBtn = document.getElementById('addNavRowBtn');
  const saveDetailsChangesBtn = document.getElementById('saveDetailsChangesBtn');
  const cancelDetailsModalBtn = document.getElementById('cancelDetailsModalBtn');
  const closeDetailsModalBtn = document.getElementById('closeDetailsModalBtn');

  if (addCashFlowRowBtn) {
    addCashFlowRowBtn.addEventListener('click', addCashFlowRow);
  }

  if (addNavRowBtn) {
    addNavRowBtn.addEventListener('click', addNavRow);
  }

  if (saveDetailsChangesBtn) {
    saveDetailsChangesBtn.addEventListener('click', () => saveDetailsFromModal(renderTable));
  }

  [cancelDetailsModalBtn, closeDetailsModalBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', async () => {
        if (AppState.hasUnsavedChanges) {
          const confirmed = await showConfirm('You have unsaved changes. Discard them?', {
            title: 'Unsaved Changes',
            confirmText: 'Discard',
            cancelText: 'Keep Editing',
          });
          if (!confirmed) return;
        }
        AppState.setUnsavedChanges(false);
        closeModal('detailsModal');
      });
    }
  });

  // Handle delete buttons in details modal
  const cashFlowsTable = document.getElementById('cashFlowsTable');
  const navTable = document.getElementById('navTable');

  [cashFlowsTable, navTable].forEach((table) => {
    if (table) {
      table.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const deleteBtn = target.closest('.delete-row-btn') as HTMLElement;
        if (deleteBtn) {
          const row = deleteBtn.closest('tr');
          if (row) {
            row.remove();
            AppState.setUnsavedChanges(true);
            updateDetailsSummary();
          }
        }
      });

      // Mark unsaved changes when inputs change
      table.addEventListener('input', () => {
        AppState.setUnsavedChanges(true);
        updateDetailsSummary();
      });

      // Handle checkbox and select changes (change event doesn't fire for text input)
      table.addEventListener('change', () => {
        AppState.setUnsavedChanges(true);
        updateDetailsSummary();
      });
    }
  });

  // Manage funds modal
  const sidebarManageFunds = document.getElementById('sidebarManageFunds');
  if (sidebarManageFunds) {
    sidebarManageFunds.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showManageFundsModal();
    });
  }

  const closeManageFundsModalBtn = document.getElementById('closeManageFundsModalBtn');
  const closeManageFundsModal2Btn = document.getElementById('closeManageFundsModal2Btn');
  [closeManageFundsModalBtn, closeManageFundsModal2Btn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => closeModal('manageFundNamesModal'));
    }
  });

  // Add new fund name button in manage funds modal
  const addNewFundNameModalBtn = document.getElementById('addNewFundNameModalBtn');
  if (addNewFundNameModalBtn) {
    addNewFundNameModalBtn.addEventListener('click', () => addNewFundNameFromModal(renderTable));
  }

  // Fund names list actions (edit/delete)
  const fundNamesList = document.getElementById('fundNamesList');
  if (fundNamesList) {
    fundNamesList.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('button') as HTMLElement;
      if (!btn) return;

      const action = btn.dataset.action;
      const name = btn.dataset.name;

      if (action === 'editFundName' && name) {
        showEditFundNameModal(name);
      } else if (action === 'deleteFundName' && name) {
        await deleteFundNameByName(name, renderTable);
      }
    });
  }

  // Edit fund name modal
  const closeEditFundNameModalBtn = document.getElementById('closeEditFundNameModalBtn');
  const cancelEditFundNameBtn = document.getElementById('cancelEditFundNameBtn');
  [closeEditFundNameModalBtn, cancelEditFundNameBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => {
        resetFundNamesModalState();
        closeModal('editFundNameModal');
      });
    }
  });

  const saveEditedFundNameBtn = document.getElementById('saveEditedFundNameBtn');
  if (saveEditedFundNameBtn) {
    saveEditedFundNameBtn.addEventListener('click', () => saveEditedFundName(renderTable));
  }

  // Edit fund name tags input
  const editFundTagsInput = document.getElementById('editFundTagsInput') as HTMLInputElement;
  if (editFundTagsInput) {
    editFundTagsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = editFundTagsInput.value.trim();
        if (value) {
          addEditTag(value);
          editFundTagsInput.value = '';
        }
      }
    });
  }

  // Edit fund name tag remove handler
  const editFundTagsContainer = document.getElementById('editFundTagsContainer');
  if (editFundTagsContainer) {
    editFundTagsContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('tag-remove')) {
        const index = parseInt(target.dataset.index || '0');
        removeEditTag(index);
      }
    });
  }

  // Add new fund name inline (in fund modal)
  const addNewFundNameBtn = document.getElementById('addNewFundNameBtn');
  if (addNewFundNameBtn) {
    addNewFundNameBtn.addEventListener('click', addNewFundNameInline);
  }

  const cancelNewFundNameBtn = document.getElementById('cancelNewFundNameBtn');
  if (cancelNewFundNameBtn) {
    cancelNewFundNameBtn.addEventListener('click', cancelNewFundNameInline);
  }

  // Manage groups modal
  const sidebarManageGroups = document.getElementById('sidebarManageGroups');
  if (sidebarManageGroups) {
    sidebarManageGroups.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showManageGroupsModal();
    });
  }

  const closeManageGroupsModalBtn = document.getElementById('closeManageGroupsModalBtn');
  const closeManageGroupsModal2Btn = document.getElementById('closeManageGroupsModal2Btn');
  [closeManageGroupsModalBtn, closeManageGroupsModal2Btn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => closeModal('manageGroupsModal'));
    }
  });

  const saveGroupBtn = document.getElementById('saveGroupBtn');
  if (saveGroupBtn) {
    saveGroupBtn.addEventListener('click', () => saveGroupFromModal(renderTable));
  }

  // Handle group actions in manage groups modal
  const groupsList = document.getElementById('groupsList');
  if (groupsList) {
    groupsList.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('button') as HTMLElement;
      if (!btn) return;

      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id || '0');

      if (action === 'editGroup' && !isNaN(id)) {
        const group = AppState.getGroupByIdSync(id);
        if (group) {
          const editGroupId = document.getElementById('editGroupId') as HTMLInputElement;
          const newGroupName = document.getElementById('newGroupName') as HTMLInputElement;
          const newGroupType = document.getElementById('newGroupType') as HTMLSelectElement;
          const saveGroupBtn = document.getElementById('saveGroupBtn');
          const cancelEditBtn = document.getElementById('cancelEditBtn');
          const groupFormTitle = document.getElementById('groupFormTitle');

          if (editGroupId) editGroupId.value = id.toString();
          if (newGroupName) newGroupName.value = group.name;
          if (newGroupType) newGroupType.value = group.type || '';
          if (saveGroupBtn) saveGroupBtn.textContent = 'Update Group';
          if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
          if (groupFormTitle) groupFormTitle.textContent = 'Edit Group';

          // Populate parent dropdown excluding this group and its descendants
          populateGroupDropdown('newGroupParent', id);
          setSearchableSelectValue('newGroupParent', group.parentGroupId?.toString() || '');
        }
      } else if (action === 'deleteGroup' && !isNaN(id)) {
        await deleteGroupById(id, renderTable);
      }
    });
  }

  const cancelEditBtn = document.getElementById('cancelEditBtn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      const editGroupId = document.getElementById('editGroupId') as HTMLInputElement;
      const newGroupName = document.getElementById('newGroupName') as HTMLInputElement;
      const newGroupType = document.getElementById('newGroupType') as HTMLSelectElement;
      const saveGroupBtn = document.getElementById('saveGroupBtn');
      const groupFormTitle = document.getElementById('groupFormTitle');

      if (editGroupId) editGroupId.value = '';
      if (newGroupName) newGroupName.value = '';
      if (newGroupType) newGroupType.value = '';
      if (saveGroupBtn) saveGroupBtn.textContent = 'Add Group';
      if (groupFormTitle) groupFormTitle.textContent = 'Add New Group';
      cancelEditBtn.style.display = 'none';

      populateGroupDropdown('newGroupParent');
    });
  }

  // Sidebar
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', openSidebar);
  }

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', closeSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  // Sidebar - New Investment
  const sidebarNewInvestment = document.getElementById('sidebarNewInvestment');
  if (sidebarNewInvestment) {
    sidebarNewInvestment.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showAddFundModal();
    });
  }

  // Sidebar - Show Tags checkbox
  const sidebarShowTagsCheckbox = document.getElementById('sidebarShowTagsCheckbox');
  if (sidebarShowTagsCheckbox) {
    sidebarShowTagsCheckbox.addEventListener('change', async () => {
      const checked = (sidebarShowTagsCheckbox as HTMLInputElement).checked;
      localStorage.setItem('showTags', checked.toString());
      await renderTable();
    });

    // Restore saved preference
    const savedShowTags = localStorage.getItem('showTags');
    if (savedShowTags !== null) {
      (sidebarShowTagsCheckbox as HTMLInputElement).checked = savedShowTags === 'true';
    }
  }

  // Header - Group by Fund toggle button
  const groupByFundToggle = document.getElementById('groupByFundToggle');
  if (groupByFundToggle) {
    // Initialize toggle state from localStorage
    const savedGroupByFund = localStorage.getItem(CONFIG.STORAGE_GROUP_BY_FUND);
    if (savedGroupByFund === 'true') {
      groupByFundToggle.classList.add('active');
    }

    groupByFundToggle.addEventListener('click', async () => {
      const currentState = localStorage.getItem(CONFIG.STORAGE_GROUP_BY_FUND) === 'true';
      const newState = !currentState;
      groupByFundToggle.classList.toggle('active', newState);
      localStorage.setItem(CONFIG.STORAGE_GROUP_BY_FUND, newState.toString());
      await renderTable();
    });
  }

  // Sidebar - Mask Accounts checkbox
  const sidebarMaskAccountsCheckbox = document.getElementById('sidebarMaskAccountsCheckbox');
  if (sidebarMaskAccountsCheckbox) {
    sidebarMaskAccountsCheckbox.addEventListener('change', () => {
      const checked = (sidebarMaskAccountsCheckbox as HTMLInputElement).checked;
      localStorage.setItem(CONFIG.STORAGE_MASK_ACCOUNTS, checked.toString());
      document.documentElement.setAttribute('data-mask-accounts', checked.toString());
    });

    // Restore saved preference
    const savedMaskAccounts = localStorage.getItem(CONFIG.STORAGE_MASK_ACCOUNTS);
    if (savedMaskAccounts !== null) {
      const isMasked = savedMaskAccounts === 'true';
      (sidebarMaskAccountsCheckbox as HTMLInputElement).checked = isMasked;
      document.documentElement.setAttribute('data-mask-accounts', isMasked.toString());
    }
  }

  // Sidebar - Clear Database
  const sidebarClearDatabase = document.getElementById('sidebarClearDatabase');
  if (sidebarClearDatabase) {
    sidebarClearDatabase.addEventListener('click', async (e) => {
      e.preventDefault();
      closeSidebar();

      const confirmed = await showConfirm(
        'Are you sure you want to clear ALL data? This action cannot be undone!',
        { title: 'Clear Database', confirmText: 'Clear All Data', cancelText: 'Cancel' }
      );

      if (confirmed) {
        try {
          showLoading('Clearing database...');
          await clearAllData();
          AppState.clearMetricsCache();
          AppState.setFunds([]);
          AppState.setGroups([]);
          showStatus('Database cleared successfully');
          await renderTable();
        } catch (err) {
          console.error('Error clearing database:', err);
          showStatus('Error clearing database: ' + (err as Error).message, 'error');
        } finally {
          hideLoading();
        }
      }
    });
  }

  // Sidebar - Export CSV
  const sidebarExportCSV = document.getElementById('sidebarExportCSV');
  if (sidebarExportCSV) {
    sidebarExportCSV.addEventListener('click', async (e) => {
      e.preventDefault();
      closeSidebar();
      await exportToCSV();
    });
  }

  // Sidebar - Export JSON
  const sidebarExportJSON = document.getElementById('sidebarExportJSON');
  if (sidebarExportJSON) {
    sidebarExportJSON.addEventListener('click', async (e) => {
      e.preventDefault();
      closeSidebar();
      await exportDatabase();
      updateLastBackupTime();
    });
  }

  // Sidebar - Export PDF
  const sidebarExportPDF = document.getElementById('sidebarExportPDF');
  if (sidebarExportPDF) {
    sidebarExportPDF.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      exportToPDF();
    });
  }

  // Sidebar - Import JSON
  const sidebarImportJSON = document.getElementById('sidebarImportJSON');
  if (sidebarImportJSON) {
    sidebarImportJSON.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showImportPreviewModal();
    });
  }

  // Sidebar - Load Sample Data
  const sidebarLoadSampleData = document.getElementById('sidebarLoadSampleData');
  if (sidebarLoadSampleData) {
    sidebarLoadSampleData.addEventListener('click', async (e) => {
      e.preventDefault();
      closeSidebar();

      const confirmed = await showConfirm(
        'This will add sample data to your database. Existing data will not be deleted. Continue?',
        { title: 'Load Sample Data', confirmText: 'Load Data', cancelText: 'Cancel' }
      );

      if (confirmed) {
        await loadSampleData(renderTable);
      }
    });
  }

  // Sidebar - Health Check
  const sidebarHealthCheck = document.getElementById('sidebarHealthCheck');
  if (sidebarHealthCheck) {
    sidebarHealthCheck.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showHealthCheckModal();
    });
  }

  // Sidebar - Sync Account Groups
  const sidebarSyncAccountGroups = document.getElementById('sidebarSyncAccountGroups');
  if (sidebarSyncAccountGroups) {
    sidebarSyncAccountGroups.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showSyncAccountGroupsModal();
    });
  }

  // Sidebar - Bulk Cash Flow
  const sidebarBulkCashFlow = document.getElementById('sidebarBulkCashFlow');
  if (sidebarBulkCashFlow) {
    sidebarBulkCashFlow.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showBulkCashFlowModal();
    });
  }

  // Sidebar - Bulk Assign Group
  const sidebarBulkAssignGroup = document.getElementById('sidebarBulkAssignGroup');
  if (sidebarBulkAssignGroup) {
    sidebarBulkAssignGroup.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showBulkAssignGroupModal();
    });
  }

  // Sidebar - Bulk Remove Fund
  const sidebarBulkRemoveFund = document.getElementById('sidebarBulkRemoveFund');
  if (sidebarBulkRemoveFund) {
    sidebarBulkRemoveFund.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      showBulkRemoveFundModal();
    });
  }

  // Initialize bulk operation modal listeners
  initBulkOperationListeners(renderTable);

  // Import preview modal
  const importFileInput = document.getElementById('importPreviewFileInput');
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportFileSelect);
  }

  const applyImportBtn = document.getElementById('applyImportBtn');
  if (applyImportBtn) {
    applyImportBtn.addEventListener('click', () => applyImport(renderTable));
  }

  const closeImportPreviewModalBtn = document.getElementById('closeImportPreviewModalBtn');
  const cancelImportBtn = document.getElementById('cancelImportPreviewBtn');
  [closeImportPreviewModalBtn, cancelImportBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => closeModal('importPreviewModal'));
    }
  });

  // Sync Account Groups modal
  const closeSyncAccountGroupsModalBtn = document.getElementById('closeSyncAccountGroupsModalBtn');
  const cancelSyncAccountGroupsBtn = document.getElementById('cancelSyncAccountGroupsBtn');
  [closeSyncAccountGroupsModalBtn, cancelSyncAccountGroupsBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => {
        resetGroupModalState();
        closeModal('syncAccountGroupsModal');
      });
    }
  });

  const applySyncAccountGroupsBtn = document.getElementById('applySyncAccountGroupsBtn');
  if (applySyncAccountGroupsBtn) {
    applySyncAccountGroupsBtn.addEventListener('click', () => applySyncAccountGroups(renderTable));
  }

  // Cutoff date change
  const cutoffDate = document.getElementById('cutoffDate');
  if (cutoffDate) {
    cutoffDate.addEventListener('change', applyFiltersDebounced);
  }

  // Active filters indicator - clear button
  const activeFiltersIndicator = document.getElementById('activeFiltersIndicator');
  if (activeFiltersIndicator) {
    activeFiltersIndicator.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('clear-filters')) {
        resetFilters();
        applyFilters();
      }
    });
  }

  // Timeline panel toggle
  const timelineHeader = document.getElementById('timelineHeader');
  const timelinePanel = document.getElementById('timelinePanel');
  if (timelineHeader && timelinePanel) {
    timelineHeader.addEventListener('click', () => {
      const isExpanded = timelinePanel.classList.toggle('expanded');
      if (isExpanded) {
        renderTimeline();
      }
    });
  }

  // Timeline table event delegation for expandable rows
  const timelineContainer = document.getElementById('timelineTableContainer');
  if (timelineContainer) {
    timelineContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const expandRow = target.closest('.timeline-expand-row') as HTMLElement | null;
      if (!expandRow) return;

      const type = expandRow.dataset.type;
      const isExpanded = expandRow.classList.toggle('expanded');
      const icon = expandRow.querySelector('.timeline-expand-icon');
      if (icon) {
        icon.textContent = isExpanded ? '▼' : '▶';
      }

      // Toggle fund detail rows
      timelineContainer.querySelectorAll(`.timeline-fund-row[data-type="${type}"]`).forEach((fundRow) => {
        fundRow.classList.toggle('visible', isExpanded);
      });
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }

    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      showAddFundModal();
    } else if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      openModal('shortcutsModal');
    } else if (e.key === 'Escape') {
      // Close any open modal or sidebar
      closeSidebar();
      document.querySelectorAll('.modal.show').forEach((modal) => {
        closeModal(modal.id);
      });
    }
  });

  // Close shortcuts modal
  const closeShortcutsModalBtn = document.getElementById('closeShortcutsModalBtn');
  const closeShortcutsModal2Btn = document.getElementById('closeShortcutsModal2Btn');
  [closeShortcutsModalBtn, closeShortcutsModal2Btn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => closeModal('shortcutsModal'));
    }
  });
}

// ===========================
// Initialization
// ===========================

async function init(): Promise<void> {
  try {
    showLoading('Initializing...');

    // Initialize database
    await initDB();

    // Load initial data
    const funds = await getAllFunds();
    AppState.setFunds(funds);

    const groups = await getAllGroups();
    AppState.setGroups(groups);

    const fundNameObjects = await getAllFundNameObjects();
    const fundNameDataMap = new Map<string, FundNameData>();
    fundNameObjects.forEach((obj) => fundNameDataMap.set(obj.name, obj));
    AppState.setFundNameData(fundNameDataMap);
    AppState.setFundNames(new Set(fundNameObjects.map((obj) => obj.name)));

    // Initialize UI components
    initializeDarkMode();
    initializeCutoffDate();
    initMultiSelectDropdowns();
    initSearchableSelects();
    initGlobalClickHandler();
    initializeEventListeners();
    initBackupWarningListeners();
    initHealthCheckModal();
    initColumnResizing();
    initAccountNumberAutoFill();
    initFundFormChangeTracking();

    // Initial render
    await renderTable();

    hideLoading();

    // Check backup reminder after a short delay (don't interfere with initial load)
    setTimeout(() => {
      checkBackupReminder();
    }, 1000);

    // Start export reminder interval (shows reminder every 5 minutes if data has changed)
    startExportReminderInterval();
  } catch (err) {
    console.error('Error initializing application:', err);
    hideLoading();
    showStatus('Error initializing application: ' + (err as Error).message, 'error');
  }
}

// Expose functions to window for inline handlers (if needed)
(window as any).showAddFundModal = showAddFundModal;
(window as any).showManageFundsModal = showManageFundsModal;
(window as any).resetFilters = resetFilters;

// Start the application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
