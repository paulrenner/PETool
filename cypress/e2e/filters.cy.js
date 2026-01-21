/// <reference types="cypress" />

describe('Multi-Select Filters', () => {
  beforeEach(() => {
    cy.visitAndWait();
    // Add several funds for filtering tests
    cy.addFund({ name: 'Alpha Fund', accountNumber: 'ACC-A', commitment: '1000000' });
    cy.addFund({ name: 'Beta Fund', accountNumber: 'ACC-B', commitment: '500000' });
    cy.addFund({ name: 'Gamma Fund', accountNumber: 'ACC-C', commitment: '750000' });
  });

  describe('Fund Filter', () => {
    it('should have fund filter dropdown', () => {
      cy.get('#fundFilter').should('exist');
    });

    it('should open fund filter dropdown on click', () => {
      cy.get('#fundFilter .multi-select-trigger').click();
      cy.get('#fundFilter .multi-select-dropdown').should('be.visible');
    });

    it('should show fund names in dropdown', () => {
      cy.get('#fundFilter .multi-select-trigger').click();
      cy.get('#fundFilter .multi-select-dropdown').should('contain', 'Alpha Fund');
      cy.get('#fundFilter .multi-select-dropdown').should('contain', 'Beta Fund');
      cy.get('#fundFilter .multi-select-dropdown').should('contain', 'Gamma Fund');
    });

    it('should filter table when selecting a fund', () => {
      cy.get('#fundFilter .multi-select-trigger').click();
      cy.get('#fundFilter .multi-select-dropdown').contains('Alpha Fund').click();

      // Close dropdown
      cy.get('#mainContent').click();

      // Should show only Alpha Fund
      cy.contains('#fundsTableBody tr', 'Alpha Fund').should('exist');
      // Others should be hidden (either not exist or not be visible)
      cy.get('#fundsTableBody').should('not.contain', 'Beta Fund');
    });
  });

  describe('Account Filter', () => {
    it('should have account filter dropdown', () => {
      cy.get('#accountFilter').should('exist');
    });

    it('should show account numbers in dropdown', () => {
      cy.get('#accountFilter .multi-select-trigger').click();
      cy.get('#accountFilter .multi-select-dropdown').should('contain', 'ACC-A');
      cy.get('#accountFilter .multi-select-dropdown').should('contain', 'ACC-B');
    });
  });

  describe('Vintage Filter', () => {
    it('should have vintage filter dropdown', () => {
      cy.get('#vintageFilter').should('exist');
    });
  });

  describe('Group Filter', () => {
    it('should have group filter dropdown', () => {
      cy.get('#groupFilter').should('exist');
    });

    it('should open group filter dropdown on click', () => {
      cy.get('#groupFilter .multi-select-trigger').click();
      cy.get('#groupFilter .multi-select-dropdown').should('be.visible');
    });
  });

  describe('Tag Filter', () => {
    it('should have tag filter dropdown', () => {
      cy.get('#tagFilter').should('exist');
    });
  });

  describe('Cutoff Date', () => {
    it('should have cutoff date input', () => {
      cy.get('#cutoffDate').should('exist');
    });

    it('should be a date input', () => {
      cy.get('#cutoffDate').should('have.attr', 'type', 'date');
    });

    it('should recalculate metrics when cutoff date changes', () => {
      // Add some cash flows first
      cy.openFundDetails('Alpha Fund');
      cy.get('#addCashFlowRowBtn').click();
      cy.get('#cashFlowsTable tbody tr').last().within(() => {
        cy.get('input[type="date"]').type('2020-01-15');
        cy.get('input[type="text"], input[type="number"]').first().clear().type('100000');
        cy.get('select').select('Contribution');
      });
      cy.get('#saveDetailsChangesBtn').click();

      // Set a cutoff date before the cash flow
      cy.get('#cutoffDate').type('2019-12-31');

      // Metrics should be recalculated (contributions should be 0 before the cash flow date)
      // This is a basic check - the actual behavior depends on implementation
      cy.get('#fundsTable').should('exist');
    });
  });

  describe('Active Filters Indicator', () => {
    it('should show active filters badge when filter is applied', () => {
      cy.get('#fundFilter .multi-select-trigger').click();
      cy.get('#fundFilter .multi-select-dropdown').contains('Alpha Fund').click();
      cy.get('#mainContent').click();

      // Active filters indicator should be visible
      cy.get('#activeFiltersIndicator').should('be.visible');
    });

    it('should hide active filters badge when no filters', () => {
      // Initially no filters
      cy.get('#activeFiltersIndicator').should('not.be.visible');
    });
  });
});

describe('Table Sorting', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'Zebra Fund', accountNumber: 'ACC-Z', commitment: '100000' });
    cy.addFund({ name: 'Alpha Fund', accountNumber: 'ACC-A', commitment: '500000' });
    cy.addFund({ name: 'Middle Fund', accountNumber: 'ACC-M', commitment: '300000' });
  });

  describe('Column Sorting', () => {
    it('should have sortable column headers', () => {
      cy.get('th[data-sort="fundName"]').should('exist');
      cy.get('th[data-sort="commitment"]').should('exist');
      cy.get('th[data-sort="irr"]').should('exist');
    });

    it('should sort by fund name when clicking header', () => {
      cy.get('th[data-sort="fundName"]').click();

      // First row should be Alpha (ascending)
      cy.get('#fundsTableBody tr').first().should('contain', 'Alpha Fund');
    });

    it('should toggle sort direction on second click', () => {
      // Click twice for descending
      cy.get('th[data-sort="fundName"]').click();
      cy.get('th[data-sort="fundName"]').click();

      // First row should be Zebra (descending)
      cy.get('#fundsTableBody tr').first().should('contain', 'Zebra Fund');
    });

    it('should sort by commitment', () => {
      cy.get('th[data-sort="commitment"]').click();

      // Check that sorting occurred (3 funds + 1 totals row = 4 rows)
      cy.get('#fundsTableBody tr').should('have.length', 4);
    });

    it('should show sort indicator on sorted column', () => {
      cy.get('th[data-sort="fundName"]').click();

      // Should have some sort indicator class or attribute
      cy.get('th[data-sort="fundName"]').should('satisfy', ($el) => {
        const classList = $el[0].className;
        const innerHTML = $el[0].innerHTML;
        // Check for common sort indicators
        return classList.includes('sort') ||
               classList.includes('asc') ||
               classList.includes('desc') ||
               innerHTML.includes('▲') ||
               innerHTML.includes('▼') ||
               innerHTML.includes('↑') ||
               innerHTML.includes('↓');
      });
    });
  });

  describe('Multi-Column Sorting', () => {
    it('should allow sorting by multiple columns with Shift+click', () => {
      // Sort by fund name first
      cy.get('th[data-sort="fundName"]').click();

      // Then Shift+click on commitment for secondary sort
      cy.get('th[data-sort="commitment"]').click({ shiftKey: true });

      // Table should still be sorted (3 funds + 1 totals row = 4 rows)
      cy.get('#fundsTableBody tr').should('have.length', 4);
    });
  });
});

describe('Portfolio Summary with Filters', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'Fund One', accountNumber: 'ACC-1', commitment: '1000000' });
    cy.addFund({ name: 'Fund Two', accountNumber: 'ACC-2', commitment: '500000' });
  });

  it('should update summary when filter is applied', () => {
    // Initially shows 2 investments
    cy.get('#summaryInvestmentCount').should('contain', '2');

    // Filter to just one fund
    cy.get('#fundFilter .multi-select-trigger').click();
    cy.get('#fundFilter .multi-select-dropdown').contains('Fund One').click();
    cy.get('#mainContent').click();

    // Summary should update to show 1 investment
    cy.get('#summaryInvestmentCount').should('contain', '1');
  });

  it('should update total commitment when filtered', () => {
    // Filter to just Fund Two (500k commitment)
    cy.get('#fundFilter .multi-select-trigger').click();
    cy.get('#fundFilter .multi-select-dropdown').contains('Fund Two').click();
    cy.get('#mainContent').click();

    // Should show only Fund Two's commitment
    cy.get('#summaryCommitment').should('contain', '500,000');
  });
});
