/// <reference types="cypress" />

describe('Fund Management', () => {
  beforeEach(() => {
    cy.visitAndWait();
  });

  describe('Adding Funds', () => {
    it('should open new investment modal from sidebar', () => {
      cy.openSidebar();
      cy.get('#sidebarNewInvestment').click();
      cy.get('#fundModal').should('be.visible');
      cy.get('#fundModalTitle').should('contain', 'Add New Investment');
    });

    it('should add a new fund with basic information', () => {
      cy.addFund({
        name: 'Test Fund Alpha',
        accountNumber: 'ACC-001',
        commitment: '1000000'
      });

      // Verify the fund appears in the table
      cy.contains('#fundsTableBody tr', 'Test Fund Alpha').should('exist');
      cy.contains('#fundsTableBody tr', 'ACC-001').should('exist');
    });

    it('should show validation error for missing required fields', () => {
      cy.openSidebar();
      cy.get('#sidebarNewInvestment').click();
      cy.get('#fundModal').should('be.visible');

      // Try to save without entering required fields
      cy.get('#saveFundBtn').click();

      // Modal should still be visible (validation failed)
      cy.get('#fundModal').should('be.visible');
    });

    it('should close modal on cancel', () => {
      cy.openSidebar();
      cy.get('#sidebarNewInvestment').click();
      cy.get('#fundModal').should('be.visible');

      cy.get('#cancelFundModalBtn').click();
      cy.get('#fundModal').should('not.be.visible');
    });

    it('should close modal on X button', () => {
      cy.openSidebar();
      cy.get('#sidebarNewInvestment').click();
      cy.get('#fundModal').should('be.visible');

      cy.get('#closeFundModalBtn').click();
      cy.get('#fundModal').should('not.be.visible');
    });

    it('should update summary counts after adding fund', () => {
      cy.get('#summaryInvestmentCount').should('contain', '0');

      cy.addFund({ name: 'Count Test Fund', accountNumber: 'ACC-001', commitment: '500000' });

      cy.get('#summaryInvestmentCount').should('contain', '1');
    });
  });

  describe('Editing Funds', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Editable Fund', accountNumber: 'ACC-EDIT', commitment: '750000' });
    });

    it('should open edit modal via action menu', () => {
      cy.editFund('Editable Fund');
      cy.get('#fundModal').should('be.visible');
    });

    it('should update fund account number', () => {
      cy.editFund('Editable Fund');

      cy.get('#accountNumber').clear().type('ACC-UPDATED');
      cy.get('#saveFundBtn').click();

      cy.get('#fundModal').should('not.be.visible');
      cy.contains('#fundsTableBody tr', 'ACC-UPDATED').should('exist');
    });

    it('should update fund commitment', () => {
      cy.editFund('Editable Fund');

      cy.get('#commitment').clear().type('1500000');
      cy.get('#saveFundBtn').click();

      cy.get('#fundModal').should('not.be.visible');
      cy.contains('#fundsTableBody tr', '1,500,000').should('exist');
    });
  });

  describe('Deleting Funds', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Fund To Delete', accountNumber: 'ACC-DEL', commitment: '100000' });
    });

    it('should delete a fund via action menu', () => {
      cy.contains('#fundsTableBody tr', 'Fund To Delete').should('exist');
      cy.deleteFund('Fund To Delete');
      cy.contains('#fundsTableBody tr', 'Fund To Delete').should('not.exist');
    });

    it('should show confirmation modal before deleting', () => {
      cy.openActionMenu('Fund To Delete');
      cy.get('#actionDelete').click();

      cy.get('#confirmModal').should('be.visible');
      cy.get('#confirmModalMessage').should('not.be.empty');
    });

    it('should cancel fund deletion', () => {
      cy.openActionMenu('Fund To Delete');
      cy.get('#actionDelete').click();

      cy.get('#confirmModal').should('be.visible');
      cy.get('#confirmModalCancelBtn').click();

      cy.get('#confirmModal').should('not.be.visible');
      cy.contains('#fundsTableBody tr', 'Fund To Delete').should('exist');
    });

    it('should update summary counts after deletion', () => {
      cy.get('#summaryInvestmentCount').should('contain', '1');

      cy.deleteFund('Fund To Delete');

      cy.get('#summaryInvestmentCount').should('contain', '0');
    });
  });

  describe('Fund Details', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Details Fund', accountNumber: 'ACC-DET', commitment: '2000000' });
    });

    it('should open details modal when clicking on fund row', () => {
      cy.openFundDetails('Details Fund');
      cy.get('#detailsModal').should('be.visible');
    });

    it('should show fund name in details modal title', () => {
      cy.openFundDetails('Details Fund');
      cy.get('#detailsModalTitle').should('contain', 'Details Fund');
    });

    it('should show commitment in details summary', () => {
      cy.openFundDetails('Details Fund');
      cy.get('#detailsSummaryCommitment').should('contain', '2,000,000');
    });

    it('should close details modal on cancel', () => {
      cy.openFundDetails('Details Fund');
      cy.get('#detailsModal').should('be.visible');

      cy.get('#cancelDetailsModalBtn').click();
      cy.get('#detailsModal').should('not.be.visible');
    });

    it('should close details modal on X button', () => {
      cy.openFundDetails('Details Fund');
      cy.get('#detailsModal').should('be.visible');

      cy.get('#closeDetailsModalBtn').click();
      cy.get('#detailsModal').should('not.be.visible');
    });

    it('should open details via action menu', () => {
      cy.openActionMenu('Details Fund');
      cy.get('#actionViewDetails').click();

      cy.get('#detailsModal').should('be.visible');
      cy.get('#detailsModalTitle').should('contain', 'Details Fund');
    });
  });

  describe('Duplicate Fund', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Original Fund', accountNumber: 'ACC-ORIG', commitment: '500000' });
    });

    it('should open duplicate modal via action menu', () => {
      cy.openActionMenu('Original Fund');
      cy.get('#actionDuplicate').click();

      cy.get('#fundModal').should('be.visible');
    });
  });

  describe('Action Menu', () => {
    beforeEach(() => {
      cy.addFund({ name: 'Action Menu Fund', accountNumber: 'ACC-ACT', commitment: '300000' });
    });

    it('should show action dropdown on click', () => {
      cy.openActionMenu('Action Menu Fund');
      cy.get('#actionDropdown').should('be.visible');
    });

    it('should have all action options', () => {
      cy.openActionMenu('Action Menu Fund');

      cy.get('#actionEdit').should('be.visible');
      cy.get('#actionDuplicate').should('be.visible');
      cy.get('#actionViewDetails').should('be.visible');
      cy.get('#actionDelete').should('be.visible');
    });

    it('should close dropdown when clicking elsewhere', () => {
      cy.openActionMenu('Action Menu Fund');
      cy.get('#actionDropdown').should('be.visible');

      cy.get('body').click(0, 0);
      cy.get('#actionDropdown').should('not.be.visible');
    });
  });
});
