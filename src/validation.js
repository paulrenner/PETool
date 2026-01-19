/**
 * Validation functions for PE Fund Manager
 */

/**
 * Validate date string in YYYY-MM-DD format
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid
 */
export function isValidDate(dateStr) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return false;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return false;
    }
    // Check that the date components match (catches invalid dates like 2020-02-30)
    const [year, month, day] = dateStr.split('-').map(Number);
    return date.getFullYear() === year &&
           date.getMonth() + 1 === month &&
           date.getDate() === day;
}

/**
 * Validate fund name
 * @param {string} name - Fund name to validate
 * @returns {Object} {valid: boolean, error: string|null}
 */
export function validateFundName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Fund name is required' };
    }

    const trimmed = name.trim();

    if (trimmed.length < 2) {
        return { valid: false, error: 'Fund name too short (min 2 characters)' };
    }

    if (trimmed.length > 100) {
        return { valid: false, error: 'Fund name too long (max 100 characters)' };
    }

    return { valid: true, error: null };
}

/**
 * Validate multiplier for duplicate operations
 * @param {number} multiplier - Multiplier value
 * @returns {Object} {valid: boolean, warning: string|null}
 */
export function validateMultiplier(multiplier) {
    if (typeof multiplier !== 'number' || isNaN(multiplier)) {
        return { valid: false, warning: 'Multiplier must be a number' };
    }

    if (multiplier <= 0) {
        return { valid: false, warning: 'Multiplier must be positive' };
    }

    if (multiplier > 1000) {
        return { valid: true, warning: `Multiplier of ${multiplier} is very large and will create extremely large amounts` };
    }

    if (multiplier < 0.001) {
        return { valid: true, warning: `Multiplier of ${multiplier} is very small and may result in rounding to zero` };
    }

    return { valid: true, warning: null };
}

/**
 * Validate file size for import
 * @param {number} fileSize - File size in bytes
 * @param {number} maxSize - Maximum size in bytes (default 50MB)
 * @returns {Object} {valid: boolean, error: string|null}
 */
export function validateFileSize(fileSize, maxSize = 50 * 1024 * 1024) {
    if (fileSize > maxSize) {
        const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
        const maxMB = (maxSize / 1024 / 1024).toFixed(0);
        return { valid: false, error: `File too large (${sizeMB}MB). Maximum size is ${maxMB}MB.` };
    }
    return { valid: true, error: null };
}

/**
 * Validate cash flow structure
 * @param {Object} cashFlow - Cash flow object
 * @param {number} index - Index in array (for error messages)
 * @returns {Object} {valid: boolean, error: string|null}
 */
export function validateCashFlow(cashFlow, index) {
    if (!cashFlow || typeof cashFlow !== 'object') {
        return { valid: false, error: `Invalid cash flow at index ${index}` };
    }

    if (!cashFlow.date) {
        return { valid: false, error: `Missing date at index ${index}` };
    }

    if (!isValidDate(cashFlow.date)) {
        return { valid: false, error: `Invalid date format at index ${index}` };
    }

    if (typeof cashFlow.amount === 'undefined') {
        return { valid: false, error: `Missing amount at index ${index}` };
    }

    if (!cashFlow.type) {
        return { valid: false, error: `Missing type at index ${index}` };
    }

    if (!['Contribution', 'Distribution', 'Adjustment'].includes(cashFlow.type)) {
        return { valid: false, error: `Invalid cash flow type at index ${index}` };
    }

    return { valid: true, error: null };
}

/**
 * Validate NAV entry structure
 * @param {Object} nav - NAV object
 * @param {number} index - Index in array (for error messages)
 * @returns {Object} {valid: boolean, error: string|null}
 */
export function validateNavEntry(nav, index) {
    if (!nav || typeof nav !== 'object') {
        return { valid: false, error: `Invalid NAV entry at index ${index}` };
    }

    if (!nav.date) {
        return { valid: false, error: `Missing date at index ${index}` };
    }

    if (!isValidDate(nav.date)) {
        return { valid: false, error: `Invalid date format at index ${index}` };
    }

    if (typeof nav.amount === 'undefined') {
        return { valid: false, error: `Missing amount at index ${index}` };
    }

    return { valid: true, error: null };
}
