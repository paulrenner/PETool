/// <reference types="cypress" />

describe('Fund Management', () => {
  beforeEach(() => {
    cy.visitAndWait();
  });

  describe('Adding Funds', () => {
    it('should add a new fund with basic information', () => {
      cy.addFund({ name: 'Test Fund Alpha' });

      // Verify the fund appears in the table
      cy.contains('tr', 'Test Fund Alpha').should('exist');
    });

    it('should add a fund with all fields populated', () => {
      cy.get('#addFundBtn').click();
      cy.get('#fundModal').should('be.visible');

      cy.get('#fundName').type('Complete Fund');
      cy.get('#accountNumber').type('ACC-001');
      cy.get('#vintageYear').type('2020');
      cy.get('#commitment').type('1000000');

      cy.get('#fundModal .btn-primary').click();
      cy.get('#fundModal').should('not.be.visible');

      cy.contains('tr', 'Complete Fund').should('exist');
    });

    it('should show validation error for empty fund name', () => {
      cy.get('#addFundBtn').click();
      cy.get('#fundModal').should('be.visible');

      // Try to save without entering a name
      cy.get('#fundModal .btn-primary').click();

      // Modal should still be visible (validation failed)
      cy.get('#fundModal').should('be.visible');
    });

    it('should add multiple funds', () => {
      cy.addFund({ name: 'Fund One' });
      cy.addFund({ name: 'Fund Two' });
      cy.addFund({ name: 'Fund Three' });

      cy.contains('tr', 'Fund One').should('exist');
      cy.contains('tr', 'Fund Two').should('exist');
      cy.contains('tr', 'Fund Three').should('exist');
    });
  });

  describe('Editing Funds', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Editable Fund' });
    });

    it('should edit an existing fund', () => {
      cy.contains('tr', 'Editable Fund').within(() => {
        cy.get('.action-btn').click();
      });

      cy.get('.action-dropdown').should('be.visible');
      cy.contains('Edit Fund').click();

      cy.get('#fundModal').should('be.visible');
      cy.get('#fundName').clear().type('Renamed Fund');
      cy.get('#fundModal .btn-primary').click();

      cy.contains('tr', 'Renamed Fund').should('exist');
      cy.contains('tr', 'Editable Fund').should('not.exist');
    });
  });

  describe('Deleting Funds', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Fund To Delete' });
    });

    it('should delete a fund', () => {
      cy.contains('tr', 'Fund To Delete').should('exist');
      cy.deleteFund('Fund To Delete');
      cy.contains('tr', 'Fund To Delete').should('not.exist');
    });

    it('should cancel fund deletion', () => {
      cy.contains('tr', 'Fund To Delete').within(() => {
        cy.get('.action-btn').click();
      });

      cy.get('.action-dropdown').should('be.visible');
      cy.contains('Delete Fund').click();

      cy.get('#confirmModal').should('be.visible');
      cy.get('#confirmModal .btn-secondary').click(); // Cancel button

      cy.contains('tr', 'Fund To Delete').should('exist');
    });
  });

  describe('Fund Details', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Details Fund' });
    });

    it('should show fund details when clicking on fund name', () => {
      cy.contains('tr', 'Details Fund').within(() => {
        cy.contains('Details Fund').click();
      });

      cy.get('#detailsModal').should('be.visible');
      cy.get('#detailsModal').contains('Details Fund');
    });

    it('should close details modal', () => {
      cy.contains('tr', 'Details Fund').within(() => {
        cy.contains('Details Fund').click();
      });

      cy.get('#detailsModal').should('be.visible');
      cy.get('#detailsModal .close-btn').click();
      cy.get('#detailsModal').should('not.be.visible');
    });
  });
});
