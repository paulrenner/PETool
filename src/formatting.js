/**
 * Formatting functions for PE Fund Manager
 */

/**
 * Parse currency string or number to number
 * @param {string|number} val - Value to parse
 * @returns {number} Parsed number or NaN
 */
export function parseCurrency(val) {
    if (val === null || typeof val === 'undefined') return NaN;
    if (typeof val === 'number') return isFinite(val) ? val : NaN;
    if (typeof val === 'string') {
        const cleaned = val.replace(/[$,]/g, '').replace(/^\((.*)\)$/, '-$1').trim();
        if (cleaned === '') return NaN;
        const num = parseFloat(cleaned);
        return isFinite(num) ? num : NaN;
    }
    return NaN;
}

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number with commas
 */
export function formatNumberWithCommas(num) {
    if (num === null || num === undefined || isNaN(num)) return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

/**
 * Format value as currency
 * @param {number} value - Value to format
 * @param {boolean} showCents - Whether to show cents
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, showCents = false) {
    const val = parseFloat(value);
    if (!isFinite(val) || isNaN(val)) return '$0';
    return val.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: showCents ? 2 : 0,
        maximumFractionDigits: showCents ? 2 : 0
    });
}

/**
 * Format number without currency symbol (for CSV export)
 * @param {number} value - Value to format
 * @returns {string} Formatted number
 */
export function formatNumber(value) {
    const val = parseFloat(value);
    if (!isFinite(val) || isNaN(val)) return '0';
    return val.toFixed(2);
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape CSV value
 * @param {string} value - Value to escape
 * @returns {string} Escaped CSV value
 */
export function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}
