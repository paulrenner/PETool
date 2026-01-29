/**
 * Fund modal handlers - add, edit, duplicate, details, delete
 */

import type { Fund, FundNameData, CashFlow, Nav } from '../../types';
import { AppState } from '../../core/state';
import {
  getAllFunds,
  getFundById,
  saveFundToDB,
  deleteFundFromDB,
  getAllFundNameObjects,
} from '../../core/db';
import { calculateMetrics } from '../../calculations';
import { escapeHtml } from '../../utils/escaping';
import { formatCurrency, parseCurrency, formatNumberWithCommas } from '../../utils/formatting';
import { buildGroupsTree } from '../filters';
import { showStatus, showLoading, hideLoading, showConfirm, openModal, closeModal } from './common';
import type { Group } from '../../types';

// ===========================
// Fund Modal Unsaved Changes
// ===========================

/**
 * Mark the fund modal as having unsaved changes
 */
export function setFundModalUnsavedChanges(value: boolean): void {
  AppState.setFundModalUnsavedChanges(value);
}

/**
 * Check if fund modal has unsaved changes
 */
export function hasFundModalUnsavedChanges(): boolean {
  return AppState.fundModalHasUnsavedChanges;
}

/**
 * Initialize fund form change tracking
 */
export function initFundFormChangeTracking(): void {
  const formInputs = [
    'fundName',
    'accountNumber',
    'fundGroup',
    'commitment',
    'newFundNameInline',
  ];

  formInputs.forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => {
        AppState.setFundModalUnsavedChanges(true);
      });
      input.addEventListener('change', () => {
        AppState.setFundModalUnsavedChanges(true);
      });
    }
  });
}

/**
 * Close fund modal with unsaved changes confirmation
 */
export async function closeFundModalWithConfirm(): Promise<void> {
  if (AppState.fundModalHasUnsavedChanges) {
    const confirmed = await showConfirm('You have unsaved changes. Discard them?', {
      title: 'Unsaved Changes',
      confirmText: 'Discard',
      cancelText: 'Keep Editing',
    });
    if (!confirmed) return;
  }
  AppState.setFundModalUnsavedChanges(false);
  closeModal('fundModal');
}

// ===========================
// Group Auto-Fill Functions
// ===========================

// Store the suggested group for comparison when user changes it
let suggestedGroupId: number | null = null;
let accountHasExistingGroups = false;
// Request tracking to prevent race conditions in async lookups
let accountLookupRequestId = 0;

/**
 * Look up group for an account number based on existing funds
 */
async function lookupGroupForAccount(
  accountNumber: string,
  excludeFundId: number | null = null
): Promise<{ groupId: number | null; groupName: string | null; isAmbiguous: boolean; conflictingGroups: { groupId: number | null; groupName: string; count: number }[] }> {
  if (!accountNumber || accountNumber.trim() === '') {
    return { groupId: null, groupName: null, isAmbiguous: false, conflictingGroups: [] };
  }

  const normalizedAccount = accountNumber.trim().toLowerCase();
  const allFunds = await getAllFunds();

  // Find all funds with this account number (excluding the current fund if editing)
  const matchingFunds = allFunds.filter((f) => {
    if (excludeFundId && f.id === excludeFundId) return false;
    return f.accountNumber && f.accountNumber.trim().toLowerCase() === normalizedAccount;
  });

  if (matchingFunds.length === 0) {
    return { groupId: null, groupName: null, isAmbiguous: false, conflictingGroups: [] };
  }

  // Collect all unique group IDs (treating null as a valid distinct value)
  const groupIdMap = new Map<number | null, { groupId: number | null; groupName: string; count: number }>();
  matchingFunds.forEach((fund) => {
    const gId = fund.groupId || null;
    if (!groupIdMap.has(gId)) {
      const groupName = gId ? (AppState.getGroupByIdSync(gId)?.name || 'Unknown Group') : 'No Group';
      groupIdMap.set(gId, { groupId: gId, groupName: groupName, count: 1 });
    } else {
      groupIdMap.get(gId)!.count++;
    }
  });

  const uniqueGroups = Array.from(groupIdMap.values());

  if (uniqueGroups.length === 1) {
    // All matching funds have the same group - safe to auto-fill
    return {
      groupId: uniqueGroups[0]!.groupId,
      groupName: uniqueGroups[0]!.groupName,
      isAmbiguous: false,
      conflictingGroups: [],
    };
  } else {
    // Multiple different groups found - ambiguous
    return {
      groupId: null,
      groupName: null,
      isAmbiguous: true,
      conflictingGroups: uniqueGroups,
    };
  }
}

/**
 * Show auto-fill indicator below the group dropdown
 */
function showGroupAutoFillIndicator(
  type: 'auto-filled' | 'ambiguous',
  conflictingGroups: { groupId: number | null; groupName: string; count: number }[] = [],
  groupName: string = ''
): void {
  removeGroupAutoFillIndicator();

  const groupFormGroup = document.getElementById('fundGroup')?.closest('.form-group');
  if (!groupFormGroup) return;

  const indicator = document.createElement('div');
  indicator.id = 'groupAutoFillIndicator';
  indicator.style.cssText = 'margin-top: 6px; font-size: 12px; display: flex; align-items: flex-start; gap: 6px;';

  if (type === 'auto-filled') {
    indicator.innerHTML = `
      <span style="color: var(--color-success); display: flex; align-items: center; gap: 4px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Auto-filled from existing investor data
      </span>
      <span style="color: var(--color-text-light);">(${escapeHtml(groupName)})</span>
    `;
  } else if (type === 'ambiguous') {
    const groupsList = conflictingGroups.map((g) => `${escapeHtml(g.groupName)} (${g.count})`).join(', ');
    indicator.innerHTML = `
      <span style="color: var(--color-warning); display: flex; align-items: center; gap: 4px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        Multiple groups found for this account
      </span>
      <span style="color: var(--color-text-light); font-size: 11px;">(${groupsList})</span>
    `;
  }

  groupFormGroup.appendChild(indicator);
}

/**
 * Remove auto-fill indicator
 */
export function removeGroupAutoFillIndicator(): void {
  const existing = document.getElementById('groupAutoFillIndicator');
  if (existing) {
    existing.remove();
  }
}

/**
 * Handle account number input change - auto-fill group if applicable
 */
async function handleAccountNumberChange(): Promise<void> {
  const accountInput = document.getElementById('accountNumber') as HTMLInputElement;
  const groupSelect = document.getElementById('fundGroup') as HTMLSelectElement;
  const fundIdInput = document.getElementById('fundId') as HTMLInputElement;

  if (!accountInput || !groupSelect) return;

  const accountNumber = accountInput.value.trim();
  const excludeFundId = fundIdInput?.value ? parseInt(fundIdInput.value) : null;

  // Remove any existing auto-fill indicator
  removeGroupAutoFillIndicator();

  // Reset suggested group tracking
  suggestedGroupId = null;
  accountHasExistingGroups = false;

  if (!accountNumber) {
    return;
  }

  // Track this request to prevent race conditions
  const thisRequestId = ++accountLookupRequestId;

  const result = await lookupGroupForAccount(accountNumber, excludeFundId);

  // Check if this request is still the most recent one
  if (thisRequestId !== accountLookupRequestId) {
    return; // A newer request has been made, ignore this result
  }

  if (result.isAmbiguous) {
    // Show ambiguous indicator
    showGroupAutoFillIndicator('ambiguous', result.conflictingGroups);
    accountHasExistingGroups = true;
  } else if (result.groupId !== null || result.groupName === 'No Group') {
    // Auto-fill the group
    groupSelect.value = result.groupId?.toString() || '';
    showGroupAutoFillIndicator('auto-filled', [], result.groupName || 'No Group');
    // Store the suggested group for comparison when user changes it
    suggestedGroupId = result.groupId;
    accountHasExistingGroups = true;
  }
  // If no existing association found, no indicator is shown
}

/**
 * Show warning when user changes group from the suggested value
 */
function showGroupChangeWarning(conflictingGroups: { groupId: number | null; groupName: string; count: number }[]): void {
  removeGroupAutoFillIndicator();

  const groupFormGroup = document.getElementById('fundGroup')?.closest('.form-group');
  if (!groupFormGroup) return;

  const indicator = document.createElement('div');
  indicator.id = 'groupAutoFillIndicator';
  indicator.style.cssText = 'margin-top: 6px; font-size: 12px; display: flex; align-items: flex-start; gap: 6px;';

  const groupsList = conflictingGroups.map((g) => `${escapeHtml(g.groupName)} (${g.count})`).join(', ');
  indicator.innerHTML = `
    <span style="color: var(--color-warning); display: flex; align-items: center; gap: 4px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      Multiple groups will exist for this account
    </span>
    <span style="color: var(--color-text-light); font-size: 11px;">(${groupsList})</span>
  `;

  groupFormGroup.appendChild(indicator);
}

/**
 * Handle group dropdown change - show warning if different from suggested
 */
async function handleGroupChange(): Promise<void> {
  const groupSelect = document.getElementById('fundGroup') as HTMLSelectElement;
  const accountInput = document.getElementById('accountNumber') as HTMLInputElement;

  if (!groupSelect || !accountInput || !accountHasExistingGroups) return;

  const accountNumber = accountInput.value.trim();
  if (!accountNumber) return;

  const selectedGroupId = groupSelect.value ? parseInt(groupSelect.value) : null;

  // If user changed to a different group than suggested
  if (selectedGroupId !== suggestedGroupId) {
    // Look up existing groups for this account
    const fundIdInput = document.getElementById('fundId') as HTMLInputElement;
    const excludeFundId = fundIdInput?.value ? parseInt(fundIdInput.value) : null;
    const result = await lookupGroupForAccount(accountNumber, excludeFundId);

    if (result.conflictingGroups.length > 0 || result.groupId !== null) {
      // Build list of groups including the newly selected one
      const selectedGroupName = selectedGroupId
        ? (AppState.getGroupByIdSync(selectedGroupId)?.name || 'Unknown Group')
        : 'No Group';

      const allGroups = [...result.conflictingGroups];

      // If not ambiguous, add the original suggested group
      if (!result.isAmbiguous && result.groupId !== null) {
        allGroups.push({ groupId: result.groupId, groupName: result.groupName || 'No Group', count: 1 });
      }

      // Add the newly selected group if not already in the list
      if (!allGroups.some(g => g.groupId === selectedGroupId)) {
        allGroups.push({ groupId: selectedGroupId, groupName: selectedGroupName, count: 0 });
      }

      showGroupChangeWarning(allGroups);
    }
  } else {
    // User selected the suggested group - show auto-filled indicator
    if (suggestedGroupId !== null) {
      const groupName = AppState.getGroupByIdSync(suggestedGroupId)?.name || 'No Group';
      showGroupAutoFillIndicator('auto-filled', [], groupName);
    } else {
      removeGroupAutoFillIndicator();
    }
  }
}

/**
 * Initialize account number auto-fill listeners
 */
export function initAccountNumberAutoFill(): void {
  const accountInput = document.getElementById('accountNumber');
  const groupSelect = document.getElementById('fundGroup');

  if (!accountInput) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  accountInput.addEventListener('input', () => {
    // Debounce to avoid too many lookups while typing
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleAccountNumberChange, 300);
  });

  // Also trigger on blur for immediate feedback
  accountInput.addEventListener('blur', handleAccountNumberChange);

  // Listen for group dropdown changes
  if (groupSelect) {
    groupSelect.addEventListener('change', handleGroupChange);
  }
}

// ===========================
// Dropdown Population
// ===========================

/**
 * Populate fund name dropdown
 */
export async function populateFundNameDropdown(): Promise<void> {
  const select = document.getElementById('fundName') as HTMLSelectElement;
  if (!select) return;

  const fundNameObjects = await getAllFundNameObjects();
  const fundNames = fundNameObjects.map((obj) => obj.name).sort();

  // Update AppState
  AppState.setFundNames(new Set(fundNames));
  const fundNameDataMap = new Map<string, FundNameData>();
  fundNameObjects.forEach((obj) => fundNameDataMap.set(obj.name, obj));
  AppState.setFundNameData(fundNameDataMap);

  // Preserve current selection
  const currentValue = select.value;

  select.innerHTML = '<option value="">Select a fund</option>';
  fundNames.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  // Add "Add new fund name" option
  const addNewOption = document.createElement('option');
  addNewOption.value = '__new__';
  addNewOption.textContent = '+ Add new fund name...';
  select.appendChild(addNewOption);

  // Restore selection if valid
  if (currentValue && fundNames.includes(currentValue)) {
    select.value = currentValue;
  }
}

/**
 * Populate group dropdown
 */
export function populateGroupDropdown(
  selectId: string,
  excludeGroupId?: number
): void {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;

  const groups = AppState.getGroups();
  const tree = buildGroupsTree(groups, null);

  select.innerHTML = '<option value="">No Group</option>';

  const addGroupOptions = (
    nodes: Array<Group & { children: any[] }>,
    level: number
  ) => {
    nodes.forEach((node) => {
      if (excludeGroupId !== undefined && node.id === excludeGroupId) return;

      const option = document.createElement('option');
      option.value = node.id.toString();
      const prefix = level > 0 ? '–'.repeat(level) + ' ' : '';
      option.textContent = prefix + node.name;
      select.appendChild(option);

      if (node.children && node.children.length > 0) {
        addGroupOptions(node.children, level + 1);
      }
    });
  };

  addGroupOptions(tree, 0);
}

// ===========================
// Fund Modal Operations
// ===========================

/**
 * Show add fund modal
 */
export async function showAddFundModal(): Promise<void> {
  const modalTitle = document.getElementById('fundModalTitle');
  const fundIdInput = document.getElementById('fundId') as HTMLInputElement;
  const isDuplicateInput = document.getElementById('isDuplicate') as HTMLInputElement;
  const saveFundBtn = document.getElementById('saveFundBtn');
  const multiplierContainer = document.getElementById('duplicateMultiplierContainer');

  if (modalTitle) modalTitle.textContent = 'Add New Investment';
  if (fundIdInput) fundIdInput.value = '';
  if (isDuplicateInput) isDuplicateInput.value = '';
  if (saveFundBtn) saveFundBtn.textContent = 'Save';
  if (multiplierContainer) multiplierContainer.style.display = 'none';

  // Reset form
  const form = document.getElementById('fundForm') as HTMLFormElement;
  if (form) form.reset();

  // Reset auto-fill indicator
  removeGroupAutoFillIndicator();

  await populateFundNameDropdown();
  populateGroupDropdown('fundGroup');

  AppState.setFundModalUnsavedChanges(false);
  openModal('fundModal');
}

/**
 * Show edit fund modal
 */
export async function showEditFundModal(fundId: number): Promise<void> {
  const fund = await getFundById(fundId);
  if (!fund) {
    showStatus('Fund not found', 'error');
    return;
  }

  const modalTitle = document.getElementById('fundModalTitle');
  const fundIdInput = document.getElementById('fundId') as HTMLInputElement;
  const isDuplicateInput = document.getElementById('isDuplicate') as HTMLInputElement;
  const fundNameSelect = document.getElementById('fundName') as HTMLSelectElement;
  const accountNumberInput = document.getElementById('accountNumber') as HTMLInputElement;
  const fundGroupSelect = document.getElementById('fundGroup') as HTMLSelectElement;
  const commitmentInput = document.getElementById('commitment') as HTMLInputElement;
  const saveFundBtn = document.getElementById('saveFundBtn');
  const multiplierContainer = document.getElementById('duplicateMultiplierContainer');

  if (modalTitle) modalTitle.textContent = 'Edit Investment';
  if (fundIdInput) fundIdInput.value = fundId.toString();
  if (isDuplicateInput) isDuplicateInput.value = '';
  if (saveFundBtn) saveFundBtn.textContent = 'Save';
  if (multiplierContainer) multiplierContainer.style.display = 'none';

  // Reset auto-fill indicator (don't auto-fill when editing existing fund)
  removeGroupAutoFillIndicator();

  await populateFundNameDropdown();
  populateGroupDropdown('fundGroup');

  if (fundNameSelect) fundNameSelect.value = fund.fundName;
  if (accountNumberInput) accountNumberInput.value = fund.accountNumber;
  if (fundGroupSelect) fundGroupSelect.value = fund.groupId?.toString() || '';
  if (commitmentInput) commitmentInput.value = formatNumberWithCommas(fund.commitment);

  AppState.setFundModalUnsavedChanges(false);
  openModal('fundModal');
}

/**
 * Show duplicate fund modal
 */
export async function showDuplicateFundModal(fundId: number): Promise<void> {
  const fund = await getFundById(fundId);
  if (!fund) {
    showStatus('Fund not found', 'error');
    return;
  }

  const modalTitle = document.getElementById('fundModalTitle');
  const fundIdInput = document.getElementById('fundId') as HTMLInputElement;
  const isDuplicateInput = document.getElementById('isDuplicate') as HTMLInputElement;
  const fundNameSelect = document.getElementById('fundName') as HTMLSelectElement;
  const accountNumberInput = document.getElementById('accountNumber') as HTMLInputElement;
  const fundGroupSelect = document.getElementById('fundGroup') as HTMLSelectElement;
  const commitmentInput = document.getElementById('commitment') as HTMLInputElement;
  const duplicateMultiplierInput = document.getElementById('duplicateMultiplier') as HTMLInputElement;
  const saveFundBtn = document.getElementById('saveFundBtn');
  const multiplierContainer = document.getElementById('duplicateMultiplierContainer');

  if (modalTitle) modalTitle.textContent = 'Duplicate Investment';
  if (fundIdInput) fundIdInput.value = fundId.toString();
  if (isDuplicateInput) isDuplicateInput.value = 'true';
  if (saveFundBtn) saveFundBtn.textContent = 'Duplicate';
  if (multiplierContainer) multiplierContainer.style.display = 'block';
  if (duplicateMultiplierInput) duplicateMultiplierInput.value = '1';

  // Reset auto-fill indicator (will trigger auto-fill when user enters account number)
  removeGroupAutoFillIndicator();

  await populateFundNameDropdown();
  populateGroupDropdown('fundGroup');

  if (fundNameSelect) fundNameSelect.value = fund.fundName;
  if (accountNumberInput) accountNumberInput.value = '';
  if (fundGroupSelect) fundGroupSelect.value = fund.groupId?.toString() || '';
  if (commitmentInput) commitmentInput.value = formatNumberWithCommas(fund.commitment);

  AppState.setFundModalUnsavedChanges(false);
  openModal('fundModal');
}

/**
 * Save fund from modal form
 */
export async function saveFundFromModal(
  onSave: () => Promise<void>
): Promise<void> {
  const fundIdInput = document.getElementById('fundId') as HTMLInputElement;
  const isDuplicateInput = document.getElementById('isDuplicate') as HTMLInputElement;
  const fundNameSelect = document.getElementById('fundName') as HTMLSelectElement;
  const accountNumberInput = document.getElementById('accountNumber') as HTMLInputElement;
  const fundGroupSelect = document.getElementById('fundGroup') as HTMLSelectElement;
  const commitmentInput = document.getElementById('commitment') as HTMLInputElement;
  const duplicateMultiplierInput = document.getElementById('duplicateMultiplier') as HTMLInputElement;

  const fundName = fundNameSelect?.value || '';
  const accountNumber = accountNumberInput?.value?.trim() || '';
  const groupId = fundGroupSelect?.value ? parseInt(fundGroupSelect.value) : null;
  const commitment = parseCurrency(commitmentInput?.value || '0');
  const isDuplicate = isDuplicateInput?.value === 'true';
  const multiplier = parseFloat(duplicateMultiplierInput?.value || '1') || 1;

  // Validation
  if (!fundName || fundName === '__new__') {
    showStatus('Please select a fund name', 'error');
    return;
  }

  if (!accountNumber) {
    showStatus('Please enter an account number', 'error');
    return;
  }

  if (isNaN(commitment) || commitment <= 0) {
    showStatus('Please enter a valid commitment amount', 'error');
    return;
  }

  try {
    showLoading('Saving...');

    if (isDuplicate && fundIdInput?.value) {
      // Duplicate fund
      const originalFund = await getFundById(parseInt(fundIdInput.value));
      if (!originalFund) {
        showStatus('Original fund not found', 'error');
        hideLoading();
        return;
      }

      const newFund: Fund = {
        fundName,
        accountNumber,
        groupId,
        commitment: commitment * multiplier,
        cashFlows: originalFund.cashFlows.map((cf) => ({
          ...cf,
          amount: cf.amount * multiplier,
        })),
        monthlyNav: originalFund.monthlyNav.map((nav) => ({
          ...nav,
          amount: nav.amount * multiplier,
        })),
        timestamp: new Date().toISOString(),
      };

      await saveFundToDB(newFund);
      showStatus('Investment duplicated successfully');
    } else if (fundIdInput?.value) {
      // Update existing fund
      const existingFund = await getFundById(parseInt(fundIdInput.value));
      if (!existingFund) {
        showStatus('Fund not found', 'error');
        hideLoading();
        return;
      }

      const updatedFund: Fund = {
        ...existingFund,
        fundName,
        accountNumber,
        groupId,
        commitment,
        timestamp: new Date().toISOString(),
      };

      await saveFundToDB(updatedFund);
      showStatus('Investment updated successfully');
    } else {
      // Create new fund
      const newFund: Fund = {
        fundName,
        accountNumber,
        groupId,
        commitment,
        cashFlows: [],
        monthlyNav: [],
        timestamp: new Date().toISOString(),
      };

      await saveFundToDB(newFund);
      showStatus('Investment added successfully');
    }

    // Sync group across all investments with the same account number
    if (accountNumber) {
      const allFunds = await getAllFunds();
      const fundsWithSameAccount = allFunds.filter(
        (f) => f.accountNumber === accountNumber && f.groupId !== groupId
      );
      for (const fund of fundsWithSameAccount) {
        await saveFundToDB({ ...fund, groupId });
      }
    }

    AppState.setFundModalUnsavedChanges(false);
    closeModal('fundModal');
    AppState.clearMetricsCache();
    await onSave();
  } catch (err) {
    console.error('Error saving fund:', err);
    showStatus('Error saving investment: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Delete fund
 */
export async function deleteFund(
  fundId: number,
  onDelete: () => Promise<void>
): Promise<void> {
  const fund = await getFundById(fundId);
  if (!fund) {
    showStatus('Fund not found', 'error');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to delete "${fund.fundName}" (${fund.accountNumber})? This action cannot be undone.`,
    { title: 'Delete Investment', confirmText: 'Delete', cancelText: 'Cancel' }
  );

  if (!confirmed) return;

  try {
    showLoading('Deleting...');
    await deleteFundFromDB(fundId);
    AppState.clearMetricsCache();
    showStatus('Investment deleted successfully');
    await onDelete();
  } catch (err) {
    console.error('Error deleting fund:', err);
    showStatus('Error deleting investment: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

// ===========================
// Details Modal Operations
// ===========================

/**
 * Show details modal
 */
export async function showDetailsModal(
  fundId: number,
  _onSave: () => Promise<void>
): Promise<void> {
  const fund = await getFundById(fundId);
  if (!fund) {
    showStatus('Fund not found', 'error');
    return;
  }

  AppState.setCurrentDetailsFundId(fundId);

  const modalTitle = document.getElementById('detailsModalTitle');
  const modalSubtitle = document.getElementById('detailsModalSubtitle');
  const cashFlowsBody = document.querySelector('#cashFlowsTable tbody');
  const navBody = document.querySelector('#navTable tbody');

  if (modalTitle) modalTitle.textContent = fund.fundName;
  if (modalSubtitle) modalSubtitle.textContent = fund.accountNumber;

  // Update summary
  const metrics = calculateMetrics(fund);
  const setElement = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setElement('detailsSummaryCommitment', formatCurrency(fund.commitment));
  setElement('detailsSummaryContributions', formatCurrency(metrics.calledCapital));
  setElement('detailsSummaryDistributions', formatCurrency(metrics.distributions));
  setElement('detailsSummaryValue', formatCurrency(metrics.nav));
  setElement('detailsSummaryReturn', formatCurrency(metrics.investmentReturn || 0));
  setElement('detailsSummaryOutstanding', formatCurrency(metrics.outstandingCommitment));

  // Render cash flows
  if (cashFlowsBody) {
    cashFlowsBody.innerHTML = '';
    const sortedCashFlows = [...fund.cashFlows].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    sortedCashFlows.forEach((cf, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input type="date" value="${cf.date}" data-field="date" data-index="${index}"></td>
        <td class="number"><input type="text" value="${formatNumberWithCommas(parseCurrency(cf.amount) || 0)}" data-field="amount" data-index="${index}"></td>
        <td class="center">
          <select data-field="type" data-index="${index}">
            <option value="Contribution" ${cf.type === 'Contribution' ? 'selected' : ''}>Contribution</option>
            <option value="Distribution" ${cf.type === 'Distribution' ? 'selected' : ''}>Distribution</option>
            <option value="Adjustment" ${cf.type === 'Adjustment' ? 'selected' : ''}>Adjustment</option>
          </select>
        </td>
        <td class="center">
          <input type="checkbox" ${cf.affectsCommitment !== false ? 'checked' : ''} data-field="affectsCommitment" data-index="${index}">
        </td>
        <td>
          <button class="delete-row-btn" data-action="deleteCashFlow" data-index="${index}" title="Delete">×</button>
        </td>
      `;
      cashFlowsBody.appendChild(row);
    });
  }

  // Render NAV entries
  if (navBody) {
    navBody.innerHTML = '';
    const sortedNavs = [...fund.monthlyNav].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    sortedNavs.forEach((nav, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input type="date" value="${nav.date}" data-field="date" data-index="${index}"></td>
        <td><input type="text" value="${formatNumberWithCommas(parseCurrency(nav.amount) || 0)}" data-field="amount" data-index="${index}"></td>
        <td>
          <button class="delete-row-btn" data-action="deleteNav" data-index="${index}" title="Delete">×</button>
        </td>
      `;
      navBody.appendChild(row);
    });
  }

  AppState.setUnsavedChanges(false);
  openModal('detailsModal');
}

/**
 * Add cash flow row to details modal
 */
export function addCashFlowRow(): void {
  const tbody = document.querySelector('#cashFlowsTable tbody');
  if (!tbody) return;

  const index = tbody.querySelectorAll('tr').length;
  const today = new Date().toISOString().split('T')[0];

  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input type="date" value="${today}" data-field="date" data-index="${index}"></td>
    <td class="number"><input type="text" value="" placeholder="0" data-field="amount" data-index="${index}"></td>
    <td class="center">
      <select data-field="type" data-index="${index}">
        <option value="Contribution" selected>Contribution</option>
        <option value="Distribution">Distribution</option>
        <option value="Adjustment">Adjustment</option>
      </select>
    </td>
    <td class="center">
      <input type="checkbox" checked data-field="affectsCommitment" data-index="${index}">
    </td>
    <td>
      <button class="delete-row-btn" data-action="deleteCashFlow" data-index="${index}" title="Delete">×</button>
    </td>
  `;

  // Insert at the beginning
  tbody.insertBefore(row, tbody.firstChild);
  AppState.setUnsavedChanges(true);
}

/**
 * Add NAV row to details modal
 */
export function addNavRow(): void {
  const tbody = document.querySelector('#navTable tbody');
  if (!tbody) return;

  const index = tbody.querySelectorAll('tr').length;
  const today = new Date().toISOString().split('T')[0];

  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input type="date" value="${today}" data-field="date" data-index="${index}"></td>
    <td><input type="text" value="" placeholder="0" data-field="amount" data-index="${index}"></td>
    <td>
      <button class="delete-row-btn" data-action="deleteNav" data-index="${index}" title="Delete">×</button>
    </td>
  `;

  tbody.insertBefore(row, tbody.firstChild);
  AppState.setUnsavedChanges(true);
}

/**
 * Save details from modal
 */
export async function saveDetailsFromModal(
  onSave: () => Promise<void>
): Promise<void> {
  const detailsFundId = AppState.currentDetailsFundId;
  if (!detailsFundId) return;

  const fund = await getFundById(detailsFundId);
  if (!fund) {
    showStatus('Fund not found', 'error');
    return;
  }

  try {
    showLoading('Saving...');

    // Collect cash flows
    const cashFlowRows = document.querySelectorAll('#cashFlowsTable tbody tr');
    const cashFlows: CashFlow[] = [];

    cashFlowRows.forEach((row) => {
      const dateInput = row.querySelector('input[data-field="date"]') as HTMLInputElement;
      const amountInput = row.querySelector('input[data-field="amount"]') as HTMLInputElement;
      const typeSelect = row.querySelector('select[data-field="type"]') as HTMLSelectElement;
      const affectsCheckbox = row.querySelector(
        'input[data-field="affectsCommitment"]'
      ) as HTMLInputElement;

      const date = dateInput?.value || '';
      const amount = parseCurrency(amountInput?.value || '0');
      const type = (typeSelect?.value || 'Contribution') as CashFlow['type'];
      const affectsCommitment = affectsCheckbox?.checked ?? true;

      if (date && !isNaN(amount)) {
        cashFlows.push({ date, amount, type, affectsCommitment });
      }
    });

    // Collect NAV entries
    const navRows = document.querySelectorAll('#navTable tbody tr');
    const monthlyNav: Nav[] = [];

    navRows.forEach((row) => {
      const dateInput = row.querySelector('input[data-field="date"]') as HTMLInputElement;
      const amountInput = row.querySelector('input[data-field="amount"]') as HTMLInputElement;

      const date = dateInput?.value || '';
      const amount = parseCurrency(amountInput?.value || '0');

      if (date && !isNaN(amount)) {
        monthlyNav.push({ date, amount });
      }
    });

    // Update fund
    const updatedFund: Fund = {
      ...fund,
      cashFlows,
      monthlyNav,
      timestamp: new Date().toISOString(),
    };

    await saveFundToDB(updatedFund);
    AppState.clearMetricsCache();
    AppState.setUnsavedChanges(false);
    showStatus('Changes saved successfully');
    closeModal('detailsModal');
    await onSave();
  } catch (err) {
    console.error('Error saving details:', err);
    showStatus('Error saving changes: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

// ===========================
// State Accessors
// ===========================

export function getCurrentDetailsFundId(): number | null {
  return AppState.currentDetailsFundId;
}

export function setCurrentActionFundId(id: number | null): void {
  AppState.setCurrentActionFundId(id);
}

export function getCurrentActionFundId(): number | null {
  return AppState.currentActionFundId;
}
