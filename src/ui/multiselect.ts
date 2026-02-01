/**
 * Multi-Select Dropdown Component
 */

import { escapeHtml } from '../utils/escaping';

export interface MultiSelectOption {
  value: string;
  label: string;
  indent?: number;
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
  const valuesSet = new Set(values);
  const options = container.querySelectorAll('.multi-select-option');
  options.forEach((opt) => {
    const element = opt as HTMLElement;
    if (valuesSet.has(element.dataset.value || '')) {
      element.classList.add('selected');
      const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (checkbox) checkbox.checked = true;
    } else {
      element.classList.remove('selected');
      const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
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
    // Show the single selected value
    const option = container.querySelector(
      `.multi-select-option[data-value="${CSS.escape(selected[0]!)}"]`
    );
    const label = option ? option.querySelector('label')?.textContent : selected[0];
    display.innerHTML = escapeHtml(label || selected[0] || '');
  } else {
    // Show count badge
    display.innerHTML = `<span class="multi-select-count">${selected.length} selected</span>`;
  }
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

  let seenTopLevelGroup = false;
  const optionsHtml = options
    .map((opt) => {
      const isSelected = preserveValues.includes(opt.value);
      const indentStyle = opt.indent !== undefined ? `style="--indent-level: ${opt.indent}"` : '';

      // Build CSS classes based on hierarchy level
      const classes = ['multi-select-option'];
      if (opt.indent !== undefined) {
        if (opt.indent === 0) {
          // Top-level group
          classes.push('group-top-level');
          if (seenTopLevelGroup) {
            classes.push('group-separator');
          }
          seenTopLevelGroup = true;
        } else {
          // Child group
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
      <input type="text" placeholder="Search..." aria-label="Search options">
    </div>
    <div class="multi-select-options">${optionsHtml}</div>
    <div class="multi-select-no-results">No matches found</div>
  `;

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

  // Show/hide no results message
  if (noResults) {
    noResults.classList.toggle('visible', visibleCount === 0 && searchLower !== '');
  }
}

/**
 * Clear the search input and show all options in a multi-select dropdown
 */
export function clearMultiSelectSearch(container: HTMLElement): void {
  const searchInput = container.querySelector('.multi-select-search input') as HTMLInputElement;
  if (searchInput) {
    searchInput.value = '';
  }
  filterMultiSelectOptions(container, '');
}
