/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: unknown): string {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape CSV value with formula injection protection
 * Prevents spreadsheet formula injection (=, +, -, @, tab, carriage return)
 */
export function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (str.length === 0) return '';

  // Formula injection protection - prefix dangerous first characters
  const firstChar = str.charAt(0);
  if (['=', '+', '@', '\t', '\r'].includes(firstChar)) {
    str = "'" + str;
  } else if (firstChar === '-') {
    // Only prefix '-' if NOT a valid negative number
    const num = Number(str);
    if (isNaN(num) || !isFinite(num)) {
      str = "'" + str;
    }
  }

  // Standard CSV escaping - quote if contains special characters
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes("'")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Sanitize a string for use in HTML attributes
 */
export function escapeAttribute(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
