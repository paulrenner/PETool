/// <reference types="cypress" />

describe('Cash Flow Management', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'Cash Flow Test Fund', accountNumber: 'ACC-CF', commitment: '1000000' });
  });

  describe('Adding Cash Flows', () => {
    it('should show Add Cash Flow button in details modal', () => {
      cy.openFundDetails('Cash Flow Test Fund');
      cy.get('#addCashFlowRowBtn').should('be.visible');
    });

    it('should add a new cash flow row when clicking Add Cash Flow', () => {
      cy.openFundDetails('Cash Flow Test Fund');

      // Get initial row count
      cy.get('#cashFlowsTable tbody tr').then($rows => {
        const initialCount = $rows.length;

        cy.get('#addCashFlowRowBtn').click();

        // Should have one more row
        cy.get('#cashFlowsTable tbody tr').should('have.length', initialCount + 1);
      });
    });

    it('should have date, amount, and type fields in cash flow row', () => {
      cy.openFundDetails('Cash Flow Test Fund');
      cy.get('#addCashFlowRowBtn').click();

      cy.get('#cashFlowsTable tbody tr').last().within(() => {
        cy.get('input[type="date"]').should('exist');
        cy.get('input[type="text"], input[type="number"]').should('exist');
        cy.get('select').should('exist');
      });
    });

    it('should save cash flow when clicking Save Changes', () => {
      cy.openFundDetails('Cash Flow Test Fund');
      cy.get('#addCashFlowRowBtn').click();

      cy.get('#cashFlowsTable tbody tr').last().within(() => {
        cy.get('input[type="date"]').type('2023-06-15');
        cy.get('input[type="text"], input[type="number"]').first().clear().type('100000');
        cy.get('select').select('Contribution');
      });

      cy.get('#saveDetailsChangesBtn').click();
      cy.get('#detailsModal').should('not.be.visible');

      // Reopen and verify cash flow was saved
      cy.openFundDetails('Cash Flow Test Fund');
      cy.get('#cashFlowsTable tbody').should('contain', '100,000');
    });
  });

  describe('Cash Flow Types', () => {
    it('should have Contribution option', () => {
      cy.openFundDetails('Cash Flow Test Fund');
      cy.get('#addCashFlowRowBtn').click();

      cy.get('#cashFlowsTable tbody tr').last().within(() => {
        cy.get('select').should('contain', 'Contribution');
      });
    });

    it('should have Distribution option', () => {
      cy.openFundDetails('Cash Flow Test Fund');
      cy.get('#addCashFlowRowBtn').click();

      cy.get('#cashFlowsTable tbody tr').last().within(() => {
        cy.get('select').should('contain', 'Distribution');
      });
    });
  });

  describe('Deleting Cash Flows', () => {
    it('should have delete button for cash flow rows', () => {
      cy.openFundDetails('Cash Flow Test Fund');
      cy.get('#addCashFlowRowBtn').click();

      cy.get('#cashFlowsTable tbody tr').last().within(() => {
        cy.get('button, .delete-btn, [title*="delete" i], [title*="remove" i]').should('exist');
      });
    });
  });
});

describe('NAV Management', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'NAV Test Fund', accountNumber: 'ACC-NAV', commitment: '500000' });
  });

  describe('Adding NAV Entries', () => {
    it('should show Add Value button in details modal', () => {
      cy.openFundDetails('NAV Test Fund');
      cy.get('#addNavRowBtn').should('be.visible');
    });

    it('should add a new NAV row when clicking Add Value', () => {
      cy.openFundDetails('NAV Test Fund');

      cy.get('#navTable tbody tr').then($rows => {
        const initialCount = $rows.length;

        cy.get('#addNavRowBtn').click();

        cy.get('#navTable tbody tr').should('have.length', initialCount + 1);
      });
    });

    it('should have date and amount fields in NAV row', () => {
      cy.openFundDetails('NAV Test Fund');
      cy.get('#addNavRowBtn').click();

      cy.get('#navTable tbody tr').last().within(() => {
        cy.get('input[type="date"]').should('exist');
        cy.get('input[type="text"], input[type="number"]').should('exist');
      });
    });

    it('should save NAV when clicking Save Changes', () => {
      cy.openFundDetails('NAV Test Fund');
      cy.get('#addNavRowBtn').click();

      cy.get('#navTable tbody tr').last().within(() => {
        cy.get('input[type="date"]').type('2023-12-31');
        cy.get('input[type="text"], input[type="number"]').clear().type('550000');
      });

      cy.get('#saveDetailsChangesBtn').click();
      cy.get('#detailsModal').should('not.be.visible');

      // Verify NAV appears in main table
      cy.contains('#fundsTableBody tr', 'NAV Test Fund').should('contain', '550,000');
    });
  });
});

describe('Metrics Calculation', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'Metrics Test Fund', accountNumber: 'ACC-MET', commitment: '1000000' });
  });

  it('should show contributions total in details summary', () => {
    // Add a contribution
    cy.openFundDetails('Metrics Test Fund');
    cy.get('#addCashFlowRowBtn').click();

    cy.get('#cashFlowsTable tbody tr').last().within(() => {
      cy.get('input[type="date"]').type('2020-01-15');
      cy.get('input[type="text"], input[type="number"]').first().clear().type('250000');
      cy.get('select').select('Contribution');
    });

    cy.get('#saveDetailsChangesBtn').click();

    // Reopen and check summary
    cy.openFundDetails('Metrics Test Fund');
    cy.get('#detailsSummaryContributions').should('contain', '250,000');
  });

  it('should show distributions total in details summary', () => {
    // First add a contribution
    cy.openFundDetails('Metrics Test Fund');
    cy.get('#addCashFlowRowBtn').click();
    cy.get('#cashFlowsTable tbody tr').last().within(() => {
      cy.get('input[type="date"]').type('2020-01-15');
      cy.get('input[type="text"], input[type="number"]').first().clear().type('250000');
      cy.get('select').select('Contribution');
    });
    cy.get('#saveDetailsChangesBtn').click();

    // Add a distribution
    cy.openFundDetails('Metrics Test Fund');
    cy.get('#addCashFlowRowBtn').click();
    cy.get('#cashFlowsTable tbody tr').last().within(() => {
      cy.get('input[type="date"]').type('2023-06-15');
      cy.get('input[type="text"], input[type="number"]').first().clear().type('100000');
      cy.get('select').select('Distribution');
    });
    cy.get('#saveDetailsChangesBtn').click();

    // Check summary
    cy.openFundDetails('Metrics Test Fund');
    cy.get('#detailsSummaryDistributions').should('contain', '100,000');
  });

  it('should calculate outstanding commitment', () => {
    cy.openFundDetails('Metrics Test Fund');
    // With no cash flows, outstanding should equal commitment
    cy.get('#detailsSummaryOutstanding').should('contain', '1,000,000');
  });
});

describe('Details Modal Summary', () => {
  beforeEach(() => {
    cy.visitAndWait();
    cy.addFund({ name: 'Summary Test Fund', accountNumber: 'ACC-SUM', commitment: '750000' });
  });

  it('should display all summary stats', () => {
    cy.openFundDetails('Summary Test Fund');

    cy.get('#detailsSummaryCommitment').should('exist');
    cy.get('#detailsSummaryContributions').should('exist');
    cy.get('#detailsSummaryDistributions').should('exist');
    cy.get('#detailsSummaryValue').should('exist');
    cy.get('#detailsSummaryReturn').should('exist');
    cy.get('#detailsSummaryOutstanding').should('exist');
  });

  it('should show commitment value', () => {
    cy.openFundDetails('Summary Test Fund');
    cy.get('#detailsSummaryCommitment').should('contain', '750,000');
  });
});
