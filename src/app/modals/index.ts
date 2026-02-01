/**
 * Modal handlers - re-exports from all modal modules
 */

// Common utilities
export {
  showStatus,
  showLoading,
  hideLoading,
  showConfirm,
  openModal,
  closeModal,
} from './common';

// Fund modal operations
export {
  setFundModalUnsavedChanges,
  hasFundModalUnsavedChanges,
  initFundFormChangeTracking,
  closeFundModalWithConfirm,
  initAccountNumberAutoFill,
  removeGroupAutoFillIndicator,
  populateFundNameDropdown,
  populateGroupDropdown,
  setSearchableSelectValue,
  showAddFundModal,
  showEditFundModal,
  showDuplicateFundModal,
  saveFundFromModal,
  deleteFund,
  showDetailsModal,
  addCashFlowRow,
  addNavRow,
  saveDetailsFromModal,
  updateDetailsSummary,
  getCurrentDetailsFundId,
  setCurrentActionFundId,
  getCurrentActionFundId,
} from './fund-modal';

// Group modal operations
export {
  showManageGroupsModal,
  saveGroupFromModal,
  deleteGroupById,
  showSyncAccountGroupsModal,
  applySyncAccountGroups,
  resetGroupModalState,
} from './group-modal';

// Fund names modal operations
export {
  showManageFundsModal,
  showEditFundNameModal,
  addEditTag,
  removeEditTag,
  saveEditedFundName,
  deleteFundNameByName,
  addNewFundNameFromModal,
  addNewFundNameInline,
  cancelNewFundNameInline,
  resetFundNamesModalState,
} from './fund-names-modal';
