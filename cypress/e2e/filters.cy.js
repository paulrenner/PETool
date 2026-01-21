/// <reference types="cypress" />

describe('Filtering', () => {
  beforeEach(() => {
    cy.visitAndWait();
    // Add several funds for filtering tests
    cy.addFund({ name: 'Alpha Fund' });
    cy.addFund({ name: 'Beta Fund' });
    cy.addFund({ name: 'Gamma Fund' });
  });

  describe('Search Filter', () => {
    it('should filter funds by name', () => {
      cy.get('#searchInput').type('Alpha');

      cy.contains('tr', 'Alpha Fund').should('be.visible');
      cy.contains('tr', 'Beta Fund').should('not.exist');
      cy.contains('tr', 'Gamma Fund').should('not.exist');
    });

    it('should show all funds when search is cleared', () => {
      cy.get('#searchInput').type('Alpha');
      cy.contains('tr', 'Beta Fund').should('not.exist');

      cy.get('#searchInput').clear();

      cy.contains('tr', 'Alpha Fund').should('be.visible');
      cy.contains('tr', 'Beta Fund').should('be.visible');
      cy.contains('tr', 'Gamma Fund').should('be.visible');
    });

    it('should be case insensitive', () => {
      cy.get('#searchInput').type('alpha');
      cy.contains('tr', 'Alpha Fund').should('be.visible');

      cy.get('#searchInput').clear().type('BETA');
      cy.contains('tr', 'Beta Fund').should('be.visible');
    });

    it('should filter by partial match', () => {
      cy.get('#searchInput').type('Fund');

      cy.contains('tr', 'Alpha Fund').should('be.visible');
      cy.contains('tr', 'Beta Fund').should('be.visible');
      cy.contains('tr', 'Gamma Fund').should('be.visible');
    });

    it('should show no results for non-matching search', () => {
      cy.get('#searchInput').type('NonExistent');

      cy.get('#fundsTable tbody tr').should('have.length', 0);
    });
  });

  describe('Filter Persistence', () => {
    it('should maintain filter after adding a fund', () => {
      cy.get('#searchInput').type('Alpha');
      cy.contains('tr', 'Alpha Fund').should('be.visible');
      cy.contains('tr', 'Beta Fund').should('not.exist');

      // Add a new fund
      cy.addFund({ name: 'Alpha Two' });

      // Filter should still be active
      cy.contains('tr', 'Alpha Fund').should('be.visible');
      cy.contains('tr', 'Alpha Two').should('be.visible');
      cy.contains('tr', 'Beta Fund').should('not.exist');
    });
  });
});

describe('Table Sorting', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'Zebra Fund' });
    cy.addFund({ name: 'Alpha Fund' });
    cy.addFund({ name: 'Middle Fund' });
  });

  it('should sort by fund name ascending', () => {
    // Click the Fund Name column header
    cy.get('th').contains('Fund Name').click();

    // Get all fund names and verify order
    cy.get('#fundsTable tbody tr').then(($rows) => {
      const names = [...$rows].map(row =>
        row.querySelector('td:first-child')?.textContent?.trim()
      );
      expect(names[0]).to.equal('Alpha Fund');
    });
  });

  it('should toggle sort direction on second click', () => {
    // Click twice for descending
    cy.get('th').contains('Fund Name').click();
    cy.get('th').contains('Fund Name').click();

    cy.get('#fundsTable tbody tr').first().should('contain', 'Zebra Fund');
  });
});
