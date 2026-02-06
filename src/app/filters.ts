/**
 * Filter handling module
 */

import type { Fund, Group } from '../types';
import { AppState } from '../core/state';
import { getVintageYear } from '../calculations/metrics';
import { escapeHtml } from '../utils/escaping';

/**
 * Get the most recent quarter-end date as a YYYY-MM-DD string
 * Quarter-ends are: March 31, June 30, September 30, December 31
 */
function getDefaultCutoffDateString(): string {
  const today = new Date();
  const year = today.getFullYear();

  const quarterEnds = [
    new Date(year, 2, 31),  // March 31
    new Date(year, 5, 30),  // June 30
    new Date(year, 8, 30),  // September 30
    new Date(year, 11, 31), // December 31
  ];

  let quarterEnd = new Date(year - 1, 11, 31); // Default to last year's Q4
  for (let i = quarterEnds.length - 1; i >= 0; i--) {
    if (quarterEnds[i]! <= today) {
      quarterEnd = quarterEnds[i]!;
      break;
    }
  }

  const y = quarterEnd.getFullYear();
  const m = String(quarterEnd.getMonth() + 1).padStart(2, '0');
  const d = String(quarterEnd.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get selected values from a multi-select dropdown
 */
export function getMultiSelectValues(id: string): string[] {
  const container = document.getElementById(id);
  if (!container) return [];
  const selected = container.querySelectorAll('.multi-select-option.selected');
  return Array.from(selected).map((opt) => (opt as HTMLElement).dataset.value || '');
}

/**
 * Filter value cache for batch operations
 */
interface FilterValues {
  fund: string[];
  account: string[];
  group: string[];
  vintage: string[];
  tag: string[];
}

/**
 * Get all filter values in a single batch operation
 * More efficient than calling getMultiSelectValues 5 times
 */
export function getAllFilterValues(): FilterValues {
  const ids = ['fundFilter', 'accountFilter', 'groupFilter', 'vintageFilter', 'tagFilter'];
  const keys: (keyof FilterValues)[] = ['fund', 'account', 'group', 'vintage', 'tag'];
  const result: FilterValues = { fund: [], account: [], group: [], vintage: [], tag: [] };

  ids.forEach((id, index) => {
    const container = document.getElementById(id);
    if (container) {
      const selected = container.querySelectorAll('.multi-select-option.selected');
      result[keys[index]!] = Array.from(selected).map((opt) => (opt as HTMLElement).dataset.value || '');
    }
  });

  return result;
}

/**
 * Check if any filters are active (batch version)
 */
export function hasActiveFilters(): boolean {
  const values = getAllFilterValues();
  return values.fund.length > 0 || values.account.length > 0 ||
         values.group.length > 0 || values.vintage.length > 0 || values.tag.length > 0;
}

/**
 * Set selected values for a multi-select dropdown
 */
export function setMultiSelectValues(id: string, values: string[]): void {
  const container = document.getElementById(id);
  if (!container) return;
  const valuesSet = new Set(values);
  const options = container.querySelectorAll('.multi-select-option');
  options.forEach((opt) => {
    const el = opt as HTMLElement;
    if (valuesSet.has(el.dataset.value || '')) {
      opt.classList.add('selected');
      const checkbox = opt.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) checkbox.checked = true;
    } else {
      opt.classList.remove('selected');
      const checkbox = opt.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) checkbox.checked = false;
    }
  });
  updateMultiSelectDisplay(id);
}

/**
 * Clear all selections in a multi-select dropdown
 */
export function clearMultiSelect(id: string): void {
  setMultiSelectValues(id, []);
}

/**
 * Update the display text of a multi-select dropdown
 */
export function updateMultiSelectDisplay(id: string): void {
  const container = document.getElementById(id);
  if (!container) return;
  const display = container.querySelector('.multi-select-display');
  if (!display) return;

  const placeholder = container.dataset.placeholder || 'Select...';
  const selected = getMultiSelectValues(id);

  if (selected.length === 0) {
    display.innerHTML = `<span class="placeholder">${escapeHtml(placeholder)}</span>`;
  } else if (selected.length === 1) {
    const option = container.querySelector(
      `.multi-select-option[data-value="${CSS.escape(selected[0] || '')}"]`
    );
    const label = option?.querySelector('label')?.textContent || selected[0];
    display.innerHTML = escapeHtml(label);
  } else {
    // Use textContent instead of innerHTML for safety (avoids XSS risk)
    const countSpan = document.createElement('span');
    countSpan.className = 'multi-select-count';
    countSpan.textContent = `${selected.length} selected`;
    display.innerHTML = '';
    display.appendChild(countSpan);
  }
}

interface MultiSelectOption {
  value: string;
  label: string;
  indent?: number;
}

/**
 * Populate options in a multi-select dropdown
 * Uses DocumentFragment for efficient batch DOM insertion
 */
export function populateMultiSelect(
  id: string,
  options: MultiSelectOption[],
  preserveValues: string[] = []
): void {
  const container = document.getElementById(id);
  if (!container) return;
  const dropdown = container.querySelector('.multi-select-dropdown');
  if (!dropdown) return;

  // Preserve search state before rebuilding
  const existingSearchInput = dropdown.querySelector('.multi-select-search input') as HTMLInputElement;
  const preservedSearch = existingSearchInput?.value || '';

  // Create static structure first
  dropdown.innerHTML = `
    <div class="multi-select-search">
      <input type="text" placeholder="Search..." aria-label="Search options" value="${escapeHtml(preservedSearch)}">
    </div>
    <div class="multi-select-options"></div>
    <div class="multi-select-no-results">No matches found</div>
  `;

  const optionsContainer = dropdown.querySelector('.multi-select-options')!;

  // Use DocumentFragment for batch insertion of options
  const fragment = document.createDocumentFragment();
  const preserveSet = new Set(preserveValues);

  // Create "Select All" option
  const selectAllDiv = document.createElement('div');
  selectAllDiv.className = 'multi-select-option multi-select-all-option';
  selectAllDiv.setAttribute('data-value', '__select_all__');
  selectAllDiv.setAttribute('role', 'option');
  selectAllDiv.setAttribute('aria-selected', 'false');
  selectAllDiv.innerHTML = '<input type="checkbox" tabindex="-1"><label>Select All</label>';
  fragment.appendChild(selectAllDiv);

  // Build options using DocumentFragment
  let seenTopLevelGroup = false;
  for (const opt of options) {
    const isSelected = preserveSet.has(opt.value);
    const div = document.createElement('div');

    const classes = ['multi-select-option'];
    if (opt.indent !== undefined) {
      if (opt.indent === 0) {
        classes.push('group-top-level');
        if (seenTopLevelGroup) {
          classes.push('group-separator');
        }
        seenTopLevelGroup = true;
      } else {
        classes.push('group-option', 'group-child');
      }
    }
    if (isSelected) classes.push('selected');

    div.className = classes.join(' ');
    div.setAttribute('data-value', opt.value);
    div.setAttribute('role', 'option');
    div.setAttribute('aria-selected', String(isSelected));
    if (opt.indent !== undefined) {
      div.style.setProperty('--indent-level', String(opt.indent));
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.tabIndex = -1;

    const label = document.createElement('label');
    label.textContent = opt.label;

    div.appendChild(checkbox);
    div.appendChild(label);
    fragment.appendChild(div);
  }

  // Single DOM insertion
  optionsContainer.appendChild(fragment);

  // Restore search filter if there was one
  if (preservedSearch) {
    filterMultiSelectOptions(container, preservedSearch);
  }

  updateMultiSelectDisplay(id);
}

/**
 * Filter options in a multi-select dropdown based on search text
 * Batches CSS class changes for better performance
 */
export function filterMultiSelectOptions(container: HTMLElement, searchText: string): void {
  const optionsContainer = container.querySelector('.multi-select-options');
  const noResults = container.querySelector('.multi-select-no-results');
  if (!optionsContainer) return;

  const options = optionsContainer.querySelectorAll('.multi-select-option');
  const searchLower = searchText.toLowerCase().trim();

  // Batch operations: collect all changes first, then apply
  const toShow: Element[] = [];
  const toHide: Element[] = [];

  options.forEach((option) => {
    const label = option.querySelector('label');
    const text = label ? label.textContent?.toLowerCase() || '' : '';

    if (searchLower === '' || text.includes(searchLower)) {
      toShow.push(option);
    } else {
      toHide.push(option);
    }
  });

  // Apply all changes in batch (single reflow)
  for (const option of toShow) {
    option.classList.remove('search-hidden');
  }
  for (const option of toHide) {
    option.classList.add('search-hidden');
  }

  if (noResults) {
    noResults.classList.toggle('visible', toShow.length === 0 && searchLower !== '');
  }
}

/**
 * Clear the search input and show all options
 */
export function clearMultiSelectSearch(container: HTMLElement): void {
  const searchInput = container.querySelector('.multi-select-search input') as HTMLInputElement;
  if (searchInput) {
    searchInput.value = '';
  }
  filterMultiSelectOptions(container, '');
}

/**
 * Toggle all visible (non-hidden) options in a multi-select dropdown
 * If all visible are selected, deselect all. Otherwise, select all.
 */
export function toggleAllVisibleOptions(container: HTMLElement): void {
  const optionsContainer = container.querySelector('.multi-select-options');
  if (!optionsContainer) return;

  // Get visible options (excluding the Select All option itself)
  const visibleOptions = optionsContainer.querySelectorAll(
    '.multi-select-option:not(.search-hidden):not(.multi-select-all-option)'
  );

  // Check if all visible options are currently selected
  const allSelected = Array.from(visibleOptions).every((opt) => opt.classList.contains('selected'));

  // Toggle: if all selected, deselect all; otherwise select all
  const shouldSelect = !allSelected;

  visibleOptions.forEach((option) => {
    if (shouldSelect) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
    const checkbox = option.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) checkbox.checked = shouldSelect;
    option.setAttribute('aria-selected', shouldSelect.toString());
  });

  updateSelectAllCheckbox(container);
  updateMultiSelectDisplay(container.id);
}

/**
 * Update the "Select All" checkbox state based on visible options
 */
export function updateSelectAllCheckbox(container: HTMLElement): void {
  const selectAllOption = container.querySelector('.multi-select-all-option');
  if (!selectAllOption) return;

  const optionsContainer = container.querySelector('.multi-select-options');
  if (!optionsContainer) return;

  // Get visible options (excluding Select All)
  const visibleOptions = optionsContainer.querySelectorAll(
    '.multi-select-option:not(.search-hidden):not(.multi-select-all-option)'
  );

  if (visibleOptions.length === 0) {
    // No visible options, uncheck Select All
    selectAllOption.classList.remove('selected');
    const checkbox = selectAllOption.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) checkbox.checked = false;
    return;
  }

  const allSelected = Array.from(visibleOptions).every((opt) => opt.classList.contains('selected'));

  if (allSelected) {
    selectAllOption.classList.add('selected');
  } else {
    selectAllOption.classList.remove('selected');
  }

  const checkbox = selectAllOption.querySelector('input[type="checkbox"]') as HTMLInputElement;
  if (checkbox) checkbox.checked = allSelected;
}

// Cache for group tree to avoid rebuilding on every filter update
let cachedGroupTree: Array<Group & { children: any[] }> | null = null;
let cachedGroupDataVersion: number = -1;

/**
 * Build a tree structure from flat groups array, sorted alphabetically
 * Uses caching based on AppState.dataVersion for proper invalidation
 */
export function buildGroupsTree(
  groups: Group[],
  parentId: number | null
): Array<Group & { children: Array<Group & { children: any[] }> }> {
  // For root-level call (parentId === null), use caching
  if (parentId === null) {
    // Return cached tree if data hasn't changed (use dataVersion instead of reference equality)
    if (cachedGroupTree && cachedGroupDataVersion === AppState.dataVersion) {
      return cachedGroupTree;
    }
    // Build new tree and cache it with current dataVersion
    cachedGroupDataVersion = AppState.dataVersion;
    cachedGroupTree = buildGroupsTreeInternal(groups, null);
    return cachedGroupTree;
  }
  // Non-root calls go directly to internal function
  return buildGroupsTreeInternal(groups, parentId);
}

/**
 * Internal tree building function (no caching)
 */
function buildGroupsTreeInternal(
  groups: Group[],
  parentId: number | null
): Array<Group & { children: Array<Group & { children: any[] }> }> {
  return groups
    .filter((g) => g.parentGroupId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => ({
      ...g,
      children: buildGroupsTreeInternal(groups, g.id),
    }));
}

/**
 * Filter configurations
 */
interface FilterConfig {
  id: string;
  isMultiSelect: boolean;
  apply: (fund: Fund, values: string[]) => boolean;
}

export const FilterConfigs: FilterConfig[] = [
  {
    id: 'fundFilter',
    isMultiSelect: true,
    apply: (fund, values) => values.length === 0 || values.includes(fund.fundName),
  },
  {
    id: 'accountFilter',
    isMultiSelect: true,
    apply: (fund, values) => values.length === 0 || values.includes(fund.accountNumber),
  },
  {
    id: 'vintageFilter',
    isMultiSelect: true,
    apply: (fund, values) => {
      if (values.length === 0) return true;
      const vintage = getVintageYear(fund);
      return vintage !== null && values.includes(vintage.toString());
    },
  },
];

/**
 * Get the current filter state as a record for caching
 */
export function getFilterState(): Record<string, string[]> {
  return {
    fundFilter: getMultiSelectValues('fundFilter'),
    accountFilter: getMultiSelectValues('accountFilter'),
    groupFilter: getMultiSelectValues('groupFilter'),
    tagFilter: getMultiSelectValues('tagFilter'),
    vintageFilter: getMultiSelectValues('vintageFilter'),
  };
}

/**
 * Apply all current filters to a list of funds
 */
export function applyCurrentFilters(funds: Fund[]): Fund[] {
  const filterValues = getFilterState();

  // Pre-compute group filter data for O(1) lookups (optimization)
  const groupFilterVals = filterValues.groupFilter || [];
  let groupMatchSet: Set<number> | null = null;
  if (groupFilterVals.length > 0) {
    groupMatchSet = new Set<number>();
    for (const groupIdStr of groupFilterVals) {
      const groupId = parseInt(groupIdStr, 10);
      // Add the group itself and all its descendants
      const descendants = AppState.getDescendantIds(groupId);
      for (const id of descendants) {
        groupMatchSet.add(id);
      }
    }
  }

  // Convert tag filter to Set for O(1) lookup
  const tagFilterVals = filterValues.tagFilter || [];
  const tagFilterSet = tagFilterVals.length > 0
    ? new Set(tagFilterVals)
    : null;

  return funds.filter((fund) => {
    // Apply declarative filters
    for (const config of FilterConfigs) {
      const value = filterValues[config.id as keyof typeof filterValues] || [];
      if (!config.apply(fund, value)) return false;
    }

    // Group filter (using pre-computed Set for O(1) lookup)
    if (groupMatchSet !== null) {
      if (!fund.groupId || !groupMatchSet.has(fund.groupId)) {
        return false;
      }
    }

    // Tag filter (using Set for O(1) lookup)
    if (tagFilterSet !== null) {
      const fundNameObj = AppState.fundNameData.get(fund.fundName);
      const tags = fundNameObj?.tags || [];
      const hasMatchingTag = tags.some((tag) => tagFilterSet.has(tag));
      if (!hasMatchingTag) return false;
    }

    return true;
  });
}

/**
 * Reset all filters to default (no selection, cutoff date to most recent quarter-end)
 */
export function resetFilters(): void {
  clearMultiSelect('fundFilter');
  clearMultiSelect('accountFilter');
  clearMultiSelect('groupFilter');
  clearMultiSelect('tagFilter');
  clearMultiSelect('vintageFilter');

  const cutoffDate = document.getElementById('cutoffDate') as HTMLInputElement;
  if (cutoffDate) cutoffDate.value = getDefaultCutoffDateString();
}

/**
 * Update the active filters indicator
 */
export function updateActiveFiltersIndicator(): void {
  const indicator = document.getElementById('activeFiltersIndicator');
  if (!indicator) return;

  const activeCount = [
    getMultiSelectValues('fundFilter'),
    getMultiSelectValues('accountFilter'),
    getMultiSelectValues('groupFilter'),
    getMultiSelectValues('tagFilter'),
    getMultiSelectValues('vintageFilter'),
  ].filter((v) => v.length > 0).length;

  if (activeCount > 0) {
    indicator.innerHTML = `${activeCount} filter${activeCount > 1 ? 's' : ''} active <button class="clear-filters" title="Clear all filters" aria-label="Clear all filters">&times;</button>`;
    indicator.classList.add('show');
  } else {
    indicator.innerHTML = '';
    indicator.classList.remove('show');
  }
}

/**
 * Handle cascading selection for group filter dropdown
 */
export function handleGroupFilterCascade(
  container: HTMLElement,
  clickedGroupId: number,
  isNowSelected: boolean
): void {
  const optionsContainer = container.querySelector('.multi-select-options');
  if (!optionsContainer) return;

  const setOptionSelected = (groupId: number, selected: boolean) => {
    // Use CSS.escape for safe selector construction
    const option = optionsContainer.querySelector(`[data-value="${CSS.escape(String(groupId))}"]`);
    if (option) {
      if (selected) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
      const checkbox = option.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) checkbox.checked = selected;
      option.setAttribute('aria-selected', selected.toString());
    }
  };

  const isOptionSelected = (groupId: number): boolean => {
    // Use CSS.escape for safe selector construction
    const option = optionsContainer.querySelector(`[data-value="${CSS.escape(String(groupId))}"]`);
    return option ? option.classList.contains('selected') : false;
  };

  if (isNowSelected) {
    // Select all descendants
    const descendants = AppState.getDescendantIds(clickedGroupId);
    descendants.forEach((descId) => {
      if (descId !== clickedGroupId) {
        setOptionSelected(descId, true);
      }
    });

    // Cascade up: check if all siblings are selected
    let currentId: number | null = clickedGroupId;
    while (currentId != null) {
      const group = AppState.getGroupByIdSync(currentId);
      if (!group || group.parentGroupId == null) break;

      const parentId = group.parentGroupId;
      const siblings = AppState.getDirectChildIds(parentId);
      const allSiblingsSelected = siblings.every((sibId) => isOptionSelected(sibId));

      if (allSiblingsSelected) {
        setOptionSelected(parentId, true);
        currentId = parentId;
      } else {
        break;
      }
    }
  } else {
    // Deselect all descendants
    const descendants = AppState.getDescendantIds(clickedGroupId);
    descendants.forEach((descId) => {
      if (descId !== clickedGroupId) {
        setOptionSelected(descId, false);
      }
    });

    // Deselect all ancestors
    const group = AppState.getGroupByIdSync(clickedGroupId);
    if (group && group.parentGroupId != null) {
      let parentId: number | null = group.parentGroupId;
      while (parentId != null) {
        setOptionSelected(parentId, false);
        const parentGroup = AppState.getGroupByIdSync(parentId);
        parentId = parentGroup ? parentGroup.parentGroupId : null;
      }
    }
  }
}

/**
 * Handle cascading selection for multiple groups at once (batched for performance)
 * Used when "Select All" is clicked to avoid calling handleGroupFilterCascade in a loop
 */
export function handleGroupFilterCascadeBatch(
  container: HTMLElement,
  groupIds: number[],
  isNowSelected: boolean
): void {
  const optionsContainer = container.querySelector('.multi-select-options');
  if (!optionsContainer) return;

  // Collect all group IDs that need to be updated
  const groupsToUpdate = new Set<number>();

  for (const clickedGroupId of groupIds) {
    if (isNowSelected) {
      // Add all descendants
      const descendants = AppState.getDescendantIds(clickedGroupId);
      descendants.forEach((id) => groupsToUpdate.add(id));
    } else {
      // Add all descendants
      const descendants = AppState.getDescendantIds(clickedGroupId);
      descendants.forEach((id) => groupsToUpdate.add(id));

      // Add all ancestors
      const group = AppState.getGroupByIdSync(clickedGroupId);
      if (group && group.parentGroupId != null) {
        let parentId: number | null = group.parentGroupId;
        while (parentId != null) {
          groupsToUpdate.add(parentId);
          const parentGroup = AppState.getGroupByIdSync(parentId);
          parentId = parentGroup ? parentGroup.parentGroupId : null;
        }
      }
    }
  }

  // Batch DOM updates - single pass through all affected options
  groupsToUpdate.forEach((groupId) => {
    // Use CSS.escape for safe selector construction
    const option = optionsContainer.querySelector(`[data-value="${CSS.escape(String(groupId))}"]`);
    if (option) {
      if (isNowSelected) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
      const checkbox = option.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) checkbox.checked = isNowSelected;
      option.setAttribute('aria-selected', isNowSelected.toString());
    }
  });
}

/**
 * Update filter dropdowns based on current selections
 */
export function updateFilterDropdowns(allFunds: Fund[]): void {
  const currentGroupValues = getMultiSelectValues('groupFilter');
  const currentFundValues = getMultiSelectValues('fundFilter');
  const currentAccountValues = getMultiSelectValues('accountFilter');
  const currentVintageValues = getMultiSelectValues('vintageFilter');
  const currentTagValues = getMultiSelectValues('tagFilter');

  // Pre-compute group filter set for O(1) lookups
  let groupFilterSet: Set<number> | null = null;
  if (currentGroupValues.length > 0) {
    groupFilterSet = new Set<number>();
    for (const groupIdStr of currentGroupValues) {
      const gId = parseInt(groupIdStr, 10);
      const descendants = AppState.getDescendantIds(gId);
      for (const id of descendants) {
        groupFilterSet.add(id);
      }
    }
  }

  // Convert arrays to Sets for O(1) lookups
  const fundSet = currentFundValues.length > 0 ? new Set(currentFundValues) : null;
  const accountSet = currentAccountValues.length > 0 ? new Set(currentAccountValues) : null;
  const vintageSet = currentVintageValues.length > 0 ? new Set(currentVintageValues) : null;

  // Helper functions using Sets for O(1) lookups
  const filterByGroups = (funds: Fund[], groupSet: Set<number> | null): Fund[] => {
    if (!groupSet) return funds;
    return funds.filter((fund) => fund.groupId != null && groupSet.has(fund.groupId));
  };

  const filterByVintages = (funds: Fund[], vintages: Set<string> | null): Fund[] => {
    if (!vintages) return funds;
    return funds.filter((fund) => {
      const vintage = getVintageYear(fund);
      return vintage !== null && vintages.has(vintage.toString());
    });
  };

  const filterByFunds = (funds: Fund[], fundNames: Set<string> | null): Fund[] => {
    if (!fundNames) return funds;
    return funds.filter((f) => fundNames.has(f.fundName));
  };

  const filterByAccounts = (funds: Fund[], accounts: Set<string> | null): Fund[] => {
    if (!accounts) return funds;
    return funds.filter((f) => accounts.has(f.accountNumber));
  };

  // Pre-filter by groups once (common operation for fund, account, vintage dropdowns)
  const fundsFilteredByGroups = filterByGroups(allFunds, groupFilterSet);

  // 1. Update FUND dropdown
  let fundsForFundDropdown = fundsFilteredByGroups;
  fundsForFundDropdown = filterByAccounts(fundsForFundDropdown, accountSet);
  fundsForFundDropdown = filterByVintages(fundsForFundDropdown, vintageSet);

  const uniqueFundsSet = new Set(fundsForFundDropdown.map((f) => f.fundName));
  const uniqueFunds = [...uniqueFundsSet].sort();
  const fundOptions = uniqueFunds.map((name) => ({ value: name, label: name }));
  const validFundValues = currentFundValues.filter((v) => uniqueFundsSet.has(v));
  populateMultiSelect('fundFilter', fundOptions, validFundValues);

  // 2. Update ACCOUNT dropdown
  let fundsForAccountDropdown = fundsFilteredByGroups;
  fundsForAccountDropdown = filterByFunds(fundsForAccountDropdown, fundSet);
  fundsForAccountDropdown = filterByVintages(fundsForAccountDropdown, vintageSet);

  const uniqueAccountsSet = new Set(fundsForAccountDropdown.map((f) => f.accountNumber));
  const uniqueAccounts = [...uniqueAccountsSet].sort();
  const accountOptions = uniqueAccounts.map((account) => ({ value: account, label: account }));
  const validAccountValues = currentAccountValues.filter((v) => uniqueAccountsSet.has(v));
  populateMultiSelect('accountFilter', accountOptions, validAccountValues);

  // 3. Update GROUP dropdown
  const groups = AppState.getGroups();
  const groupOptions: MultiSelectOption[] = [];

  if (groups.length > 0) {
    const tree = buildGroupsTree(groups, null);

    const flattenGroupTree = (
      nodes: Array<Group & { children: any[] }>,
      level: number,
      validGroupIds: Set<number> | null = null
    ): MultiSelectOption[] => {
      const options: MultiSelectOption[] = [];
      nodes.forEach((node) => {
        if (validGroupIds === null || validGroupIds.has(node.id)) {
          options.push({
            value: node.id.toString(),
            label: node.name,
            indent: level,
          });
        }
        if (node.children && node.children.length > 0) {
          options.push(...flattenGroupTree(node.children, level + 1, validGroupIds));
        }
      });
      return options;
    };

    if (
      currentFundValues.length > 0 ||
      currentAccountValues.length > 0 ||
      currentVintageValues.length > 0
    ) {
      // Filter groups to only those containing matching funds
      // This applies whether or not groups are already selected
      let fundsForGroupDropdown = allFunds;
      fundsForGroupDropdown = filterByFunds(fundsForGroupDropdown, fundSet);
      fundsForGroupDropdown = filterByAccounts(fundsForGroupDropdown, accountSet);
      fundsForGroupDropdown = filterByVintages(fundsForGroupDropdown, vintageSet);

      const validGroupIds = new Set<number>();
      fundsForGroupDropdown.forEach((fund) => {
        if (fund.groupId != null) {
          const ancestors = AppState.getAncestorIds(fund.groupId);
          ancestors.forEach((id) => validGroupIds.add(id));
        }
      });
      groupOptions.push(...flattenGroupTree(tree, 0, validGroupIds));
    } else {
      // No other filters active, show all groups
      groupOptions.push(...flattenGroupTree(tree, 0));
    }
  }

  const validGroupSet = new Set(groupOptions.map((opt) => opt.value));
  const validGroupValues = currentGroupValues.filter((v) => validGroupSet.has(v));
  populateMultiSelect('groupFilter', groupOptions, validGroupValues);

  // 4. Update VINTAGE dropdown
  let fundsForVintageDropdown = fundsFilteredByGroups;
  fundsForVintageDropdown = filterByFunds(fundsForVintageDropdown, fundSet);
  fundsForVintageDropdown = filterByAccounts(fundsForVintageDropdown, accountSet);

  const vintages = new Set<number>();
  fundsForVintageDropdown.forEach((fund) => {
    const vintage = getVintageYear(fund);
    if (vintage !== null) {
      vintages.add(vintage);
    }
  });

  const sortedVintages = Array.from(vintages).sort((a, b) => b - a);
  const vintageOptions = sortedVintages.map((year) => ({
    value: year.toString(),
    label: year.toString(),
  }));
  const validVintageValues = currentVintageValues.filter((v) => vintages.has(parseInt(v, 10)));
  populateMultiSelect('vintageFilter', vintageOptions, validVintageValues);

  // 5. Update TAG dropdown
  const allTags = new Set<string>();
  AppState.fundNameData.forEach((fundNameObj) => {
    if (fundNameObj.tags) {
      fundNameObj.tags.forEach((tag) => allTags.add(tag));
    }
  });

  const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));
  const tagOptions = sortedTags.map((tag) => ({ value: tag, label: tag }));
  const validTagValues = currentTagValues.filter((v) => allTags.has(v));
  populateMultiSelect('tagFilter', tagOptions, validTagValues);
}
