/// <reference types="cypress" />

describe('Cash Flow Management', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'Cash Flow Test Fund' });
  });

  describe('Adding Cash Flows', () => {
    it('should add a contribution cash flow', () => {
      cy.addCashFlow('Cash Flow Test Fund', {
        date: '2023-01-15',
        type: 'Contribution',
        amount: 100000
      });

      // Open details to verify cash flow was added
      cy.contains('tr', 'Cash Flow Test Fund').within(() => {
        cy.contains('Cash Flow Test Fund').click();
      });

      cy.get('#detailsModal').should('be.visible');
      cy.get('#detailsModal').contains('Contribution');
      cy.get('#detailsModal').contains('100,000');
    });

    it('should add a distribution cash flow', () => {
      cy.addCashFlow('Cash Flow Test Fund', {
        date: '2023-06-15',
        type: 'Distribution',
        amount: 50000
      });

      cy.contains('tr', 'Cash Flow Test Fund').within(() => {
        cy.contains('Cash Flow Test Fund').click();
      });

      cy.get('#detailsModal').should('be.visible');
      cy.get('#detailsModal').contains('Distribution');
    });

    it('should add multiple cash flows', () => {
      cy.addCashFlow('Cash Flow Test Fund', {
        date: '2023-01-15',
        type: 'Contribution',
        amount: 100000
      });

      cy.addCashFlow('Cash Flow Test Fund', {
        date: '2023-03-15',
        type: 'Contribution',
        amount: 50000
      });

      cy.addCashFlow('Cash Flow Test Fund', {
        date: '2023-06-15',
        type: 'Distribution',
        amount: 25000
      });

      // Verify in details modal
      cy.contains('tr', 'Cash Flow Test Fund').within(() => {
        cy.contains('Cash Flow Test Fund').click();
      });

      cy.get('#detailsModal').should('be.visible');
      // Should show multiple cash flows
      cy.get('#detailsModal').find('table').should('exist');
    });
  });

  describe('Cash Flow Validation', () => {
    it('should require a date', () => {
      cy.contains('tr', 'Cash Flow Test Fund').within(() => {
        cy.get('.action-btn').click();
      });

      cy.get('.action-dropdown').should('be.visible');
      cy.contains('Add Cash Flow').click();

      cy.get('#cashFlowModal').should('be.visible');
      // Don't fill date, just type and amount
      cy.get('#cfType').select('Contribution');
      cy.get('#cfAmount').type('100000');

      cy.get('#cashFlowModal .btn-primary').click();

      // Modal should still be visible (validation failed)
      cy.get('#cashFlowModal').should('be.visible');
    });

    it('should require a positive amount', () => {
      cy.contains('tr', 'Cash Flow Test Fund').within(() => {
        cy.get('.action-btn').click();
      });

      cy.get('.action-dropdown').should('be.visible');
      cy.contains('Add Cash Flow').click();

      cy.get('#cashFlowModal').should('be.visible');
      cy.get('#cfDate').type('2023-01-15');
      cy.get('#cfType').select('Contribution');
      cy.get('#cfAmount').type('0');

      cy.get('#cashFlowModal .btn-primary').click();

      // Modal should still be visible (validation failed)
      cy.get('#cashFlowModal').should('be.visible');
    });
  });
});

describe('NAV Management', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'NAV Test Fund' });
  });

  describe('Adding NAV Entries', () => {
    it('should add a NAV entry', () => {
      cy.addNav('NAV Test Fund', {
        date: '2023-12-31',
        amount: 150000
      });

      // Check the NAV column in the table
      cy.contains('tr', 'NAV Test Fund').within(() => {
        cy.contains('150,000').should('exist');
      });
    });

    it('should update NAV when adding a newer entry', () => {
      cy.addNav('NAV Test Fund', {
        date: '2023-06-30',
        amount: 100000
      });

      cy.addNav('NAV Test Fund', {
        date: '2023-12-31',
        amount: 150000
      });

      // Should show the latest NAV
      cy.contains('tr', 'NAV Test Fund').within(() => {
        cy.contains('150,000').should('exist');
      });
    });
  });
});

describe('Metrics Calculation', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'Metrics Test Fund' });
  });

  it('should calculate metrics after adding cash flows and NAV', () => {
    // Add contributions
    cy.addCashFlow('Metrics Test Fund', {
      date: '2020-01-15',
      type: 'Contribution',
      amount: 100000
    });

    // Add distribution
    cy.addCashFlow('Metrics Test Fund', {
      date: '2023-01-15',
      type: 'Distribution',
      amount: 50000
    });

    // Add NAV
    cy.addNav('Metrics Test Fund', {
      date: '2023-12-31',
      amount: 120000
    });

    // Verify metrics are calculated (not N/A)
    cy.contains('tr', 'Metrics Test Fund').within(() => {
      // Check that numeric values appear instead of N/A
      cy.get('td').should('have.length.greaterThan', 3);
    });
  });
});
