/**
 * Common modal utilities - status messages, loading, confirm dialogs, modal open/close
 */

/**
 * Show status message
 */
export function showStatus(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
  const statusDiv = document.createElement('div');
  statusDiv.className = `status-message ${type}`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-status';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => statusDiv.remove();

  const messageText = document.createElement('span');
  messageText.textContent = message;

  statusDiv.appendChild(messageText);
  statusDiv.appendChild(closeBtn);
  document.body.appendChild(statusDiv);

  const dismissTime = type === 'success' ? 3000 : 8000;
  setTimeout(() => {
    if (statusDiv.parentNode) {
      statusDiv.remove();
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

    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    titleEl.textContent = options.title || 'Confirm';
    messageEl.textContent = message;
    confirmBtn.textContent = options.confirmText || 'Confirm';
    cancelBtn.textContent = options.cancelText || 'Cancel';

    modal.classList.add('show');

    const cleanup = () => {
      modal.classList.remove('show');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

/**
 * Open modal helper
 */
export function openModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('show');
}

/**
 * Close modal helper
 */
export function closeModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('show');
}
