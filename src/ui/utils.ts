/**
 * UI Utility functions
 */

import { CONFIG } from '../core/config';

/**
 * Debounce function to limit rate of function calls
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function executedFunction(...args: Parameters<T>): void {
    const later = (): void => {
      timeout = null;
      func(...args);
    };
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Sanitize object to prevent prototype pollution attacks
 */
export function sanitizeObject<T>(obj: T, depth = 0): T {
  if (depth > CONFIG.MAX_JSON_DEPTH) {
    throw new Error('Object too deeply nested');
  }

  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1)) as T;
  }

  const sanitized = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(obj as object)) {
    // Skip dangerous keys that could cause prototype pollution
    if ((CONFIG.DANGEROUS_KEYS as readonly string[]).includes(key)) {
      console.warn(`Blocked potentially dangerous key: ${key}`);
      continue;
    }
    sanitized[key] = sanitizeObject((obj as Record<string, unknown>)[key], depth + 1);
  }
  return sanitized as T;
}

/**
 * Safe JSON parse with prototype pollution protection
 */
export function safeJSONParse<T>(jsonString: string): T {
  const parsed = JSON.parse(jsonString);
  return sanitizeObject(parsed);
}

/**
 * Deep clone an object safely
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }
  const cloned = {} as Record<string, unknown>;
  for (const key of Object.keys(obj as object)) {
    cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
  }
  return cloned as T;
}

/**
 * Announce message to screen readers
 */
export function announceToScreenReader(message: string): void {
  const announcer = document.getElementById('srAnnounce');
  if (announcer) {
    announcer.textContent = message;
    // Clear after announcement to allow repeat announcements
    setTimeout(() => {
      announcer.textContent = '';
    }, 1000);
  }
}

/**
 * Show/hide filter loading indicator
 */
export function setFilterLoading(show: boolean): void {
  const indicator = document.getElementById('filterLoading');
  if (indicator) {
    indicator.classList.toggle('show', show);
  }
}

/**
 * Normalize date to avoid timezone issues
 * Creates a date at noon local time to avoid day-boundary problems
 */
export function normalizeDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  // Create date at noon to avoid timezone issues
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/**
 * Debug logger that can be toggled on/off
 */
export const Debug = {
  enabled: false, // Set to true to enable debug logging
  log(...args: unknown[]): void {
    if (this.enabled) console.log('[DEBUG]', ...args);
  },
  warn(...args: unknown[]): void {
    if (this.enabled) console.warn('[DEBUG]', ...args);
  },
  error(...args: unknown[]): void {
    // Errors always log
    console.error('[ERROR]', ...args);
  },
};
