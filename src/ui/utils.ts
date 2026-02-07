/**
 * UI Utility functions
 */

import { CONFIG } from '../core/config';

/**
 * Check if a key is dangerous for prototype pollution
 */
function isDangerousKey(key: string): boolean {
  return (CONFIG.DANGEROUS_KEYS as readonly string[]).includes(key) ||
    key === '__defineGetter__' ||
    key === '__defineSetter__' ||
    key === '__lookupGetter__' ||
    key === '__lookupSetter__';
}

/**
 * Sanitize object to prevent prototype pollution attacks
 * Uses Object.create(null) to create objects without prototype chain
 * Recursively sanitizes all nested objects and arrays
 */
function sanitizeObject<T>(obj: T, depth = 0): T {
  if (depth > CONFIG.MAX_JSON_DEPTH) {
    throw new Error('Object too deeply nested');
  }

  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1)) as T;
  }

  // Create object with null prototype to prevent prototype pollution
  const sanitized = Object.create(null) as Record<string, unknown>;

  // Use Object.getOwnPropertyNames to catch non-enumerable properties too
  for (const key of Object.getOwnPropertyNames(obj)) {
    // Skip dangerous keys that could cause prototype pollution
    if (isDangerousKey(key)) {
      console.warn(`Blocked potentially dangerous key: ${key}`);
      continue;
    }

    // Get property descriptor to check for getters/setters
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    if (descriptor && (descriptor.get || descriptor.set)) {
      // Skip accessor properties as they could execute malicious code
      console.warn(`Blocked accessor property: ${key}`);
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
 * Safe localStorage getItem - handles private browsing and storage errors
 */
export function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    console.warn(`Failed to read localStorage key: ${key}`);
    return null;
  }
}

/**
 * Safe localStorage setItem - handles private browsing and quota errors
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`Failed to write localStorage key: ${key}`, err);
    return false;
  }
}

/**
 * Safe parseInt with NaN fallback
 */
export function safeParseInt(value: string | null | undefined, fallback: number = 0): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Announce message to screen readers via ARIA live region
 * @param message - The message to announce
 */
export function announceToScreenReader(message: string): void {
  const announcer = document.getElementById('srAnnounce');
  if (announcer) {
    announcer.textContent = message;
    // Clear after announcement to allow repeat announcements
    setTimeout(() => {
      announcer.textContent = '';
    }, CONFIG.SR_ANNOUNCEMENT_DURATION);
  }
}
