/**
 * Fund names modal handlers - manage fund names and tags
 */

import type { FundNameData } from '../../types';
import { AppState } from '../../core/state';
import {
  getAllFunds,
  getAllFundNameObjects,
  saveFundToDB,
  saveFundName,
  deleteFundName,
} from '../../core/db';
import { escapeHtml, escapeAttribute } from '../../utils/escaping';
import { showStatus, showLoading, hideLoading, showConfirm, openModal, closeModal } from './common';
import { populateFundNameDropdown } from './fund-modal';

// ===========================
// Fund Name Management State
// ===========================

let currentEditTags: string[] = [];

/**
 * Reset module-level state when modal closes
 */
export function resetFundNamesModalState(): void {
  currentEditTags = [];
}

/**
 * Get all unique tags from existing fund names
 */
function getAllUniqueTags(): string[] {
  const allTags = new Set<string>();
  AppState.fundNameData.forEach((data) => {
    if (data.tags) {
      data.tags.forEach((tag) => allTags.add(tag));
    }
  });
  return [...allTags].sort();
}

// ===========================
// Manage Fund Names Modal
// ===========================

/**
 * Show manage funds modal
 */
export async function showManageFundsModal(): Promise<void> {
  const fundNamesList = document.getElementById('fundNamesList');
  if (!fundNamesList) return;

  const fundNameObjects = await getAllFundNameObjects();

  fundNamesList.innerHTML = '';
  fundNameObjects
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((obj) => {
      const item = document.createElement('div');
      item.className = 'fund-name-item';
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(obj.name)}</strong>
          ${obj.tags && obj.tags.length > 0 ? `<div class="fund-name-tags">${obj.tags.map((t) => `<span class="table-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div>
          <button class="btn-icon" data-action="editFundName" data-name="${escapeAttribute(obj.name)}" title="Edit">✎</button>
          <button class="btn-icon danger" data-action="deleteFundName" data-name="${escapeAttribute(obj.name)}" title="Delete">×</button>
        </div>
      `;
      fundNamesList.appendChild(item);
    });

  openModal('manageFundNamesModal');
}

// ===========================
// Edit Fund Name Modal
// ===========================

/**
 * Render tags in edit modal
 */
function renderEditTags(): void {
  const tagsContainer = document.getElementById('editFundTagsContainer');
  if (!tagsContainer) return;

  tagsContainer.innerHTML = '';
  currentEditTags.forEach((tag, index) => {
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.innerHTML = `${escapeHtml(tag)} <button type="button" class="tag-remove" data-index="${index}">&times;</button>`;
    tagsContainer.appendChild(tagEl);
  });
}

/**
 * Show edit fund name modal
 */
export function showEditFundNameModal(fundName: string): void {
  const fundNameData = AppState.fundNameData.get(fundName);
  if (!fundNameData) {
    showStatus('Fund not found', 'error');
    return;
  }

  currentEditTags = [...(fundNameData.tags || [])];

  const originalInput = document.getElementById('editFundNameOriginal') as HTMLInputElement;
  const nameInput = document.getElementById('editFundNameInput') as HTMLInputElement;
  const tagsDatalist = document.getElementById('editFundTagsDatalist');
  const termStartInput = document.getElementById('editFundTermStartDate') as HTMLInputElement;
  const termYearsInput = document.getElementById('editFundInvestmentTerm') as HTMLInputElement;

  if (originalInput) originalInput.value = fundName;
  if (nameInput) nameInput.value = fundName;
  if (termStartInput) termStartInput.value = fundNameData.investmentTermStartDate || '';
  if (termYearsInput) termYearsInput.value = fundNameData.investmentTermYears?.toString() || '';

  // Render tags
  renderEditTags();

  // Populate datalist with existing tags
  if (tagsDatalist) {
    tagsDatalist.innerHTML = '';
    getAllUniqueTags().forEach((tag) => {
      const option = document.createElement('option');
      option.value = tag;
      tagsDatalist.appendChild(option);
    });
  }

  openModal('editFundNameModal');
}

/**
 * Add tag to edit modal
 */
export function addEditTag(tag: string): void {
  const trimmedTag = tag.trim();
  if (trimmedTag && !currentEditTags.includes(trimmedTag)) {
    currentEditTags.push(trimmedTag);
    renderEditTags();
  }
}

/**
 * Remove tag from edit modal
 */
export function removeEditTag(index: number): void {
  currentEditTags.splice(index, 1);
  renderEditTags();
}

/**
 * Save edited fund name
 */
export async function saveEditedFundName(onSave: () => Promise<void>): Promise<void> {
  const originalInput = document.getElementById('editFundNameOriginal') as HTMLInputElement;
  const nameInput = document.getElementById('editFundNameInput') as HTMLInputElement;
  const termStartInput = document.getElementById('editFundTermStartDate') as HTMLInputElement;
  const termYearsInput = document.getElementById('editFundInvestmentTerm') as HTMLInputElement;

  const originalName = originalInput?.value;
  const newName = nameInput?.value?.trim();
  const termStartDate = termStartInput?.value || null;
  const termYears = termYearsInput?.value ? parseInt(termYearsInput.value) : null;

  if (!newName) {
    showStatus('Please enter a fund name', 'error');
    return;
  }

  if (newName !== originalName && AppState.fundNames.has(newName)) {
    showStatus('A fund with this name already exists', 'error');
    return;
  }

  try {
    showLoading('Saving...');

    // If name changed, update all funds with this name
    if (newName !== originalName && originalName) {
      const funds = await getAllFunds();
      for (const fund of funds) {
        if (fund.fundName === originalName) {
          await saveFundToDB({ ...fund, fundName: newName, timestamp: new Date().toISOString() });
        }
      }

      // Delete old fund name entry
      await deleteFundName(originalName);
      AppState.fundNames.delete(originalName);
      AppState.fundNameData.delete(originalName);
    }

    // Save fund name data
    const fundNameData: FundNameData = {
      name: newName,
      tags: currentEditTags,
      investmentTermStartDate: termStartDate,
      investmentTermYears: termYears,
    };

    await saveFundName(fundNameData);
    AppState.fundNames.add(newName);
    AppState.fundNameData.set(newName, fundNameData);

    resetFundNamesModalState();
    closeModal('editFundNameModal');
    showStatus('Fund updated successfully');

    // Refresh the manage funds modal if open
    await showManageFundsModal();
    await onSave();
  } catch (err) {
    console.error('Error saving fund name:', err);
    showStatus('Error saving fund: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Delete fund name
 */
export async function deleteFundNameByName(
  fundName: string,
  onDelete: () => Promise<void>
): Promise<void> {
  // Check if any funds use this name
  const funds = await getAllFunds();
  const fundsWithName = funds.filter((f) => f.fundName === fundName);

  if (fundsWithName.length > 0) {
    showStatus(`Cannot delete: ${fundsWithName.length} investment(s) use this fund name`, 'error');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to delete "${fundName}"? This action cannot be undone.`,
    { title: 'Delete Fund Name', confirmText: 'Delete', cancelText: 'Cancel' }
  );

  if (!confirmed) return;

  try {
    showLoading('Deleting...');
    await deleteFundName(fundName);
    AppState.fundNames.delete(fundName);
    AppState.fundNameData.delete(fundName);

    showStatus('Fund name deleted successfully');
    await showManageFundsModal();
    await onDelete();
  } catch (err) {
    console.error('Error deleting fund name:', err);
    showStatus('Error deleting fund name: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

// ===========================
// Add Fund Name Operations
// ===========================

/**
 * Add new fund name (from manage funds modal)
 */
export async function addNewFundNameFromModal(onComplete: () => Promise<void>): Promise<void> {
  const nameInput = document.getElementById('newFundNameInput') as HTMLInputElement;
  const termStartInput = document.getElementById('newFundTermStartDate') as HTMLInputElement;
  const termYearsInput = document.getElementById('newFundInvestmentTerm') as HTMLInputElement;

  const name = nameInput?.value?.trim();
  const termStartDate = termStartInput?.value || null;
  const termYears = termYearsInput?.value ? parseInt(termYearsInput.value) : null;

  if (!name) {
    showStatus('Please enter a fund name', 'error');
    return;
  }

  if (AppState.fundNames.has(name)) {
    showStatus('A fund with this name already exists', 'error');
    return;
  }

  try {
    showLoading('Adding...');

    const fundNameData: FundNameData = {
      name,
      tags: [],
      investmentTermStartDate: termStartDate,
      investmentTermYears: termYears,
    };

    await saveFundName(fundNameData);
    AppState.fundNames.add(name);
    AppState.fundNameData.set(name, fundNameData);

    // Clear form
    if (nameInput) nameInput.value = '';
    if (termStartInput) termStartInput.value = '';
    if (termYearsInput) termYearsInput.value = '';

    // Close details section
    const detailsEl = document.getElementById('newFundTermsDetails') as HTMLDetailsElement;
    if (detailsEl) detailsEl.open = false;

    showStatus('Fund name added successfully');
    await showManageFundsModal();
    await onComplete();
  } catch (err) {
    console.error('Error adding fund name:', err);
    showStatus('Error adding fund name: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Add new fund name inline (from fund modal)
 */
export async function addNewFundNameInline(): Promise<void> {
  const newNameInput = document.getElementById('newFundNameInline') as HTMLInputElement;
  const name = newNameInput?.value?.trim();

  if (!name) {
    showStatus('Please enter a fund name', 'error');
    return;
  }

  if (AppState.fundNames.has(name)) {
    showStatus('A fund with this name already exists', 'error');
    return;
  }

  try {
    const fundNameData: FundNameData = {
      name,
      tags: [],
      investmentTermStartDate: null,
      investmentTermYears: null,
    };

    await saveFundName(fundNameData);
    AppState.fundNames.add(name);
    AppState.fundNameData.set(name, fundNameData);

    // Update the fund name dropdown and select the new name
    await populateFundNameDropdown();
    const fundNameSelect = document.getElementById('fundName') as HTMLSelectElement;
    if (fundNameSelect) {
      fundNameSelect.value = name;
    }

    // Hide the new name container
    const container = document.getElementById('newFundNameContainer');
    if (container) container.style.display = 'none';
    if (newNameInput) newNameInput.value = '';

    showStatus('Fund name added successfully');
  } catch (err) {
    console.error('Error adding fund name:', err);
    showStatus('Error adding fund name: ' + (err as Error).message, 'error');
  }
}

/**
 * Cancel adding new fund name inline
 */
export function cancelNewFundNameInline(): void {
  const container = document.getElementById('newFundNameContainer');
  const input = document.getElementById('newFundNameInline') as HTMLInputElement;
  const fundNameSelect = document.getElementById('fundName') as HTMLSelectElement;

  if (container) container.style.display = 'none';
  if (input) input.value = '';
  if (fundNameSelect) fundNameSelect.value = '';
}
