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
});

// Add a fund via the modal
Cypress.Commands.add('addFund', (fundData) => {
  const {
    name,
    accountNumber = '',
    group = '',
    vintage = '',
    commitment = '',
    strategy = '',
    tags = []
  } = fundData;

  cy.get('#addFundBtn').click();
  cy.get('#fundModal').should('be.visible');

  cy.get('#fundName').clear().type(name);

  if (accountNumber) {
    cy.get('#accountNumber').clear().type(accountNumber);
  }
  if (vintage) {
    cy.get('#vintageYear').clear().type(vintage);
  }
  if (commitment) {
    cy.get('#commitment').clear().type(commitment);
  }

  cy.get('#fundModal .btn-primary').click();
  cy.get('#fundModal').should('not.be.visible');
});

// Add a cash flow to a fund
Cypress.Commands.add('addCashFlow', (fundName, cashFlowData) => {
  const { date, type, amount } = cashFlowData;

  // Find the fund row and click the action button
  cy.contains('tr', fundName).within(() => {
    cy.get('.action-btn').click();
  });

  cy.get('.action-dropdown').should('be.visible');
  cy.contains('Add Cash Flow').click();

  cy.get('#cashFlowModal').should('be.visible');
  cy.get('#cfDate').clear().type(date);
  cy.get('#cfType').select(type);
  cy.get('#cfAmount').clear().type(amount.toString());

  cy.get('#cashFlowModal .btn-primary').click();
  cy.get('#cashFlowModal').should('not.be.visible');
});

// Add a NAV entry to a fund
Cypress.Commands.add('addNav', (fundName, navData) => {
  const { date, amount } = navData;

  cy.contains('tr', fundName).within(() => {
    cy.get('.action-btn').click();
  });

  cy.get('.action-dropdown').should('be.visible');
  cy.contains('Add NAV').click();

  cy.get('#navModal').should('be.visible');
  cy.get('#navDate').clear().type(date);
  cy.get('#navAmount').clear().type(amount.toString());

  cy.get('#navModal .btn-primary').click();
  cy.get('#navModal').should('not.be.visible');
});

// Delete a fund
Cypress.Commands.add('deleteFund', (fundName) => {
  cy.contains('tr', fundName).within(() => {
    cy.get('.action-btn').click();
  });

  cy.get('.action-dropdown').should('be.visible');
  cy.contains('Delete Fund').click();

  // Confirm deletion in the confirm modal
  cy.get('#confirmModal').should('be.visible');
  cy.get('#confirmModal .btn-danger').click();
  cy.get('#confirmModal').should('not.be.visible');
});

// Get a table cell value by fund name and column
Cypress.Commands.add('getTableCell', (fundName, columnIndex) => {
  return cy.contains('tr', fundName).find('td').eq(columnIndex);
});

// Before each test, clear IndexedDB and localStorage
beforeEach(() => {
  cy.clearIndexedDB();
  cy.clearLocalStorage();
});
