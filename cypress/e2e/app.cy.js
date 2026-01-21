/// <reference types="cypress" />

describe('Application Basics', () => {
  beforeEach(() => {
    cy.visitAndWait();
  });

  describe('Page Load', () => {
    it('should load the application', () => {
      cy.get('h1').contains('PE Fund Manager');
    });

    it('should display the main table', () => {
      cy.get('#fundsTable').should('be.visible');
    });

    it('should show the Add Fund button', () => {
      cy.get('#addFundBtn').should('be.visible').contains('Add Fund');
    });

    it('should show the search input', () => {
      cy.get('#searchInput').should('be.visible');
    });
  });

  describe('Theme Toggle', () => {
    it('should toggle dark mode', () => {
      // Check initial state (light mode)
      cy.get('html').should('not.have.attr', 'data-theme', 'dark');

      // Click theme toggle
      cy.get('#themeToggle').click();

      // Should be in dark mode
      cy.get('html').should('have.attr', 'data-theme', 'dark');

      // Toggle back
      cy.get('#themeToggle').click();
      cy.get('html').should('not.have.attr', 'data-theme', 'dark');
    });

    it('should persist theme preference', () => {
      cy.get('#themeToggle').click();
      cy.get('html').should('have.attr', 'data-theme', 'dark');

      // Reload page
      cy.reload();
      cy.get('#fundsTable').should('exist');

      // Theme should be preserved
      cy.get('html').should('have.attr', 'data-theme', 'dark');
    });
  });

  describe('Export Functionality', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Export Test Fund' });
    });

    it('should show export button', () => {
      cy.get('#exportBtn').should('be.visible');
    });

    it('should open export options', () => {
      cy.get('#exportBtn').click();
      // Export menu or modal should appear
      cy.get('.export-menu, #exportModal').should('be.visible');
    });
  });

  describe('Import Functionality', () => {
    it('should show import button', () => {
      cy.get('#importBtn').should('be.visible');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should focus search on Ctrl+F', () => {
      cy.get('body').type('{ctrl}f');
      cy.get('#searchInput').should('be.focused');
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no funds exist', () => {
      cy.get('#fundsTable tbody tr').should('have.length', 0);
    });

    it('should show funds after adding one', () => {
      cy.addFund({ name: 'First Fund' });
      cy.get('#fundsTable tbody tr').should('have.length', 1);
    });
  });

  describe('Responsive Design', () => {
    it('should work on mobile viewport', () => {
      cy.viewport('iphone-x');
      cy.get('#addFundBtn').should('be.visible');
      cy.get('#fundsTable').should('be.visible');
    });

    it('should work on tablet viewport', () => {
      cy.viewport('ipad-2');
      cy.get('#addFundBtn').should('be.visible');
      cy.get('#fundsTable').should('be.visible');
    });
  });
});

describe('Data Persistence', () => {
  it('should persist funds across page reloads', () => {
    cy.visitAndWait();
    cy.addFund({ name: 'Persistent Fund' });
    cy.contains('tr', 'Persistent Fund').should('exist');

    // Reload the page (without clearing IndexedDB)
    cy.visit('/');
    cy.get('#fundsTable').should('exist');

    // Fund should still be there
    cy.contains('tr', 'Persistent Fund').should('exist');
  });
});
