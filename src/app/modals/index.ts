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
  showAddFundModal,
  showEditFundModal,
  showDuplicateFundModal,
  saveFundFromModal,
  deleteFund,
  showDetailsModal,
  addCashFlowRow,
  addNavRow,
  saveDetailsFromModal,
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
} from './fund-names-modal';
