/**
 * Centralized number formatting utilities
 */

import { CONFIG } from '../core/config';

export interface NumberFormatOptions {
  prefix?: string;
  suffix?: string;
  decimals?: number;
  fallback?: string;
  showSign?: boolean;
  useCommas?: boolean;
}

export const Formatter = {
  /**
   * Format a number with options
   */
  number(value: number | null | undefined, options: NumberFormatOptions = {}): string {
    const {
      prefix = '',
      suffix = '',
      decimals = 0,
      fallback = 'N/A',
      showSign = false,
      useCommas = true,
    } = options;

    if (value === null || value === undefined || isNaN(value)) {
      return fallback;
    }

    let formatted = useCommas
      ? value.toLocaleString(CONFIG.CURRENCY_FORMAT, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : value.toFixed(decimals);

    if (showSign && value > 0) {
      formatted = '+' + formatted;
    }

    return prefix + formatted + suffix;
  },

  /**
   * Format as currency
   */
  currency(value: number | null | undefined): string {
    return this.number(value, { prefix: '$', decimals: 0, fallback: '$0' });
  },

  /**
   * Format as percentage (for IRR)
   */
  percent(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'N/A';
    return this.number(value * 100, { suffix: '%', decimals: 1, fallback: 'N/A' });
  },

  /**
   * Format as multiple (for MOIC)
   */
  multiple(value: number | null | undefined): string {
    return this.number(value, { suffix: 'x', decimals: 2, fallback: 'N/A' });
  },
};

/**
 * Format number with commas for thousands separator
 */
export function formatNumberWithCommas(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '';
  // Format with commas and up to 2 decimal places if needed
  const parts = num.toString().split('.');
  parts[0] = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/**
 * Format IRR for display
 */
export function formatIRR(irr: number | null | undefined): string {
  if (irr === null || irr === undefined) return 'N/A';
  return (irr * 100).toFixed(1) + '%';
}

/**
 * Format MOIC for display
 */
export function formatMOIC(moic: number | null | undefined): string {
  if (moic === null || moic === undefined) return 'N/A';
  return moic.toFixed(2) + 'x';
}

/**
 * Format date for display (MM/DD/YYYY)
 */
export function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
}
