# AI Code Review Playbook

**System:** TypeScript SPA for Private Equity commitments, cash flows, NAV, and return metrics

**Review philosophy:** Financial correctness, data integrity, auditability, and long-term maintainability take precedence over cosmetic issues.

---

## QUICK REFERENCE

| Phase | Focus | Token Load | Files |
|-------|-------|------------|-------|
| 1 | System mapping | Low | ~5 |
| 2 | Financial formulas | High | ~3 |
| 3 | Data integrity | Medium | ~4 |
| 4 | Security/perf | Medium | ~8 |
| 5 | Architecture | Low | ~6 |
| 6 | Tests | Medium | ~7 |
| 7 | Synthesis | Low | Reports only |

---

## HOW TO INVOKE A PHASE

Prompt template:
```
Execute Phase N of review-playbook.md. Read only the files in scope.
Write your report to reports/phase-N-YYYY-MM-DD.md
```

For recurring reviews:
```
Execute RECURRING REVIEW MODE per review-playbook.md.
Compare against the most recent reports in reports/.
```

---

## GLOBAL RULES (ALL PHASES)

- Only analyze files explicitly listed in the phase scope.
- Do not quote large code blocks — summarize and reference by `file:line`.
- Prefer summarized findings over line-by-line commentary unless critical.
- Each phase must produce a written report before continuing.
- Treat each phase as stateless. Do not rely on previous session memory.
- Read phase reports from `reports/` directory when cross-referencing is needed.

---

## CONTEXT LIMITS

- Stop and checkpoint if you've read more than 10 files in a phase.
- Stop if a single file exceeds 500 lines — summarize and note for follow-up.
- If producing more than 20 issues in one phase, write report and continue in fresh session.
- If the assistant indicates context is nearly full, immediately write current findings and stop.

---

## EFFICIENT TOOL USAGE

- Use Grep to locate relevant code before reading entire files.
- Use Glob to discover files matching patterns.
- Read only functions/sections relevant to the phase scope.
- Never read: `node_modules/`, `dist/`, `*.min.js`, or generated files.
- Prefer targeted line ranges over full file reads for large files.

---

## REPORT OUTPUT

Write all phase reports to: `reports/phase-N-YYYY-MM-DD.md`

Create the `reports/` directory if it doesn't exist.

Report filename examples:
- `reports/phase-1-2026-01-22.md`
- `reports/phase-2-2026-01-22.md`

---

## STANDARD ISSUE FORMAT

Each issue must include:

- `file:line`
- **severity:** critical | high | medium | low
- **category:** (see taxonomy below)
- **explanation:** (1-2 sentences)
- **remediation:** (concrete fix)

**Categories:**
- `correctness` — Wrong calculation or logic
- `data-integrity` — Risk of data loss or corruption
- `security` — Exploitable vulnerability
- `performance` — Inefficiency or scaling issue
- `maintainability` — Technical debt or poor structure
- `test-gap` — Missing or inadequate test coverage

---

## PHASE 1 — SYSTEM MAPPING (LOW LOAD)

**Goal:** Build a structural understanding without deep inspection.

**Files in scope:**
- `src/main.ts` — Entry point, event listeners
- `src/core/index.ts` — Core module exports
- `src/calculations/index.ts` — Calculation module exports
- `src/app/index.ts` — Application module exports
- `src/types/index.ts` — Type definitions overview

**Deliverables:**
- Module map (text diagram)
- Data flow diagram (text)
- Calculation pipeline summary
- Risk surface overview

**Explicitly do NOT:**
- Audit formulas
- Analyze performance
- Deep scan UI components

---

## PHASE 2 — FINANCIAL ENGINE AUDIT (HIGHEST PRIORITY)

**Goal:** Verify correctness of all financial calculations.

**Files in scope:**
- `src/calculations/irr.ts` — IRR and MOIC calculations
- `src/calculations/metrics.ts` — Fund metrics (DPI, RVPI, TVPI, etc.)
- `src/types/fund.ts` — Fund, CashFlow, Nav type definitions

**Priority order (if must stop early):**
1. IRR/XIRR calculation correctness
2. Sign convention consistency (contributions negative, distributions positive)
3. Date handling and timezone edge cases
4. Aggregation logic across cash flows
5. Rounding and floating-point precision

**Review for:**
- Formula correctness against industry standards
- Date math and timing assumptions
- Sign conventions throughout pipeline
- Rounding and precision risks
- Aggregation correctness (sums, weighted averages)
- Auditability (can results be traced back to inputs?)

**Deliverables:**
- Financial risk register
- Formula validation notes
- Critical correctness issues
- Test gaps identified

---

## PHASE 3 — STATE, PERSISTENCE & DATA INTEGRITY

**Goal:** Identify risks of data loss or corruption.

**Files in scope:**
- `src/core/state.ts` — AppState singleton
- `src/core/db.ts` — IndexedDB operations
- `src/app/import.ts` — Data import
- `src/app/export.ts` — Data export

**Review for:**
- Corrupt-state risk (partial updates, invalid states)
- Partial-write failures (IndexedDB transactions)
- Concurrency hazards (race conditions)
- Non-atomic financial edits (multi-step operations)
- Schema drift and migrations (version handling)
- Data normalization edge cases

**Deliverables:**
- Data integrity risks
- Failure-mode analysis
- Recommended safeguards

---

## PHASE 4 — SECURITY & PERFORMANCE

**Goal:** Identify exploitable vulnerabilities and performance bottlenecks.

**Files in scope:**
- `src/utils/escaping.ts` — HTML/CSV escaping
- `src/utils/validation.ts` — Input validation
- `src/app/table.ts` — Table rendering (XSS surface)
- `src/app/modals.ts` — Modal dialogs (user input)
- `src/app/import.ts` — File parsing (injection surface)
- `src/app/filters.ts` — Filter functionality
- `src/calculations/irr.ts` — Hot-path calculations
- `src/calculations/metrics.ts` — Aggregation loops

**Security review:**
- XSS vectors (innerHTML, user data in DOM)
- Injection risks (CSV, file parsing)
- Prototype pollution
- Sensitive data exposure
- Unsafe storage practices

**Performance review:**
- Hot-path loops (O(n²) or worse)
- Recalculation inefficiencies
- Memory growth (retained references)
- Large dataset behavior (1000+ funds)

**Deliverables:**
- Exploitable risks with severity
- Performance bottlenecks
- Remediation guidance

---

## PHASE 5 — ARCHITECTURE, TYPES & MAINTAINABILITY

**Goal:** Assess long-term maintainability and technical debt.

**Files in scope:**
- `src/types/fund.ts` — Core domain types
- `src/types/group.ts` — Group type
- `src/types/state.ts` — AppState type definitions
- `src/core/state.ts` — State management patterns
- `src/core/config.ts` — Application constants
- All `index.ts` files — Module dependency structure

**Review for:**
- Separation of concerns (UI vs. logic vs. data)
- Financial engine isolation (can calculations be tested independently?)
- Coupling and circular dependencies
- Domain typing quality (are types precise or overly permissive?)
- Determinism and reproducibility
- Technical debt indicators

**Deliverables:**
- Architectural risk profile
- Type system gaps
- Refactor opportunities (prioritized)

---

## PHASE 6 — TESTS & REGRESSION SAFETY

**Goal:** Assess test coverage and identify gaps in financial validation.

**Files in scope:**
- `__tests__/` — All test files
- `jest.config.js` — Test configuration
- `package.json` — Test scripts

**Review for:**
- Financial formula test coverage (are edge cases covered?)
- Scenario completeness (multiple cash flows, zero values, negatives)
- Edge-case protection (empty arrays, single items, boundary dates)
- Test brittleness (over-mocking, implementation coupling)
- Missing golden datasets (known-correct reference calculations)

**Deliverables:**
- Test gap analysis
- Recommended financial test cases
- Coverage improvement priorities

---

## PHASE 7 — SYNTHESIS & ROADMAP

**Goal:** Consolidate findings into actionable priorities.

**Prerequisites:** Phase 1-6 reports must exist in `reports/` directory.

**Input:** Read only the phase report files, not source code:
- `reports/phase-1-*.md`
- `reports/phase-2-*.md`
- `reports/phase-3-*.md`
- `reports/phase-4-*.md`
- `reports/phase-5-*.md`
- `reports/phase-6-*.md`

**Process:**
1. Read all phase reports (most recent of each)
2. Extract all critical and high severity issues
3. Identify patterns across phases
4. Synthesize into final deliverables

**Deliverables:**
- Top 5 financial correctness risks
- Top 5 systemic risks (non-financial)
- Prioritized remediation plan (immediate / short-term / long-term)
- Architectural improvement plan
- Ongoing validation checklist

---

## RECURRING REVIEW MODE

**When to use:** Scheduled reviews after initial full review is complete.

**Process:**
1. Skip Phase 1 unless `src/` directory structure has changed
2. Re-run Phase 2 (financial engine) — always highest priority
3. Re-run Phase 3 (data integrity)
4. Re-run Phase 4 (security/performance)
5. Run Phase 7 (synthesis)

**Comparison:**
- Load the most recent previous report for each phase
- Note new issues, resolved issues, and regressions
- Flag any issues that have persisted across multiple reviews

**Output:**
- Delta report highlighting changes since last review
- Updated remediation priorities
