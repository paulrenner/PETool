/**
 * Import functionality for the application
 */

import type { Fund, Group, FundNameData, CashFlow, Nav } from '../types';
import { CONFIG } from '../core/config';
import { AppState } from '../core/state';
import {
  getAllFunds,
  getAllGroups,
  saveFundToDB,
  saveGroup,
  saveFundName,
} from '../core/db';
import { parseCurrency } from '../utils/formatting';
import { escapeHtml } from '../utils/escaping';
import { validateFund } from '../utils/validation';
import { showStatus, showLoading, hideLoading, openModal, closeModal } from './modals';
import { getMultiSelectValues, setMultiSelectValues } from './filters';

// Import preview data storage
let pendingImportData: any = null;

/**
 * Safe JSON parse to prevent prototype pollution
 */
function safeJSONParse(text: string): any {
  const data = JSON.parse(text);
  return sanitizeObject(data);
}

/**
 * Recursively sanitize an object to prevent prototype pollution
 */
function sanitizeObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const clean: Record<string, any> = {};
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

  for (const key of Object.keys(obj)) {
    if (dangerousKeys.includes(key)) {
      console.warn(`Blocked potentially dangerous key: ${key}`);
      continue;
    }
    clean[key] = sanitizeObject(obj[key]);
  }

  return clean;
}

/**
 * Enrich import data by auto-filling groups based on account numbers
 */
async function enrichImportDataWithGroups(
  fundsToImport: any[]
): Promise<{ enrichedCount: number; ambiguousCount: number; ambiguousAccounts: string[] }> {
  const existingFunds = await getAllFunds();
  const accountToGroup = new Map<string, number[]>();

  // Build mapping of account numbers to group IDs
  existingFunds.forEach((fund) => {
    if (fund.groupId) {
      const key = fund.accountNumber.replace(/\s/g, '').toLowerCase();
      if (!accountToGroup.has(key)) {
        accountToGroup.set(key, []);
      }
      const groups = accountToGroup.get(key)!;
      if (!groups.includes(fund.groupId)) {
        groups.push(fund.groupId);
      }
    }
  });

  let enrichedCount = 0;
  let ambiguousCount = 0;
  const ambiguousAccounts: string[] = [];

  // Enrich funds without group assignments
  for (const fund of fundsToImport) {
    if (fund.groupId == null && fund.accountNumber) {
      const key = fund.accountNumber.replace(/\s/g, '').toLowerCase();
      const matchingGroups = accountToGroup.get(key);

      if (matchingGroups && matchingGroups.length === 1) {
        fund.groupId = matchingGroups[0];
        fund._groupAutoFilled = true;
        enrichedCount++;
      } else if (matchingGroups && matchingGroups.length > 1) {
        ambiguousCount++;
        if (!ambiguousAccounts.includes(fund.accountNumber)) {
          ambiguousAccounts.push(fund.accountNumber);
        }
      }
    }
  }

  return { enrichedCount, ambiguousCount, ambiguousAccounts };
}

/**
 * Show import preview modal
 */
export function showImportPreviewModal(): void {
  pendingImportData = null;
  const previewContent = document.getElementById('importPreviewContent');
  const applyBtn = document.getElementById('applyImportBtn') as HTMLButtonElement;
  const fileInput = document.getElementById('importPreviewFileInput') as HTMLInputElement;

  if (previewContent) {
    previewContent.innerHTML = '<p style="color: var(--color-text-light);">Select a JSON file to preview...</p>';
  }
  if (applyBtn) {
    applyBtn.disabled = true;
  }
  // Reset file input so selecting the same file again triggers the change event
  if (fileInput) {
    fileInput.value = '';
  }

  openModal('importPreviewModal');
}

/**
 * Handle import file selection for preview
 */
export async function handleImportFileSelect(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const previewContent = document.getElementById('importPreviewContent');
  const applyBtn = document.getElementById('applyImportBtn') as HTMLButtonElement;

  // Validate file size
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    if (previewContent) {
      previewContent.innerHTML = `<p style="color: var(--color-danger);">File too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB.</p>`;
    }
    input.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = safeJSONParse(text);
    pendingImportData = data;

    // Generate preview
    const fundsToImport = data.funds || data;
    const fundsCount = Array.isArray(fundsToImport) ? fundsToImport.length : 0;
    const groupsCount = data.groups?.length || 0;
    const fundNamesCount = data.fundNames?.length || 0;

    // Check for duplicates against existing data
    const existingFunds = await getAllFunds();
    const existingFundKeys = new Set<string>();
    existingFunds.forEach((f) => {
      const key = `${f.fundName}|${f.accountNumber}`.toLowerCase();
      existingFundKeys.add(key);
    });

    const duplicates: Array<{ fundName: string; accountNumber: string }> = [];
    const newFunds: Array<{ fundName: string; accountNumber: string }> = [];
    const seenInFileKeys = new Set<string>();

    if (Array.isArray(fundsToImport)) {
      for (const fund of fundsToImport) {
        // Normalize accountNumber (strip whitespace) to match how it's stored in DB
        const normalizedAccount = (fund.accountNumber || '').replace(/\s/g, '');
        const key = `${fund.fundName}|${normalizedAccount}`.toLowerCase();
        if (existingFundKeys.has(key) || seenInFileKeys.has(key)) {
          duplicates.push({ fundName: fund.fundName, accountNumber: fund.accountNumber });
        } else {
          newFunds.push({ fundName: fund.fundName, accountNumber: fund.accountNumber });
          seenInFileKeys.add(key); // Track duplicates within the same file
        }
      }
    }

    // Check for existing groups
    const existingGroups = await getAllGroups();
    const existingGroupNames = new Set(existingGroups.map((g) => g.name.toLowerCase()));
    let existingGroupsCount = 0;
    let newGroupsCount = 0;

    if (data.groups && Array.isArray(data.groups)) {
      for (const group of data.groups) {
        if (existingGroupNames.has(group.name.toLowerCase())) {
          existingGroupsCount++;
        } else {
          newGroupsCount++;
        }
      }
    }

    // Build preview HTML
    let previewHtml = `
      <div style="margin-bottom: 15px;">
        <strong>File:</strong> ${escapeHtml(file.name)}<br>
        <strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB
      </div>
      <div style="margin-bottom: 15px;">
        <strong>Contents:</strong>
        <ul style="margin: 10px 0 0 20px;">
          <li>${fundsCount} fund(s)</li>
          ${groupsCount > 0 ? `<li>${groupsCount} group(s)</li>` : ''}
          ${fundNamesCount > 0 ? `<li>${fundNamesCount} fund name(s)</li>` : ''}
        </ul>
      </div>
    `;

    // Show import analysis
    if (fundsCount > 0) {
      previewHtml += `
        <div style="margin-bottom: 15px; padding: 12px; background: var(--color-alt-bg); border-radius: var(--radius-sm);">
          <strong>Import Analysis:</strong>
          <ul style="margin: 10px 0 0 20px;">
            <li style="color: var(--color-success);">${newFunds.length} new fund(s) will be imported</li>
            ${duplicates.length > 0 ? `<li style="color: var(--color-warning);">${duplicates.length} duplicate(s) will be skipped</li>` : ''}
            ${newGroupsCount > 0 ? `<li style="color: var(--color-success);">${newGroupsCount} new group(s) will be created</li>` : ''}
            ${existingGroupsCount > 0 ? `<li style="color: var(--color-warning);">${existingGroupsCount} existing group(s) will be skipped</li>` : ''}
          </ul>
        </div>
      `;
    }

    // Show duplicates if any
    if (duplicates.length > 0) {
      previewHtml += `
        <div style="margin-bottom: 15px;">
          <strong style="color: var(--color-warning);">Duplicates to skip:</strong>
          <ul style="margin: 10px 0 0 20px; font-size: 0.9em; color: var(--color-warning);">
            ${duplicates.slice(0, 5).map((d) => `<li>${escapeHtml(d.fundName)} (${escapeHtml(d.accountNumber)})</li>`).join('')}
            ${duplicates.length > 5 ? `<li>... and ${duplicates.length - 5} more</li>` : ''}
          </ul>
        </div>
      `;
    }

    // Show sample new funds
    if (newFunds.length > 0) {
      previewHtml += `
        <div>
          <strong>New funds to import:</strong>
          <ul style="margin: 10px 0 0 20px; font-size: 0.9em;">
            ${newFunds.slice(0, 5).map((f) => `<li>${escapeHtml(f.fundName)} (${escapeHtml(f.accountNumber)})</li>`).join('')}
            ${newFunds.length > 5 ? `<li>... and ${newFunds.length - 5} more</li>` : ''}
          </ul>
        </div>
      `;
    }

    if (previewContent) {
      previewContent.innerHTML = previewHtml;
    }

    if (applyBtn) {
      // Only enable if there's something to import
      applyBtn.disabled = newFunds.length === 0 && newGroupsCount === 0 && fundNamesCount === 0;
    }
  } catch (err) {
    if (previewContent) {
      previewContent.innerHTML = `<p style="color: var(--color-danger);">Error reading file: ${(err as Error).message}</p>`;
    }
    pendingImportData = null;
    input.value = '';
  }
}

/**
 * Apply the pending import
 */
export async function applyImport(onComplete: () => Promise<void>): Promise<void> {
  if (!pendingImportData) {
    showStatus('No import data available', 'error');
    return;
  }

  closeModal('importPreviewModal');
  showLoading('Importing data...');

  try {
    const data = pendingImportData;
    let imported = 0;
    const oldGroupIdToNew: Record<number, number> = {};

    // Import groups first
    if (data.groups && Array.isArray(data.groups)) {
      if (data.groups.length > CONFIG.MAX_IMPORT_GROUPS) {
        throw new Error(`Too many groups (${data.groups.length}). Maximum allowed is ${CONFIG.MAX_IMPORT_GROUPS}.`);
      }

      // Validate and sort groups by hierarchy
      const groupIds = new Set(data.groups.map((g: any) => g.id));
      for (const group of data.groups) {
        if (group.parentGroupId != null) {
          if (!groupIds.has(group.parentGroupId)) {
            group.parentGroupId = null;
          }
          if (group.id === group.parentGroupId) {
            group.parentGroupId = null;
          }
        }
      }

      // Sort groups (parents before children)
      const sortedGroups: any[] = [];
      const addedIds = new Set<number>();
      let remainingGroups = [...data.groups];

      while (remainingGroups.length > 0) {
        const initialLength = remainingGroups.length;
        for (let i = remainingGroups.length - 1; i >= 0; i--) {
          const group = remainingGroups[i];
          if (group.parentGroupId == null || addedIds.has(group.parentGroupId)) {
            sortedGroups.push(group);
            addedIds.add(group.id);
            remainingGroups.splice(i, 1);
          }
        }
        if (remainingGroups.length === initialLength) {
          // Circular reference detected - log and set orphaned groups to root level
          console.warn(
            `Import: ${remainingGroups.length} group(s) had circular parent references and were moved to root level:`,
            remainingGroups.map((g) => g.name)
          );
          remainingGroups.forEach((g) => {
            g.parentGroupId = null;
            sortedGroups.push(g);
          });
          break;
        }
      }

      // Get existing groups
      const existingGroups = await getAllGroups();
      const existingGroupsByName: Record<string, Group> = {};
      existingGroups.forEach((g) => {
        existingGroupsByName[g.name.toLowerCase()] = g;
      });

      // Import groups
      for (const group of sortedGroups) {
        const oldId = group.id;
        const { id, ...groupData } = group;

        if (groupData.parentGroupId != null && oldGroupIdToNew[groupData.parentGroupId]) {
          groupData.parentGroupId = oldGroupIdToNew[groupData.parentGroupId];
        }

        const existingGroup = existingGroupsByName[groupData.name.toLowerCase()];
        if (existingGroup) {
          if (oldId != null) {
            oldGroupIdToNew[oldId] = existingGroup.id;
          }
        } else {
          const newId = await saveGroup(groupData);
          if (oldId != null && newId) {
            oldGroupIdToNew[oldId] = newId;
          }
          existingGroupsByName[groupData.name.toLowerCase()] = { ...groupData, id: newId } as Group;
        }
      }

      AppState.setGroups(await getAllGroups());
    }

    // Import fund names
    if (data.fundNames && Array.isArray(data.fundNames)) {
      if (data.fundNames.length > CONFIG.MAX_IMPORT_FUNDNAMES) {
        throw new Error(`Too many fund names (${data.fundNames.length}). Maximum allowed is ${CONFIG.MAX_IMPORT_FUNDNAMES}.`);
      }

      // Process all fund names first, then update AppState atomically
      const processedFundNames: FundNameData[] = [];
      for (const fundNameItem of data.fundNames) {
        const fundNameObj: FundNameData =
          typeof fundNameItem === 'string'
            ? { name: fundNameItem, tags: [], investmentTermStartDate: null, investmentTermYears: null }
            : {
                name: fundNameItem.name,
                tags: fundNameItem.tags || [],
                investmentTermStartDate: fundNameItem.investmentTermStartDate || fundNameItem.finalCloseDate || null,
                investmentTermYears: fundNameItem.investmentTermYears || null,
              };

        await saveFundName(fundNameObj);
        processedFundNames.push(fundNameObj);
      }

      // Update AppState only after all saves succeeded
      for (const fundNameObj of processedFundNames) {
        AppState.fundNames.add(fundNameObj.name);
        AppState.fundNameData.set(fundNameObj.name, fundNameObj);
      }
    }

    // Import funds
    const fundsToImport = data.funds || data;
    if (!Array.isArray(fundsToImport)) {
      throw new Error('Invalid format: expected array of funds');
    }

    if (fundsToImport.length > CONFIG.MAX_IMPORT_FUNDS) {
      throw new Error(`Too many funds (${fundsToImport.length}). Maximum allowed is ${CONFIG.MAX_IMPORT_FUNDS}.`);
    }

    // Collect unique fund names
    const uniqueFundNames = new Set<string>();
    fundsToImport.forEach((fund: any) => {
      if (fund.fundName && !AppState.fundNames.has(fund.fundName)) {
        uniqueFundNames.add(fund.fundName);
      }
    });

    for (const name of uniqueFundNames) {
      const fundNameObj: FundNameData = { name, tags: [], investmentTermStartDate: null, investmentTermYears: null };
      await saveFundName(fundNameObj);
      AppState.fundNames.add(name);
      AppState.fundNameData.set(name, fundNameObj);
    }

    // Enrich with group associations
    const enrichmentResult = await enrichImportDataWithGroups(fundsToImport);

    // Build duplicate detection set
    const existingFunds = await getAllFunds();
    const existingFundKeys = new Set<string>();
    existingFunds.forEach((f) => {
      const key = `${f.fundName}|${f.accountNumber}`.toLowerCase();
      existingFundKeys.add(key);
    });

    const skippedDuplicates: any[] = [];
    const failedImports: any[] = [];

    // Pre-validation pass: validate all funds before saving any
    // This prevents partial imports that leave inconsistent state
    const preValidationErrors: Array<{ index: number; name: string; errors: string[] }> = [];
    for (let i = 0; i < fundsToImport.length; i++) {
      const fund = fundsToImport[i];
      // Normalize accountNumber (strip whitespace) to match how it's stored in DB
      const normalizedAccount = (fund.accountNumber || '').replace(/\s/g, '');
      const importKey = `${fund.fundName}|${normalizedAccount}`.toLowerCase();

      // Skip duplicates in pre-validation (they'll be handled in main loop)
      if (existingFundKeys.has(importKey)) {
        continue;
      }

      // Build fund data for validation
      const cashFlows: CashFlow[] = (fund.cashFlows || []).map((cf: any) => ({
        date: cf.date,
        amount: parseCurrency(cf.amount),
        type: cf.type || (cf.amount < 0 ? 'Contribution' : 'Distribution'),
        affectsCommitment: cf.affectsCommitment !== undefined ? cf.affectsCommitment : true,
      }));

      const monthlyNav: Nav[] = (fund.monthlyNav || []).map((nav: any) => ({
        date: nav.date,
        amount: parseCurrency(nav.amount),
      }));

      const fundDataForValidation = {
        fundName: fund.fundName,
        accountNumber: (fund.accountNumber || '').replace(/\s/g, ''),
        commitment: parseCurrency(fund.commitment),
        cashFlows,
        monthlyNav,
      };

      const validationResult = validateFund(fundDataForValidation);
      if (!validationResult.valid) {
        preValidationErrors.push({
          index: i,
          name: fund.fundName || fund.accountNumber || `Fund ${i + 1}`,
          errors: validationResult.errors,
        });
      }
    }

    // If any funds fail validation, abort the entire import
    if (preValidationErrors.length > 0) {
      const errorSummary = preValidationErrors.slice(0, 5).map((e) =>
        `• ${e.name}: ${e.errors.slice(0, 2).join('; ')}`
      ).join('\n');
      const moreText = preValidationErrors.length > 5
        ? `\n...and ${preValidationErrors.length - 5} more`
        : '';
      throw new Error(
        `Import aborted: ${preValidationErrors.length} fund(s) failed validation.\n\n${errorSummary}${moreText}`
      );
    }

    for (let i = 0; i < fundsToImport.length; i++) {
      const fund = fundsToImport[i];
      // Normalize accountNumber (strip whitespace) to match how it's stored in DB
      const normalizedAccount = (fund.accountNumber || '').replace(/\s/g, '');
      const importKey = `${fund.fundName}|${normalizedAccount}`.toLowerCase();

      if (existingFundKeys.has(importKey)) {
        skippedDuplicates.push({ index: i, name: fund.fundName, account: fund.accountNumber });
        continue;
      }

      try {
        existingFundKeys.add(importKey);

        const cashFlows: CashFlow[] = (fund.cashFlows || []).map((cf: any) => ({
          date: cf.date,
          amount: parseCurrency(cf.amount),
          type: cf.type || (cf.amount < 0 ? 'Contribution' : 'Distribution'),
          affectsCommitment: cf.affectsCommitment !== undefined ? cf.affectsCommitment : true,
        }));

        const monthlyNav: Nav[] = (fund.monthlyNav || []).map((nav: any) => ({
          date: nav.date,
          amount: parseCurrency(nav.amount),
        }));

        let groupId = null;
        if (fund.groupId != null) {
          if (fund._groupAutoFilled) {
            groupId = fund.groupId;
          } else if (oldGroupIdToNew[fund.groupId]) {
            groupId = oldGroupIdToNew[fund.groupId];
          }
        }

        const fundData: Fund = {
          fundName: fund.fundName,
          accountNumber: (fund.accountNumber || '').replace(/\s/g, ''),
          groupId,
          commitment: parseCurrency(fund.commitment),
          cashFlows,
          monthlyNav,
          timestamp: fund.timestamp || new Date().toISOString(),
        };

        await saveFundToDB(fundData);
        imported++;
      } catch (fundErr) {
        console.error(`Error importing fund at index ${i}:`, fundErr);
        failedImports.push({ index: i, name: fund.fundName || fund.accountNumber || 'Unknown', error: (fundErr as Error).message });
      }
    }

    // Show result
    if (failedImports.length > 0 || skippedDuplicates.length > 0) {
      const messages: string[] = [];
      if (imported > 0) messages.push(`${imported} imported`);
      if (skippedDuplicates.length > 0) messages.push(`${skippedDuplicates.length} duplicates skipped`);
      if (failedImports.length > 0) messages.push(`${failedImports.length} failed`);
      if (enrichmentResult.enrichedCount > 0) messages.push(`${enrichmentResult.enrichedCount} groups auto-filled`);

      const status = failedImports.length > 0 ? 'error' : 'success';
      showStatus(`Import complete: ${messages.join(', ')}`, status);
    } else {
      let successMsg = `Successfully imported ${imported} fund(s)`;
      if (enrichmentResult.enrichedCount > 0) {
        successMsg += ` (${enrichmentResult.enrichedCount} groups auto-filled)`;
      }
      showStatus(successMsg);
    }

    pendingImportData = null;

    // Preserve current filter selections before refreshing
    const savedFilters = {
      fundFilter: getMultiSelectValues('fundFilter'),
      accountFilter: getMultiSelectValues('accountFilter'),
      groupFilter: getMultiSelectValues('groupFilter'),
      tagFilter: getMultiSelectValues('tagFilter'),
      vintageFilter: getMultiSelectValues('vintageFilter'),
    };

    await onComplete();

    // Restore filter selections after refresh
    setMultiSelectValues('fundFilter', savedFilters.fundFilter);
    setMultiSelectValues('accountFilter', savedFilters.accountFilter);
    setMultiSelectValues('groupFilter', savedFilters.groupFilter);
    setMultiSelectValues('tagFilter', savedFilters.tagFilter);
    setMultiSelectValues('vintageFilter', savedFilters.vintageFilter);
  } catch (err) {
    showStatus('Error importing data: ' + (err as Error).message, 'error');
    console.error('Error importing data:', err);
  } finally {
    hideLoading();
  }
}

/**
 * Load sample data
 */
export async function loadSampleData(onComplete: () => Promise<void>): Promise<void> {
  showLoading('Loading sample data...');

  try {
    // Sample groups
    const sampleGroups = [
      { name: 'Buyout Funds', parentGroupId: null, type: 'Strategy' },
      { name: 'Venture Capital', parentGroupId: null, type: 'Strategy' },
      { name: 'Real Estate', parentGroupId: null, type: 'Strategy' },
    ];

    const groupIdMap: Record<string, number> = {};
    for (const group of sampleGroups) {
      const newId = await saveGroup(group);
      groupIdMap[group.name] = newId;
    }
    AppState.setGroups(await getAllGroups());

    // Sample fund names
    const sampleFundNames: FundNameData[] = [
      { name: 'Apex Capital Partners', tags: ['Buyout', 'North America'], investmentTermStartDate: '2020-06-15', investmentTermYears: 10 },
      { name: 'Summit Growth Fund', tags: ['Growth', 'Technology'], investmentTermStartDate: '2021-03-01', investmentTermYears: 10 },
      { name: 'Horizon Ventures', tags: ['Venture', 'Early Stage'], investmentTermStartDate: '2022-01-10', investmentTermYears: 12 },
      { name: 'Metro Real Estate Partners', tags: ['Real Estate', 'Commercial'], investmentTermStartDate: '2019-09-01', investmentTermYears: 8 },
      { name: 'Blue Ocean Capital', tags: ['Buyout', 'Europe'], investmentTermStartDate: '2021-07-20', investmentTermYears: 10 },
    ];

    for (const fundNameObj of sampleFundNames) {
      await saveFundName(fundNameObj);
      AppState.fundNames.add(fundNameObj.name);
      AppState.fundNameData.set(fundNameObj.name, fundNameObj);
    }

    // Sample funds
    const sampleFunds: Fund[] = [
      {
        fundName: 'Apex Capital Partners',
        accountNumber: 'APEX-001',
        groupId: groupIdMap['Buyout Funds'] ?? null,
        commitment: 5000000,
        cashFlows: [
          { date: '2020-07-01', amount: -1250000, type: 'Contribution', affectsCommitment: true },
          { date: '2020-12-15', amount: -1000000, type: 'Contribution', affectsCommitment: true },
          { date: '2021-06-30', amount: -750000, type: 'Contribution', affectsCommitment: true },
          { date: '2022-03-15', amount: -500000, type: 'Contribution', affectsCommitment: true },
          { date: '2023-01-20', amount: 800000, type: 'Distribution', affectsCommitment: true },
          { date: '2023-09-10', amount: 1200000, type: 'Distribution', affectsCommitment: true },
        ],
        monthlyNav: [
          { date: '2021-12-31', amount: 3200000 },
          { date: '2022-12-31', amount: 3800000 },
          { date: '2023-12-31', amount: 4500000 },
        ],
        timestamp: new Date().toISOString(),
      },
      {
        fundName: 'Summit Growth Fund',
        accountNumber: 'SUMMIT-001',
        groupId: groupIdMap['Venture Capital'] ?? null,
        commitment: 2500000,
        cashFlows: [
          { date: '2021-04-01', amount: -625000, type: 'Contribution', affectsCommitment: true },
          { date: '2021-10-15', amount: -500000, type: 'Contribution', affectsCommitment: true },
          { date: '2022-06-30', amount: -375000, type: 'Contribution', affectsCommitment: true },
          { date: '2023-06-15', amount: 400000, type: 'Distribution', affectsCommitment: true },
        ],
        monthlyNav: [
          { date: '2022-12-31', amount: 1800000 },
          { date: '2023-12-31', amount: 2200000 },
        ],
        timestamp: new Date().toISOString(),
      },
      {
        fundName: 'Horizon Ventures',
        accountNumber: 'HV-001',
        groupId: groupIdMap['Venture Capital'] ?? null,
        commitment: 1000000,
        cashFlows: [
          { date: '2022-02-01', amount: -250000, type: 'Contribution', affectsCommitment: true },
          { date: '2022-08-15', amount: -200000, type: 'Contribution', affectsCommitment: true },
          { date: '2023-04-01', amount: -150000, type: 'Contribution', affectsCommitment: true },
        ],
        monthlyNav: [
          { date: '2022-12-31', amount: 520000 },
          { date: '2023-12-31', amount: 750000 },
        ],
        timestamp: new Date().toISOString(),
      },
      {
        fundName: 'Metro Real Estate Partners',
        accountNumber: 'METRO-001',
        groupId: groupIdMap['Real Estate'] ?? null,
        commitment: 3000000,
        cashFlows: [
          { date: '2019-10-01', amount: -750000, type: 'Contribution', affectsCommitment: true },
          { date: '2020-04-15', amount: -600000, type: 'Contribution', affectsCommitment: true },
          { date: '2020-12-01', amount: -450000, type: 'Contribution', affectsCommitment: true },
          { date: '2021-06-30', amount: -300000, type: 'Contribution', affectsCommitment: true },
          { date: '2022-03-15', amount: 500000, type: 'Distribution', affectsCommitment: true },
          { date: '2023-03-15', amount: 600000, type: 'Distribution', affectsCommitment: true },
        ],
        monthlyNav: [
          { date: '2021-12-31', amount: 2400000 },
          { date: '2022-12-31', amount: 2800000 },
          { date: '2023-12-31', amount: 3100000 },
        ],
        timestamp: new Date().toISOString(),
      },
      {
        fundName: 'Blue Ocean Capital',
        accountNumber: 'BOC-001',
        groupId: groupIdMap['Buyout Funds'] ?? null,
        commitment: 4000000,
        cashFlows: [
          { date: '2021-08-01', amount: -1000000, type: 'Contribution', affectsCommitment: true },
          { date: '2022-02-15', amount: -800000, type: 'Contribution', affectsCommitment: true },
          { date: '2022-09-01', amount: -600000, type: 'Contribution', affectsCommitment: true },
          { date: '2023-05-15', amount: 700000, type: 'Distribution', affectsCommitment: true },
        ],
        monthlyNav: [
          { date: '2022-12-31', amount: 2600000 },
          { date: '2023-12-31', amount: 3200000 },
        ],
        timestamp: new Date().toISOString(),
      },
    ];

    for (const fund of sampleFunds) {
      await saveFundToDB(fund);
    }

    AppState.clearMetricsCache();
    showStatus(`Successfully loaded ${sampleFunds.length} sample investments`);
    await onComplete();
  } catch (err) {
    showStatus('Error loading sample data: ' + (err as Error).message, 'error');
    console.error('Error loading sample data:', err);
  } finally {
    hideLoading();
  }
}
