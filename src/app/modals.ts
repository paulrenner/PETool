/**
 * Modal handlers - re-exports from modals/ directory
 *
 * This file maintains backward compatibility with existing imports.
 * The actual implementation has been split into:
 * - modals/common.ts - Shared utilities (status, loading, confirm, open/close)
 * - modals/fund-modal.ts - Fund add/edit/details/duplicate operations
 * - modals/group-modal.ts - Group management and sync operations
 * - modals/fund-names-modal.ts - Fund name and tag management
 */

export * from './modals/index';
