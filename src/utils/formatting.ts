/**
 * Parse currency string or number to number
 */
export function parseCurrency(val: unknown): number {
  if (val === null || typeof val === 'undefined') return NaN;
  if (typeof val === 'number') return isFinite(val) ? val : NaN;
  if (typeof val === 'string') {
    const cleaned = val
      .replace(/[$,]/g, '')
      .replace(/^\((.*)\)$/, '-$1')
      .trim();
    if (cleaned === '') return NaN;
    const num = parseFloat(cleaned);
    return isFinite(num) ? num : NaN;
  }
  return NaN;
}

/**
 * Format number with commas
 */
export function formatNumberWithCommas(num: number | null | undefined, decimals?: number): string {
  if (num === null || num === undefined || isNaN(num)) return '';
  const value = decimals !== undefined ? num.toFixed(decimals) : num.toString();
  const parts = value.split('.');
  parts[0] = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/**
 * Format value as currency
 */
export function formatCurrency(value: number | string, showCents: boolean = false): string {
  const val = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(val) || isNaN(val)) return '$0';
  return val.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}


/**
 * Format date for display
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  // Append time to force local timezone interpretation for date-only strings
  const normalizedStr = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00';
  const date = new Date(normalizedStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format percentage
 */
export function formatPercent(value: number | null, decimals: number = 1): string {
  if (value === null || isNaN(value)) return '-';
  return (value * 100).toFixed(decimals) + '%';
}

/**
 * Format multiplier (like MOIC)
 */
export function formatMultiplier(value: number | null, decimals: number = 2): string {
  if (value === null || isNaN(value)) return '-';
  return value.toFixed(decimals) + 'x';
}
