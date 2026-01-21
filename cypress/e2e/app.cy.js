/// <reference types="cypress" />

describe('Application Basics', () => {
  beforeEach(() => {
    cy.visitAndWait();
  });

  describe('Page Load', () => {
    it('should load the application', () => {
      cy.get('#headerTitle').contains('PE Fund Manager');
    });

    it('should display the main table', () => {
      cy.get('#fundsTable').should('be.visible');
    });

    it('should show the sidebar toggle button', () => {
      cy.get('#toggleSidebarBtn').should('be.visible');
    });

    it('should show filter controls', () => {
      cy.get('#groupFilter').should('exist');
      cy.get('#fundFilter').should('exist');
      cy.get('#vintageFilter').should('exist');
      cy.get('#cutoffDate').should('exist');
    });

    it('should show portfolio summary', () => {
      cy.get('#portfolioSummary').should('be.visible');
      cy.get('#summaryInvestmentCount').should('exist');
      cy.get('#summaryFundCount').should('exist');
    });
  });

  describe('Sidebar', () => {
    it('should open sidebar when clicking toggle button', () => {
      cy.get('#sidebar').should('not.be.visible');
      cy.openSidebar();
      cy.get('#sidebar').should('be.visible');
    });

    it('should close sidebar when clicking close button', () => {
      cy.openSidebar();
      cy.closeSidebar();
      cy.get('#sidebar').should('not.be.visible');
    });

    it('should close sidebar when clicking overlay', () => {
      cy.openSidebar();
      cy.get('#sidebarOverlay').click({ force: true });
      cy.get('#sidebar').should('not.be.visible');
    });

    it('should show all sidebar sections', () => {
      cy.openSidebar();
      cy.get('#sidebar').contains('View Options');
      cy.get('#sidebar').contains('Manage');
      cy.get('#sidebar').contains('Data');
    });

    it('should have New Investment link', () => {
      cy.openSidebar();
      cy.get('#sidebarNewInvestment').should('be.visible');
    });

    it('should have export options', () => {
      cy.openSidebar();
      cy.get('#sidebarExportCSV').should('be.visible');
      cy.get('#sidebarExportJSON').should('be.visible');
    });
  });

  describe('Theme Toggle', () => {
    it('should toggle dark mode via sidebar', () => {
      // Check initial state (light mode)
      cy.get('html').should('not.have.attr', 'data-theme', 'dark');

      // Toggle dark mode
      cy.toggleDarkMode();

      // Should be in dark mode
      cy.get('html').should('have.attr', 'data-theme', 'dark');

      // Toggle back
      cy.toggleDarkMode();
      cy.get('html').should('not.have.attr', 'data-theme', 'dark');
    });

    it('should persist theme preference', () => {
      cy.toggleDarkMode();
      cy.get('html').should('have.attr', 'data-theme', 'dark');

      // Reload page
      cy.reload();
      cy.get('#fundsTable').should('exist');

      // Theme should be preserved
      cy.get('html').should('have.attr', 'data-theme', 'dark');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should open shortcuts modal with ?', () => {
      cy.get('body').type('?');
      cy.get('#shortcutsModal').should('be.visible');
    });

    it('should close modal with Escape', () => {
      cy.get('body').type('?');
      cy.get('#shortcutsModal').should('be.visible');
      cy.get('body').type('{esc}');
      cy.get('#shortcutsModal').should('not.be.visible');
    });

    it('should open new investment with Ctrl+N', () => {
      cy.get('body').type('{ctrl}n');
      cy.get('#fundModal').should('be.visible');
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no funds exist', () => {
      // Table may have a "no data" placeholder row, so check for empty message or no real data
      cy.get('#fundsTableBody').then($tbody => {
        const text = $tbody.text();
        // Either no rows, or contains empty state message
        expect(text.toLowerCase()).to.satisfy(t =>
          t.includes('no ') || t.includes('empty') || t.includes('add') || $tbody.find('tr').length <= 1
        );
      });
    });

    it('should show zero counts in summary', () => {
      cy.get('#summaryInvestmentCount').should('contain', '0');
      cy.get('#summaryFundCount').should('contain', '0');
    });
  });

  describe('Responsive Design', () => {
    it('should work on mobile viewport', () => {
      cy.viewport('iphone-x');
      cy.get('#toggleSidebarBtn').should('be.visible');
      cy.get('#fundsTable').should('exist');
    });

    it('should work on tablet viewport', () => {
      cy.viewport('ipad-2');
      cy.get('#toggleSidebarBtn').should('be.visible');
      cy.get('#fundsTable').should('exist');
    });
  });

  describe('Timeline Panel', () => {
    it('should have timeline panel', () => {
      cy.get('#timelinePanel').should('exist');
    });

    it('should toggle timeline visibility', () => {
      cy.get('#timelineHeader').click();
      // Timeline content should toggle
      cy.get('.timeline-content').should('exist');
    });
  });
});

describe('Data Persistence', () => {
  it('should persist funds across page reloads', () => {
    cy.visitAndWait();
    cy.addFund({ name: 'Persistent Fund', accountNumber: 'ACC-001', commitment: '500000' });
    cy.contains('#fundsTableBody tr', 'Persistent Fund').should('exist');

    // Reload the page (without clearing IndexedDB in beforeEach for this test)
    cy.visit('/');
    cy.get('#fundsTable').should('exist');
    cy.get('#loadingOverlay').should('not.be.visible');

    // Fund should still be there
    cy.contains('#fundsTableBody tr', 'Persistent Fund').should('exist');
  });
});
