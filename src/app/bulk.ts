/**
 * Bulk operations for the application
 */

import type { Fund } from '../types';
import { AppState } from '../core/state';
import {
  getAllFunds,
  getAllFundNameObjects,
  saveFundToDB,
  deleteFundFromDB,
} from '../core/db';
import { escapeHtml } from '../utils/escaping';
import { formatCurrency, formatNumberWithCommas, parseCurrency } from '../utils/formatting';
import {
  showStatus,
  showLoading,
  hideLoading,
  openModal,
  closeModal,
  populateGroupDropdown,
} from './modals';

/**
 * Populate fund name dropdown for bulk operations
 */
async function populateBulkFundNameDropdown(selectId: string): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;

  const fundNameObjects = await getAllFundNameObjects();
  const fundNames = fundNameObjects.map((obj) => obj.name).sort();

  select.innerHTML = '<option value="">Select a fund</option>';
  fundNames.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

/**
 * Populate account dropdown for bulk operations
 */
async function populateAccountDropdown(selectId: string): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;

  const funds = await getAllFunds();
  const accounts = [...new Set(funds.map((f) => f.accountNumber))].sort();

  select.innerHTML = '<option value="">Select an account</option>';
  accounts.forEach((account) => {
    const option = document.createElement('option');
    option.value = account;
    option.textContent = account;
    select.appendChild(option);
  });
}

// ===========================
// Bulk Cash Flow
// ===========================

/**
 * Update the total amount displayed in the bulk cash flow preview
 * when user edits individual amounts
 */
function updateBulkCashFlowTotal(): void {
  const inputs = document.querySelectorAll('.bulk-amount-input') as NodeListOf<HTMLInputElement>;
  let total = 0;
  inputs.forEach(input => {
    const amount = parseCurrency(input.value) || 0;
    total += amount;
  });
  const totalEl = document.getElementById('bulkCashFlowTotalAmount');
  if (totalEl) {
    totalEl.textContent = formatCurrency(total, true);
  }
}

export async function showBulkCashFlowModal(): Promise<void> {
  await populateBulkFundNameDropdown('bulkCashFlowFundName');

  // Reset form
  const dateInput = document.getElementById('bulkCashFlowDate') as HTMLInputElement;
  const typeSelect = document.getElementById('bulkCashFlowType') as HTMLSelectElement;
  const percentInput = document.getElementById('bulkCashFlowPercentage') as HTMLInputElement;
  const affectsCheckbox = document.getElementById('bulkCashFlowAffectsCommitment') as HTMLInputElement;
  const preview = document.getElementById('bulkCashFlowPreview');
  const applyBtn = document.getElementById('applyBulkCashFlowBtn') as HTMLButtonElement;

  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0] || '';
  if (typeSelect) typeSelect.value = 'Contribution';
  if (percentInput) percentInput.value = '';
  if (affectsCheckbox) affectsCheckbox.checked = true;
  if (preview) preview.classList.remove('show');
  if (applyBtn) applyBtn.disabled = true;

  openModal('bulkCashFlowModal');
}

export async function previewBulkCashFlow(): Promise<void> {
  const fundNameSelect = document.getElementById('bulkCashFlowFundName') as HTMLSelectElement;
  const percentInput = document.getElementById('bulkCashFlowPercentage') as HTMLInputElement;
  const typeSelect = document.getElementById('bulkCashFlowType') as HTMLSelectElement;
  const preview = document.getElementById('bulkCashFlowPreview');
  const previewContent = document.getElementById('bulkCashFlowPreviewContent');
  const applyBtn = document.getElementById('applyBulkCashFlowBtn') as HTMLButtonElement;

  const fundName = fundNameSelect?.value;
  const percentage = parseFloat(percentInput?.value || '0');
  const type = typeSelect?.value || 'Contribution';

  if (!fundName) {
    showStatus('Please select a fund', 'error');
    return;
  }

  if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
    showStatus('Please enter a valid percentage (0.01 - 100)', 'error');
    return;
  }

  const funds = await getAllFunds();
  const matchingFunds = funds.filter((f) => f.fundName === fundName);

  if (matchingFunds.length === 0) {
    showStatus('No investments found for this fund', 'error');
    return;
  }

  // Generate preview with editable amount inputs
  let html = '<table style="width: 100%; font-size: 0.9em;"><thead><tr><th>Account</th><th style="text-align: right;">Commitment</th><th style="text-align: right;">Amount</th></tr></thead><tbody>';

  let totalAmount = 0;
  matchingFunds.forEach((fund) => {
    const amount = fund.commitment * (percentage / 100);
    totalAmount += amount;
    const displayAmount = type === 'Contribution' ? -amount : amount;
    html += `<tr data-fund-id="${fund.id}">
      <td>${escapeHtml(fund.accountNumber)}</td>
      <td style="text-align: right;">${formatCurrency(fund.commitment, true)}</td>
      <td style="text-align: right;">
        <input type="text" class="bulk-amount-input"
               value="${formatNumberWithCommas(displayAmount, 2)}"
               data-fund-id="${fund.id}"
               style="width: 120px; text-align: right; border: 1px solid var(--color-border); padding: 2px 4px; font-size: inherit; background: var(--color-bg); color: var(--color-text);">
      </td>
    </tr>`;
  });

  const displayTotal = type === 'Contribution' ? -totalAmount : totalAmount;
  html += `</tbody><tfoot><tr style="font-weight: bold;"><td>Total (${matchingFunds.length} investors)</td><td></td><td id="bulkCashFlowTotalAmount" style="text-align: right;">${formatCurrency(displayTotal, true)}</td></tr></tfoot></table>`;

  if (previewContent) {
    previewContent.innerHTML = html;

    // Use event delegation on the container to avoid listener accumulation
    // Only set up the delegated listener once
    if (!(previewContent as any)._bulkInputDelegationSetup) {
      (previewContent as any)._bulkInputDelegationSetup = true;
      previewContent.addEventListener('input', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('bulk-amount-input')) {
          updateBulkCashFlowTotal();
        }
      });
    }
  }
  if (preview) preview.classList.add('show');
  if (applyBtn) applyBtn.disabled = false;
}

export async function applyBulkCashFlow(onComplete: () => Promise<void>): Promise<void> {
  const fundNameSelect = document.getElementById('bulkCashFlowFundName') as HTMLSelectElement;
  const dateInput = document.getElementById('bulkCashFlowDate') as HTMLInputElement;
  const typeSelect = document.getElementById('bulkCashFlowType') as HTMLSelectElement;
  const percentInput = document.getElementById('bulkCashFlowPercentage') as HTMLInputElement;
  const affectsCheckbox = document.getElementById('bulkCashFlowAffectsCommitment') as HTMLInputElement;

  const fundName = fundNameSelect?.value;
  const date = dateInput?.value;
  const type = (typeSelect?.value || 'Contribution') as 'Contribution' | 'Distribution' | 'Adjustment';
  const percentage = parseFloat(percentInput?.value || '0');
  const affectsCommitment = affectsCheckbox?.checked ?? true;

  if (!fundName || !date || isNaN(percentage)) {
    showStatus('Missing required fields', 'error');
    return;
  }

  closeModal('bulkCashFlowModal');
  showLoading('Applying bulk cash flow...');

  try {
    // Build map of fund ID to edited amount from the preview inputs
    const amountInputs = document.querySelectorAll('.bulk-amount-input') as NodeListOf<HTMLInputElement>;
    const editedAmounts = new Map<number, number>();
    amountInputs.forEach(input => {
      const fundId = parseInt(input.dataset.fundId || '0', 10);
      const amount = parseCurrency(input.value) || 0;
      if (fundId) {
        editedAmounts.set(fundId, amount);
      }
    });

    const funds = await getAllFunds();
    const matchingFunds = funds.filter((f) => f.fundName === fundName);

    // Parallelize database writes for better performance
    const savePromises = matchingFunds.map((fund) => {
      // Use edited amount if available, otherwise calculate from percentage
      let amount: number;
      if (fund.id && editedAmounts.has(fund.id)) {
        amount = editedAmounts.get(fund.id)!;
      } else {
        const rawAmount = fund.commitment * (percentage / 100);
        amount = type === 'Contribution' ? -rawAmount : rawAmount;
      }

      const updatedFund: Fund = {
        ...fund,
        cashFlows: [
          ...fund.cashFlows,
          { date, amount, type, affectsCommitment },
        ],
        timestamp: new Date().toISOString(),
      };

      return saveFundToDB(updatedFund);
    });

    const results = await Promise.allSettled(savePromises);
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    AppState.clearMetricsCache();
    if (failed > 0) {
      showStatus(`Added cash flow to ${succeeded} investment(s), ${failed} failed`, 'warning');
    } else {
      showStatus(`Successfully added cash flow to ${succeeded} investment(s)`);
    }
    await onComplete();
  } catch (err) {
    showStatus('Error applying bulk cash flow: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

// ===========================
// Bulk Remove Fund
// ===========================

export async function showBulkRemoveFundModal(): Promise<void> {
  await populateBulkFundNameDropdown('bulkRemoveFundName');

  const preview = document.getElementById('bulkRemoveFundPreview');
  const applyBtn = document.getElementById('applyBulkRemoveFundBtn') as HTMLButtonElement;

  if (preview) preview.classList.remove('show');
  if (applyBtn) applyBtn.disabled = true;

  openModal('bulkRemoveFundModal');
}

export async function previewBulkRemoveFund(): Promise<void> {
  const fundNameSelect = document.getElementById('bulkRemoveFundName') as HTMLSelectElement;
  const preview = document.getElementById('bulkRemoveFundPreview');
  const previewContent = document.getElementById('bulkRemoveFundPreviewContent');
  const applyBtn = document.getElementById('applyBulkRemoveFundBtn') as HTMLButtonElement;

  const fundName = fundNameSelect?.value;

  if (!fundName) {
    showStatus('Please select a fund', 'error');
    return;
  }

  const funds = await getAllFunds();
  const matchingFunds = funds.filter((f) => f.fundName === fundName);

  if (matchingFunds.length === 0) {
    showStatus('No investments found for this fund', 'error');
    return;
  }

  let html = '<ul style="margin: 0; padding-left: 20px;">';
  matchingFunds.forEach((fund) => {
    html += `<li>${escapeHtml(fund.accountNumber)} - ${formatCurrency(fund.commitment)}</li>`;
  });
  html += '</ul>';
  html += `<p style="margin-top: 10px; font-weight: bold; color: var(--color-danger);">Total: ${matchingFunds.length} investment(s) will be permanently deleted.</p>`;

  if (previewContent) previewContent.innerHTML = html;
  if (preview) preview.classList.add('show');
  if (applyBtn) applyBtn.disabled = false;
}

export async function applyBulkRemoveFund(onComplete: () => Promise<void>): Promise<void> {
  const fundNameSelect = document.getElementById('bulkRemoveFundName') as HTMLSelectElement;
  const fundName = fundNameSelect?.value;

  if (!fundName) {
    showStatus('Please select a fund', 'error');
    return;
  }

  closeModal('bulkRemoveFundModal');
  showLoading('Removing investments...');

  try {
    const funds = await getAllFunds();
    const matchingFunds = funds.filter((f) => f.fundName === fundName);

    // Parallelize database deletes for better performance
    const deletePromises = matchingFunds
      .filter((fund) => fund.id)
      .map((fund) => deleteFundFromDB(fund.id!));

    const results = await Promise.allSettled(deletePromises);
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    AppState.clearMetricsCache();
    if (failed > 0) {
      showStatus(`Removed ${succeeded} investment(s), ${failed} failed`, 'warning');
    } else {
      showStatus(`Successfully removed ${succeeded} investment(s)`);
    }
    await onComplete();
  } catch (err) {
    showStatus('Error removing investments: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

// ===========================
// Bulk Assign Group
// ===========================

export async function showBulkAssignGroupModal(): Promise<void> {
  await populateAccountDropdown('bulkAssignGroupAccount');
  populateGroupDropdown('bulkAssignGroupTarget');

  const preview = document.getElementById('bulkAssignGroupPreview');
  const applyBtn = document.getElementById('applyBulkAssignGroupBtn') as HTMLButtonElement;

  if (preview) preview.classList.remove('show');
  if (applyBtn) applyBtn.disabled = true;

  openModal('bulkAssignGroupModal');
}

export async function previewBulkAssignGroup(): Promise<void> {
  const accountSelect = document.getElementById('bulkAssignGroupAccount') as HTMLSelectElement;
  const groupSelect = document.getElementById('bulkAssignGroupTarget') as HTMLSelectElement;
  const preview = document.getElementById('bulkAssignGroupPreview');
  const previewContent = document.getElementById('bulkAssignGroupPreviewContent');
  const applyBtn = document.getElementById('applyBulkAssignGroupBtn') as HTMLButtonElement;

  const accountNumber = accountSelect?.value;
  const groupId = groupSelect?.value ? parseInt(groupSelect.value, 10) : null;

  if (!accountNumber) {
    showStatus('Please select an account', 'error');
    return;
  }

  const funds = await getAllFunds();
  const matchingFunds = funds.filter((f) => f.accountNumber === accountNumber);

  if (matchingFunds.length === 0) {
    showStatus('No investments found for this account', 'error');
    return;
  }

  const groupName = groupId ? AppState.getGroupByIdSync(groupId)?.name || 'Unknown' : 'No Group';

  let html = '<ul style="margin: 0; padding-left: 20px;">';
  matchingFunds.forEach((fund) => {
    html += `<li>${escapeHtml(fund.fundName)}</li>`;
  });
  html += '</ul>';
  html += `<p style="margin-top: 10px;">These ${matchingFunds.length} investment(s) will be assigned to: <strong>${escapeHtml(groupName)}</strong></p>`;

  if (previewContent) previewContent.innerHTML = html;
  if (preview) preview.classList.add('show');
  if (applyBtn) applyBtn.disabled = false;
}

export async function applyBulkAssignGroup(onComplete: () => Promise<void>): Promise<void> {
  const accountSelect = document.getElementById('bulkAssignGroupAccount') as HTMLSelectElement;
  const groupSelect = document.getElementById('bulkAssignGroupTarget') as HTMLSelectElement;

  const accountNumber = accountSelect?.value;
  const groupId = groupSelect?.value ? parseInt(groupSelect.value, 10) : null;

  if (!accountNumber) {
    showStatus('Please select an account', 'error');
    return;
  }

  closeModal('bulkAssignGroupModal');
  showLoading('Assigning group...');

  try {
    const funds = await getAllFunds();
    const matchingFunds = funds.filter((f) => f.accountNumber === accountNumber);

    // Parallelize database writes for better performance
    const savePromises = matchingFunds.map((fund) => {
      const updatedFund: Fund = {
        ...fund,
        groupId,
        timestamp: new Date().toISOString(),
      };

      return saveFundToDB(updatedFund);
    });

    const results = await Promise.allSettled(savePromises);
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    AppState.clearMetricsCache();
    if (failed > 0) {
      showStatus(`Updated ${succeeded} investment(s), ${failed} failed`, 'warning');
    } else {
      showStatus(`Successfully updated ${succeeded} investment(s)`);
    }
    await onComplete();
  } catch (err) {
    showStatus('Error assigning group: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

// ===========================
// Event Handler Setup
// ===========================

export function initBulkOperationListeners(renderTable: () => Promise<void>): void {
  // Bulk Cash Flow Modal
  const closeBulkCashFlowModalBtn = document.getElementById('closeBulkCashFlowModalBtn');
  const cancelBulkCashFlowBtn = document.getElementById('cancelBulkCashFlowBtn');
  const previewBulkCashFlowBtn = document.getElementById('previewBulkCashFlowBtn');
  const applyBulkCashFlowBtn = document.getElementById('applyBulkCashFlowBtn');

  [closeBulkCashFlowModalBtn, cancelBulkCashFlowBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => closeModal('bulkCashFlowModal'));
    }
  });

  if (previewBulkCashFlowBtn) {
    previewBulkCashFlowBtn.addEventListener('click', previewBulkCashFlow);
  }

  if (applyBulkCashFlowBtn) {
    applyBulkCashFlowBtn.addEventListener('click', () => applyBulkCashFlow(renderTable));
  }

  // Bulk Remove Fund Modal
  const closeBulkRemoveFundModalBtn = document.getElementById('closeBulkRemoveFundModalBtn');
  const cancelBulkRemoveFundBtn = document.getElementById('cancelBulkRemoveFundBtn');
  const previewBulkRemoveFundBtn = document.getElementById('previewBulkRemoveFundBtn');
  const applyBulkRemoveFundBtn = document.getElementById('applyBulkRemoveFundBtn');

  [closeBulkRemoveFundModalBtn, cancelBulkRemoveFundBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => closeModal('bulkRemoveFundModal'));
    }
  });

  if (previewBulkRemoveFundBtn) {
    previewBulkRemoveFundBtn.addEventListener('click', previewBulkRemoveFund);
  }

  if (applyBulkRemoveFundBtn) {
    applyBulkRemoveFundBtn.addEventListener('click', () => applyBulkRemoveFund(renderTable));
  }

  // Bulk Assign Group Modal
  const closeBulkAssignGroupModalBtn = document.getElementById('closeBulkAssignGroupModalBtn');
  const cancelBulkAssignGroupBtn = document.getElementById('cancelBulkAssignGroupBtn');
  const previewBulkAssignGroupBtn = document.getElementById('previewBulkAssignGroupBtn');
  const applyBulkAssignGroupBtn = document.getElementById('applyBulkAssignGroupBtn');

  [closeBulkAssignGroupModalBtn, cancelBulkAssignGroupBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => closeModal('bulkAssignGroupModal'));
    }
  });

  if (previewBulkAssignGroupBtn) {
    previewBulkAssignGroupBtn.addEventListener('click', previewBulkAssignGroup);
  }

  if (applyBulkAssignGroupBtn) {
    applyBulkAssignGroupBtn.addEventListener('click', () => applyBulkAssignGroup(renderTable));
  }
}
