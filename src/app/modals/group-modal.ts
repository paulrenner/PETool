/**
 * Group modal handlers - manage groups, sync account groups
 */

import type { Group } from '../../types';
import { AppState } from '../../core/state';
import {
  getAllFunds,
  getFundById,
  saveFundToDB,
  getAllGroups,
  saveGroup,
  deleteGroup,
} from '../../core/db';
import { escapeHtml } from '../../utils/escaping';
import { buildGroupsTree } from '../filters';
import { showStatus, showLoading, hideLoading, showConfirm, openModal, closeModal } from './common';
import { populateGroupDropdown } from './fund-modal';

// ===========================
// Group Management
// ===========================

/**
 * Show manage groups modal
 */
export async function showManageGroupsModal(): Promise<void> {
  const groupsList = document.getElementById('groupsList');
  if (!groupsList) return;

  const groups = await getAllGroups();
  AppState.setGroups(groups);

  populateGroupDropdown('newGroupParent');

  const tree = buildGroupsTree(groups, null);

  const renderGroup = (
    node: Group & { children: any[] },
    level: number
  ): string => {
    const indent = level * 20;
    let html = `
      <div class="group-item" style="margin-left: ${indent}px; padding: 10px; border-bottom: 1px solid var(--color-border);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${escapeHtml(node.name)}</strong>
            ${node.type ? `<span style="font-size: 0.85em; color: var(--color-text-light);"> (${escapeHtml(node.type)})</span>` : ''}
          </div>
          <div>
            <button class="btn-icon" data-action="editGroup" data-id="${node.id}" title="Edit">✎</button>
            <button class="btn-icon danger" data-action="deleteGroup" data-id="${node.id}" title="Delete">×</button>
          </div>
        </div>
      </div>
    `;

    if (node.children && node.children.length > 0) {
      node.children.forEach((child: Group & { children: any[] }) => {
        html += renderGroup(child, level + 1);
      });
    }

    return html;
  };

  groupsList.innerHTML = tree.map((node) => renderGroup(node, 0)).join('');

  openModal('manageGroupsModal');
}

/**
 * Save group
 */
export async function saveGroupFromModal(
  onSave: () => Promise<void>
): Promise<void> {
  const editGroupIdInput = document.getElementById('editGroupId') as HTMLInputElement;
  const nameInput = document.getElementById('newGroupName') as HTMLInputElement;
  const parentSelect = document.getElementById('newGroupParent') as HTMLSelectElement;
  const typeInput = document.getElementById('newGroupType') as HTMLInputElement;

  const name = nameInput?.value?.trim() || '';
  const parentGroupId = parentSelect?.value ? parseInt(parentSelect.value) : null;
  const type = typeInput?.value?.trim() || '';
  const editId = editGroupIdInput?.value ? parseInt(editGroupIdInput.value) : null;

  if (!name) {
    showStatus('Please enter a group name', 'error');
    return;
  }

  // Check for duplicate group names
  const existingGroups = AppState.getGroups();
  const duplicateName = existingGroups.find(
    (g) => g.name.toLowerCase() === name.toLowerCase() && g.id !== editId
  );
  if (duplicateName) {
    showStatus('A group with this name already exists', 'error');
    return;
  }

  try {
    showLoading('Saving...');

    // Build group data - omit id for new groups so IndexedDB auto-generates it
    const groupData: Omit<Group, 'id'> & { id?: number } = {
      name,
      parentGroupId,
      type: type || undefined,
    };

    if (editId) {
      groupData.id = editId;
    }

    await saveGroup(groupData);
    AppState.clearMetricsCache();
    showStatus(editId ? 'Group updated successfully' : 'Group added successfully');

    // Reset form
    if (nameInput) nameInput.value = '';
    if (typeInput) typeInput.value = '';
    if (parentSelect) parentSelect.value = '';
    if (editGroupIdInput) editGroupIdInput.value = '';

    // Refresh groups
    const groups = await getAllGroups();
    AppState.setGroups(groups);

    await showManageGroupsModal();
    await onSave();
  } catch (err) {
    console.error('Error saving group:', err);
    showStatus('Error saving group: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Delete group
 */
export async function deleteGroupById(
  groupId: number,
  onDelete: () => Promise<void>
): Promise<void> {
  const group = AppState.getGroupByIdSync(groupId);
  if (!group) {
    showStatus('Group not found', 'error');
    return;
  }

  const confirmed = await showConfirm(
    `Are you sure you want to delete "${group.name}"? Funds in this group will become ungrouped.`,
    { title: 'Delete Group', confirmText: 'Delete', cancelText: 'Cancel' }
  );

  if (!confirmed) return;

  try {
    showLoading('Deleting...');
    await deleteGroup(groupId);

    // Update funds that were in this group
    const funds = await getAllFunds();
    for (const fund of funds) {
      if (fund.groupId === groupId) {
        await saveFundToDB({ ...fund, groupId: null });
      }
    }

    // Refresh groups
    const groups = await getAllGroups();
    AppState.setGroups(groups);

    showStatus('Group deleted successfully');
    await showManageGroupsModal();
    await onDelete();
  } catch (err) {
    console.error('Error deleting group:', err);
    showStatus('Error deleting group: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}

// ===========================
// Sync Account Groups
// ===========================

interface AccountGroupInconsistency {
  accountNumber: string;
  funds: Array<{ id: number; fundName: string; groupId: number | null; groupName: string }>;
  suggestedGroupId: number | null;
  suggestedGroupName: string;
}

let pendingSyncData: AccountGroupInconsistency[] = [];

/**
 * Analyze account numbers for group inconsistencies
 */
async function analyzeAccountGroupInconsistencies(): Promise<AccountGroupInconsistency[]> {
  const funds = await getAllFunds();
  const groups = await getAllGroups();
  const groupMap = new Map<number, string>();
  groups.forEach((g) => groupMap.set(g.id!, g.name));

  // Group funds by account number
  const accountFunds = new Map<string, typeof funds>();
  for (const fund of funds) {
    if (!fund.accountNumber) continue;
    if (!accountFunds.has(fund.accountNumber)) {
      accountFunds.set(fund.accountNumber, []);
    }
    accountFunds.get(fund.accountNumber)!.push(fund);
  }

  const inconsistencies: AccountGroupInconsistency[] = [];

  for (const [accountNumber, fundsForAccount] of accountFunds) {
    // Check if all funds have the same groupId
    const groupIds = new Set(fundsForAccount.map((f) => f.groupId));
    if (groupIds.size <= 1) continue; // All consistent

    // Find the most common groupId (excluding null if possible)
    const groupCounts = new Map<number | null, number>();
    for (const fund of fundsForAccount) {
      groupCounts.set(fund.groupId, (groupCounts.get(fund.groupId) || 0) + 1);
    }

    // Prefer non-null groups, then most common
    let suggestedGroupId: number | null = null;
    let maxCount = 0;
    for (const [gid, count] of groupCounts) {
      if (gid !== null && (suggestedGroupId === null || count > maxCount)) {
        suggestedGroupId = gid;
        maxCount = count;
      }
    }

    inconsistencies.push({
      accountNumber,
      funds: fundsForAccount.map((f) => ({
        id: f.id!,
        fundName: f.fundName,
        groupId: f.groupId,
        groupName: f.groupId ? groupMap.get(f.groupId) || 'Unknown' : 'None',
      })),
      suggestedGroupId,
      suggestedGroupName: suggestedGroupId ? groupMap.get(suggestedGroupId) || 'Unknown' : 'None',
    });
  }

  return inconsistencies;
}

/**
 * Show the sync account groups modal
 */
export async function showSyncAccountGroupsModal(): Promise<void> {
  const content = document.getElementById('syncAccountGroupsContent');
  const applyBtn = document.getElementById('applySyncAccountGroupsBtn') as HTMLButtonElement;

  if (!content || !applyBtn) return;

  content.innerHTML = '<p style="color: var(--color-text-light);">Analyzing account groups...</p>';
  applyBtn.disabled = true;
  openModal('syncAccountGroupsModal');

  pendingSyncData = await analyzeAccountGroupInconsistencies();

  if (pendingSyncData.length === 0) {
    content.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--color-success);">
        <p style="font-size: 16px; margin-bottom: 8px;">&#10003; All account numbers have consistent group assignments.</p>
        <p style="color: var(--color-text-light); font-size: 14px;">No sync needed.</p>
      </div>
    `;
    applyBtn.disabled = true;
    return;
  }

  let html = `
    <p style="margin-bottom: 16px; color: var(--color-warning);">
      Found <strong>${pendingSyncData.length}</strong> account number${pendingSyncData.length > 1 ? 's' : ''} with inconsistent group assignments.
    </p>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="background: var(--color-alt-bg);">
          <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--color-border);">Account #</th>
          <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--color-border);">Current Groups</th>
          <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--color-border);">Sync To</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const item of pendingSyncData) {
    const currentGroups = [...new Set(item.funds.map((f) => f.groupName))].join(', ');
    html += `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid var(--color-border);">${escapeHtml(item.accountNumber)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid var(--color-border);">${escapeHtml(currentGroups)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid var(--color-border); color: var(--color-action); font-weight: 500;">${escapeHtml(item.suggestedGroupName)}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  content.innerHTML = html;
  applyBtn.disabled = false;
}

/**
 * Apply the account group sync
 */
export async function applySyncAccountGroups(onComplete: () => Promise<void>): Promise<void> {
  if (pendingSyncData.length === 0) {
    showStatus('No sync needed');
    closeModal('syncAccountGroupsModal');
    return;
  }

  try {
    showLoading('Syncing account groups...');

    let updatedCount = 0;
    for (const item of pendingSyncData) {
      for (const fund of item.funds) {
        if (fund.groupId !== item.suggestedGroupId) {
          const fullFund = await getFundById(fund.id);
          if (fullFund) {
            await saveFundToDB({ ...fullFund, groupId: item.suggestedGroupId });
            updatedCount++;
          }
        }
      }
    }

    pendingSyncData = [];
    AppState.clearMetricsCache();
    closeModal('syncAccountGroupsModal');
    showStatus(`Synced groups for ${updatedCount} investment${updatedCount !== 1 ? 's' : ''}`);
    await onComplete();
  } catch (err) {
    console.error('Error syncing account groups:', err);
    showStatus('Error syncing account groups: ' + (err as Error).message, 'error');
  } finally {
    hideLoading();
  }
}
