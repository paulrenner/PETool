// Cypress E2E Support File
// Custom commands and global configuration

// Clear IndexedDB before each test for a clean slate
Cypress.Commands.add('clearIndexedDB', () => {
  cy.window().then((win) => {
    return new Cypress.Promise((resolve) => {
      const deleteRequest = win.indexedDB.deleteDatabase('FundsDB');
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => resolve();
      deleteRequest.onblocked = () => resolve();
    });
  });
});

// Reload and wait for app to be ready
Cypress.Commands.add('visitAndWait', () => {
  cy.visit('/');
  cy.get('#fundsTable').should('exist');
  // Wait for loading overlay to disappear
  cy.get('#loadingOverlay').should('not.be.visible');
});

// Open sidebar
Cypress.Commands.add('openSidebar', () => {
  cy.get('#toggleSidebarBtn').click();
  cy.get('#sidebar').should('be.visible');
});

// Close sidebar
Cypress.Commands.add('closeSidebar', () => {
  cy.get('#closeSidebarBtn').click();
  cy.get('#sidebar').should('not.be.visible');
});

// Add a fund via the sidebar and modal
Cypress.Commands.add('addFund', (fundData) => {
  const {
    name,
    accountNumber = 'Test Account',
    commitment = '100000'
  } = fundData;

  // Open sidebar and click New Investment
  cy.openSidebar();
  cy.get('#sidebarNewInvestment').click();

  cy.get('#fundModal').should('be.visible');

  // Fund name is a select - we need to add a new fund name first
  // Check if we need to add a new fund name option
  cy.get('#fundName').then($select => {
    const options = [...$select.find('option')].map(o => o.text);
    if (!options.includes(name)) {
      // Select "Add new fund..." option or type in the select
      // The select should have an option to add new
      cy.get('#fundName').select('__new__').then(() => {
        cy.get('#newFundNameContainer').should('be.visible');
        cy.get('#newFundNameInline').type(name);
        cy.get('#addNewFundNameBtn').click();
      });
    } else {
      cy.get('#fundName').select(name);
    }
  });

  cy.get('#accountNumber').clear().type(accountNumber);
  cy.get('#commitment').clear().type(commitment);

  cy.get('#saveFundBtn').click();
  cy.get('#fundModal').should('not.be.visible');
});

// Add a fund with a pre-existing fund name
Cypress.Commands.add('addFundWithExistingName', (fundData) => {
  const {
    name,
    accountNumber = 'Test Account',
    commitment = '100000'
  } = fundData;

  cy.openSidebar();
  cy.get('#sidebarNewInvestment').click();
  cy.get('#fundModal').should('be.visible');

  cy.get('#fundName').select(name);
  cy.get('#accountNumber').clear().type(accountNumber);
  cy.get('#commitment').clear().type(commitment);

  cy.get('#saveFundBtn').click();
  cy.get('#fundModal').should('not.be.visible');
});

// Open fund details modal
Cypress.Commands.add('openFundDetails', (fundName) => {
  // Click on the fund name in the table to open details
  cy.contains('#fundsTableBody tr', fundName).within(() => {
    cy.get('td').first().click();
  });
  cy.get('#detailsModal').should('be.visible');
});

// Add a cash flow via the details modal
Cypress.Commands.add('addCashFlow', (fundName, cashFlowData) => {
  const { date, type, amount } = cashFlowData;

  cy.openFundDetails(fundName);

  // Click add cash flow button
  cy.get('#addCashFlowRowBtn').click();

  // Fill in the new row (last row in the cash flows table)
  cy.get('#cashFlowsTable tbody tr').last().within(() => {
    cy.get('input[type="date"]').type(date);
    cy.get('input[type="text"], input[type="number"]').first().clear().type(amount.toString());
    cy.get('select').select(type);
  });

  // Save changes
  cy.get('#saveDetailsChangesBtn').click();
  cy.get('#detailsModal').should('not.be.visible');
});

// Add a NAV entry via the details modal
Cypress.Commands.add('addNav', (fundName, navData) => {
  const { date, amount } = navData;

  cy.openFundDetails(fundName);

  // Click add NAV button
  cy.get('#addNavRowBtn').click();

  // Fill in the new row (last row in the NAV table)
  cy.get('#navTable tbody tr').last().within(() => {
    cy.get('input[type="date"]').type(date);
    cy.get('input[type="text"], input[type="number"]').clear().type(amount.toString());
  });

  // Save changes
  cy.get('#saveDetailsChangesBtn').click();
  cy.get('#detailsModal').should('not.be.visible');
});

// Open action dropdown for a fund
Cypress.Commands.add('openActionMenu', (fundName) => {
  cy.contains('#fundsTableBody tr', fundName).within(() => {
    cy.get('td').last().find('button, .action-btn, [role="button"]').click();
  });
  cy.get('#actionDropdown').should('be.visible');
});

// Delete a fund
Cypress.Commands.add('deleteFund', (fundName) => {
  cy.openActionMenu(fundName);
  cy.get('#actionDelete').click();

  // Confirm deletion
  cy.get('#confirmModal').should('be.visible');
  cy.get('#confirmModalConfirmBtn').click();
  cy.get('#confirmModal').should('not.be.visible');
});

// Edit a fund
Cypress.Commands.add('editFund', (fundName) => {
  cy.openActionMenu(fundName);
  cy.get('#actionEdit').click();
  cy.get('#fundModal').should('be.visible');
});

// Toggle dark mode via sidebar
Cypress.Commands.add('toggleDarkMode', () => {
  cy.openSidebar();
  cy.get('#sidebarDarkModeCheckbox').click();
  cy.closeSidebar();
});

// Get a table cell value by fund name and column index
Cypress.Commands.add('getTableCell', (fundName, columnIndex) => {
  return cy.contains('#fundsTableBody tr', fundName).find('td').eq(columnIndex);
});

// Before each test, clear IndexedDB and localStorage
beforeEach(() => {
  cy.clearIndexedDB();
  cy.clearLocalStorage();
});
