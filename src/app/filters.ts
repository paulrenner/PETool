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
 * Set selected values for a multi-select dropdown
 */
export function setMultiSelectValues(id: string, values: string[]): void {
  const container = document.getElementById(id);
  if (!container) return;
  const options = container.querySelectorAll('.multi-select-option');
  options.forEach((opt) => {
    const el = opt as HTMLElement;
    if (values.includes(el.dataset.value || '')) {
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
    display.innerHTML = `<span class="multi-select-count">${selected.length} selected</span>`;
  }
}

interface MultiSelectOption {
  value: string;
  label: string;
  indent?: number;
}

/**
 * Populate options in a multi-select dropdown
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

  let seenTopLevelGroup = false;
  const optionsHtml = options
    .map((opt) => {
      const isSelected = preserveValues.includes(opt.value);
      const indentStyle = opt.indent !== undefined ? `style="--indent-level: ${opt.indent}"` : '';

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

      return `
      <div class="${classes.join(' ')}"
           data-value="${escapeHtml(opt.value)}"
           role="option"
           aria-selected="${isSelected}"
           ${indentStyle}>
        <input type="checkbox" ${isSelected ? 'checked' : ''} tabindex="-1">
        <label>${escapeHtml(opt.label)}</label>
      </div>
    `;
    })
    .join('');

  dropdown.innerHTML = `
    <div class="multi-select-search">
      <input type="text" placeholder="Search..." aria-label="Search options" value="${escapeHtml(preservedSearch)}">
    </div>
    <div class="multi-select-options">
      <div class="multi-select-option multi-select-all-option" data-value="__select_all__" role="option" aria-selected="false">
        <input type="checkbox" tabindex="-1">
        <label>Select All</label>
      </div>
      ${optionsHtml}
    </div>
    <div class="multi-select-no-results">No matches found</div>
  `;

  // Restore search filter if there was one
  if (preservedSearch) {
    filterMultiSelectOptions(container, preservedSearch);
  }

  updateMultiSelectDisplay(id);
}

/**
 * Filter options in a multi-select dropdown based on search text
 */
export function filterMultiSelectOptions(container: HTMLElement, searchText: string): void {
  const optionsContainer = container.querySelector('.multi-select-options');
  const noResults = container.querySelector('.multi-select-no-results');
  if (!optionsContainer) return;

  const options = optionsContainer.querySelectorAll('.multi-select-option');
  const searchLower = searchText.toLowerCase().trim();
  let visibleCount = 0;

  options.forEach((option) => {
    const label = option.querySelector('label');
    const text = label ? label.textContent?.toLowerCase() || '' : '';

    if (searchLower === '' || text.includes(searchLower)) {
      option.classList.remove('search-hidden');
      visibleCount++;
    } else {
      option.classList.add('search-hidden');
    }
  });

  if (noResults) {
    noResults.classList.toggle('visible', visibleCount === 0 && searchLower !== '');
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

/**
 * Build a tree structure from flat groups array, sorted alphabetically
 */
export function buildGroupsTree(
  groups: Group[],
  parentId: number | null
): Array<Group & { children: Array<Group & { children: any[] }> }> {
  return groups
    .filter((g) => g.parentGroupId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => ({
      ...g,
      children: buildGroupsTree(groups, g.id),
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
 * Apply all current filters to a list of funds
 */
export function applyCurrentFilters(funds: Fund[]): Fund[] {
  const filterValues = {
    fundFilter: getMultiSelectValues('fundFilter'),
    accountFilter: getMultiSelectValues('accountFilter'),
    groupFilter: getMultiSelectValues('groupFilter'),
    tagFilter: getMultiSelectValues('tagFilter'),
    vintageFilter: getMultiSelectValues('vintageFilter'),
  };

  // Pre-compute group filter data for O(1) lookups (optimization)
  const groupFilterVals = filterValues.groupFilter;
  let groupMatchSet: Set<number> | null = null;
  if (groupFilterVals.length > 0) {
    groupMatchSet = new Set<number>();
    for (const groupIdStr of groupFilterVals) {
      const groupId = parseInt(groupIdStr);
      // Add the group itself and all its descendants
      const descendants = AppState.getDescendantIds(groupId);
      for (const id of descendants) {
        groupMatchSet.add(id);
      }
    }
  }

  // Convert tag filter to Set for O(1) lookup
  const tagFilterSet = filterValues.tagFilter.length > 0
    ? new Set(filterValues.tagFilter)
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
    indicator.style.display = 'inline-flex';
  } else {
    indicator.innerHTML = '';
    indicator.style.display = 'none';
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
    const option = optionsContainer.querySelector(`[data-value="${groupId}"]`);
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
    const option = optionsContainer.querySelector(`[data-value="${groupId}"]`);
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
 * Update filter dropdowns based on current selections
 */
export function updateFilterDropdowns(allFunds: Fund[]): void {
  const currentGroupValues = getMultiSelectValues('groupFilter');
  const currentFundValues = getMultiSelectValues('fundFilter');
  const currentAccountValues = getMultiSelectValues('accountFilter');
  const currentVintageValues = getMultiSelectValues('vintageFilter');
  const currentTagValues = getMultiSelectValues('tagFilter');

  // Helper functions
  const filterByGroups = (funds: Fund[], groupIds: string[]): Fund[] => {
    if (groupIds.length === 0) return funds;
    return funds.filter((fund) => {
      if (!fund.groupId) return false;
      for (const groupIdStr of groupIds) {
        const gId = parseInt(groupIdStr);
        if (fund.groupId === gId) return true;
        const descendants = AppState.getDescendantIds(gId);
        if (descendants.includes(fund.groupId)) return true;
      }
      return false;
    });
  };

  const filterByVintages = (funds: Fund[], vintages: string[]): Fund[] => {
    if (vintages.length === 0) return funds;
    return funds.filter((fund) => {
      const vintage = getVintageYear(fund);
      return vintage !== null && vintages.includes(vintage.toString());
    });
  };

  const filterByFunds = (funds: Fund[], fundNames: string[]): Fund[] => {
    if (fundNames.length === 0) return funds;
    return funds.filter((f) => fundNames.includes(f.fundName));
  };

  const filterByAccounts = (funds: Fund[], accounts: string[]): Fund[] => {
    if (accounts.length === 0) return funds;
    return funds.filter((f) => accounts.includes(f.accountNumber));
  };

  // 1. Update FUND dropdown
  let fundsForFundDropdown = allFunds;
  fundsForFundDropdown = filterByGroups(fundsForFundDropdown, currentGroupValues);
  fundsForFundDropdown = filterByAccounts(fundsForFundDropdown, currentAccountValues);
  fundsForFundDropdown = filterByVintages(fundsForFundDropdown, currentVintageValues);

  const uniqueFunds = [...new Set(fundsForFundDropdown.map((f) => f.fundName))].sort();
  const fundOptions = uniqueFunds.map((name) => ({ value: name, label: name }));
  const validFundValues = currentFundValues.filter((v) => uniqueFunds.includes(v));
  populateMultiSelect('fundFilter', fundOptions, validFundValues);

  // 2. Update ACCOUNT dropdown
  let fundsForAccountDropdown = allFunds;
  fundsForAccountDropdown = filterByGroups(fundsForAccountDropdown, currentGroupValues);
  fundsForAccountDropdown = filterByFunds(fundsForAccountDropdown, currentFundValues);
  fundsForAccountDropdown = filterByVintages(fundsForAccountDropdown, currentVintageValues);

  const uniqueAccounts = [...new Set(fundsForAccountDropdown.map((f) => f.accountNumber))].sort();
  const accountOptions = uniqueAccounts.map((account) => ({ value: account, label: account }));
  const validAccountValues = currentAccountValues.filter((v) => uniqueAccounts.includes(v));
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

    if (currentGroupValues.length > 0) {
      groupOptions.push(...flattenGroupTree(tree, 0));
    } else if (
      currentFundValues.length > 0 ||
      currentAccountValues.length > 0 ||
      currentVintageValues.length > 0
    ) {
      // Filter groups to only those containing matching funds
      let fundsForGroupDropdown = allFunds;
      fundsForGroupDropdown = filterByFunds(fundsForGroupDropdown, currentFundValues);
      fundsForGroupDropdown = filterByAccounts(fundsForGroupDropdown, currentAccountValues);
      fundsForGroupDropdown = filterByVintages(fundsForGroupDropdown, currentVintageValues);

      const validGroupIds = new Set<number>();
      fundsForGroupDropdown.forEach((fund) => {
        if (fund.groupId != null) {
          const ancestors = AppState.getAncestorIds(fund.groupId);
          ancestors.forEach((id) => validGroupIds.add(id));
        }
      });
      groupOptions.push(...flattenGroupTree(tree, 0, validGroupIds));
    } else {
      groupOptions.push(...flattenGroupTree(tree, 0));
    }
  }

  const validGroupValues = currentGroupValues.filter((v) =>
    groupOptions.some((opt) => opt.value === v)
  );
  populateMultiSelect('groupFilter', groupOptions, validGroupValues);

  // 4. Update VINTAGE dropdown
  let fundsForVintageDropdown = allFunds;
  fundsForVintageDropdown = filterByGroups(fundsForVintageDropdown, currentGroupValues);
  fundsForVintageDropdown = filterByFunds(fundsForVintageDropdown, currentFundValues);
  fundsForVintageDropdown = filterByAccounts(fundsForVintageDropdown, currentAccountValues);

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
  const validVintageValues = currentVintageValues.filter((v) =>
    sortedVintages.includes(parseInt(v))
  );
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
  const validTagValues = currentTagValues.filter((v) => sortedTags.includes(v));
  populateMultiSelect('tagFilter', tagOptions, validTagValues);
}
