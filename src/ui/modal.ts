/**
 * Centralized modal management
 */

import { AppState } from '../core/state';

export interface ModalShowOptions {
  onShow?: (modal: HTMLElement) => void;
}

export interface ModalCloseOptions {
  checkUnsaved?: boolean;
  onClose?: (modal: HTMLElement) => void;
}

// Forward declaration - will be implemented in the main app
let showConfirmFn: (
  message: string,
  options?: { title?: string; confirmText?: string; cancelText?: string }
) => Promise<boolean>;

export function setShowConfirmFn(
  fn: (
    message: string,
    options?: { title?: string; confirmText?: string; cancelText?: string }
  ) => Promise<boolean>
): void {
  showConfirmFn = fn;
}

export const Modal = {
  /**
   * Show a modal by ID
   */
  show(modalId: string, options: ModalShowOptions = {}): void {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
      if (options.onShow) options.onShow(modal);
    }
  },

  /**
   * Close a modal by ID
   */
  async close(modalId: string, options: ModalCloseOptions = {}): Promise<boolean> {
    const modal = document.getElementById(modalId);
    if (!modal) return false;

    // Check for unsaved changes if specified
    if (options.checkUnsaved && AppState.hasUnsavedChanges) {
      if (showConfirmFn) {
        const confirmed = await showConfirmFn(
          'You have unsaved changes. Are you sure you want to close without saving?',
          {
            title: 'Unsaved Changes',
            confirmText: 'Discard',
            cancelText: 'Keep Editing',
          }
        );
        if (!confirmed) {
          return false;
        }
      }
    }

    modal.classList.remove('show');
    if (options.onClose) options.onClose(modal);
    return true;
  },

  /**
   * Check if a modal is open
   */
  isOpen(modalId: string): boolean {
    const modal = document.getElementById(modalId);
    return modal ? modal.classList.contains('show') : false;
  },
};
