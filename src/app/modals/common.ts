/**
 * Common modal utilities - status messages, loading, confirm dialogs, modal open/close
 */

import { CONFIG } from '../../core/config';

// Track the element that triggered the modal for focus restoration
let previouslyFocusedElement: HTMLElement | null = null;

// Track active focus trap handler for cleanup
let activeFocusTrapHandler: ((e: KeyboardEvent) => void) | null = null;

// Cache focusable elements per modal to avoid repeated DOM queries
const focusableElementsCache = new WeakMap<HTMLElement, HTMLElement[]>();

// Selector for focusable elements
const FOCUSABLE_SELECTORS = [
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'a[href]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(', ');

/**
 * Get all focusable elements within a container (cached)
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  // Check cache first
  const cached = focusableElementsCache.get(container);
  if (cached) {
    return cached;
  }

  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (el) => el.offsetParent !== null // Only visible elements
  );

  focusableElementsCache.set(container, elements);
  return elements;
}

/**
 * Invalidate the focusable elements cache for a modal
 */
function invalidateFocusableCache(container: HTMLElement): void {
  focusableElementsCache.delete(container);
}

/**
 * Set up focus trap within a modal
 */
function setupFocusTrap(modal: HTMLElement): void {
  // Always clean up existing focus trap first to prevent memory leaks
  removeFocusTrap();

  // Invalidate cache on modal open to get fresh focusable elements
  invalidateFocusableCache(modal);

  activeFocusTrapHandler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    const focusableElements = getFocusableElements(modal);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) return;

    if (e.shiftKey) {
      // Shift + Tab: if on first element, go to last
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: if on last element, go to first
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  document.addEventListener('keydown', activeFocusTrapHandler);
}

/**
 * Remove focus trap
 */
function removeFocusTrap(): void {
  if (activeFocusTrapHandler) {
    document.removeEventListener('keydown', activeFocusTrapHandler);
    activeFocusTrapHandler = null;
  }
}

/**
 * Show status message
 */
export function showStatus(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
  // Get or create toast container
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const statusDiv = document.createElement('div');
  statusDiv.className = `status-message ${type}`;
  // Use role="alert" for errors (assertive), role="status" for success/warning (polite)
  statusDiv.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-status';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Dismiss message');

  const messageText = document.createElement('span');
  messageText.textContent = message;

  statusDiv.appendChild(messageText);
  statusDiv.appendChild(closeBtn);
  container.appendChild(statusDiv);

  // Use flag to prevent double removal of event listener
  let closed = false;
  const handleClose = () => {
    if (closed) return;
    closed = true;
    closeBtn.removeEventListener('click', handleClose);
    statusDiv.remove();
  };
  closeBtn.addEventListener('click', handleClose);

  const dismissTime = type === 'success' ? CONFIG.TOAST_SUCCESS_DURATION : CONFIG.TOAST_ERROR_DURATION;
  setTimeout(() => {
    if (!closed && statusDiv.parentNode) {
      handleClose();
    }
  }, dismissTime);
}

/**
 * Show loading overlay
 */
export function showLoading(message: string = 'Loading...'): void {
  const overlay = document.getElementById('loadingOverlay');
  const text = document.getElementById('loadingText');
  if (text) text.textContent = message;
  if (overlay) overlay.classList.add('show');
}

/**
 * Hide loading overlay
 */
export function hideLoading(): void {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('show');
}

/**
 * Show confirm dialog
 */
export function showConfirm(
  message: string,
  options: { title?: string; confirmText?: string; cancelText?: string } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const messageEl = document.getElementById('confirmModalMessage');
    const confirmBtn = document.getElementById('confirmModalConfirmBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');
    const closeBtn = document.getElementById('closeConfirmModalBtn');

    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    // Store the currently focused element for restoration
    const previousFocus = document.activeElement as HTMLElement;

    titleEl.textContent = options.title || 'Confirm';
    messageEl.textContent = message;
    confirmBtn.textContent = options.confirmText || 'Confirm';
    cancelBtn.textContent = options.cancelText || 'Cancel';

    modal.classList.add('show');

    // Set up focus trap and focus the cancel button (safer default)
    setupFocusTrap(modal);
    requestAnimationFrame(() => cancelBtn.focus());

    // Use named handlers for proper cleanup
    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      modal.classList.remove('show');
      removeFocusTrap();
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      if (closeBtn) closeBtn.removeEventListener('click', handleCancel);
      // Restore focus
      if (previousFocus && previousFocus.focus) {
        previousFocus.focus();
      }
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    if (closeBtn) closeBtn.addEventListener('click', handleCancel);
  });
}

/**
 * Set form field error state
 */
export function setFieldError(fieldId: string, errorMessage?: string): void {
  const field = document.getElementById(fieldId);
  if (!field) return;

  const formGroup = field.closest('.form-group');
  if (!formGroup) return;

  formGroup.classList.add('has-error');

  // Add or update error message if provided
  if (errorMessage) {
    let errorEl = formGroup.querySelector('.error-message') as HTMLElement;
    if (!errorEl) {
      errorEl = document.createElement('span');
      errorEl.className = 'error-message';
      formGroup.appendChild(errorEl);
    }
    errorEl.textContent = errorMessage;
  }
}

/**
 * Clear form field error state
 */
export function clearFieldError(fieldId: string): void {
  const field = document.getElementById(fieldId);
  if (!field) return;

  const formGroup = field.closest('.form-group');
  if (!formGroup) return;

  formGroup.classList.remove('has-error');

  const errorEl = formGroup.querySelector('.error-message');
  if (errorEl) errorEl.textContent = '';
}

/**
 * Clear all form errors in a form
 */
export function clearFormErrors(formId: string): void {
  const form = document.getElementById(formId);
  if (!form) return;

  form.querySelectorAll('.form-group.has-error').forEach((group) => {
    group.classList.remove('has-error');
    const errorEl = group.querySelector('.error-message');
    if (errorEl) errorEl.textContent = '';
  });
}

/**
 * Open modal helper with focus management
 */
export function openModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  // Store the currently focused element for restoration
  previouslyFocusedElement = document.activeElement as HTMLElement;

  modal.classList.add('show');

  // Set up focus trap
  setupFocusTrap(modal);

  // Focus the first focusable element (or close button) after a brief delay
  // to allow the modal to become visible
  requestAnimationFrame(() => {
    const focusableElements = getFocusableElements(modal);
    const firstElement = focusableElements[0];
    if (firstElement) {
      firstElement.focus();
    }
  });
}

/**
 * Close modal helper with focus restoration
 */
export function closeModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove('show');

  // Remove focus trap and invalidate focusable elements cache
  removeFocusTrap();
  invalidateFocusableCache(modal);

  // Restore focus to the previously focused element
  if (previouslyFocusedElement && previouslyFocusedElement.focus) {
    previouslyFocusedElement.focus();
    previouslyFocusedElement = null;
  }
}
