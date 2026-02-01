/**
 * UI Utility functions
 */

import { CONFIG } from '../core/config';

/**
 * Sanitize object to prevent prototype pollution attacks
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
