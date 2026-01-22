# AI Code Review Playbook

**System:** TypeScript SPA for Private Equity commitments, cash flows, NAV, and return metrics

**Review philosophy:** Financial correctness, data integrity, auditability, and long-term maintainability take precedence over cosmetic issues.

---

## GLOBAL RULES (ALL PHASES)

- Only analyze files explicitly in scope for the current phase.
- Do not quote large code blocks.
- Prefer summarized findings over line-by-line commentary unless critical.
- Each phase must produce a written report before continuing.
- Treat each phase as stateless. Do not rely on previous session memory.
- If context grows large, stop and request a fresh session.

---

## STANDARD ISSUE FORMAT

Each issue must include:

- `file:line`
- **severity:** critical | high | medium | low
- **category**
- **explanation**
- **concrete remediation**

---

## PHASE 1 — SYSTEM MAPPING (LOW LOAD)

**Goal:** Build a structural understanding without deep inspection.

**Scope:**
- Entry points
- Financial calculation modules
- State management
- Persistence/import/export
- UI boundaries

**Deliverables:**
- Module map
- Data flow diagram (text)
- Calculation pipeline summary
- Risk surface overview

**Explicitly do NOT:**
- Audit formulas
- Analyze performance
- Deep scan UI

---

## PHASE 2 — FINANCIAL ENGINE AUDIT (HIGHEST PRIORITY)

**Scope only files that implement:**
- Cash flows
- Commitments
- NAV
- Fund/deal aggregation
- Return metrics (IRR, XIRR, TVPI, DPI, MOIC, etc.)

**Review for:**
- Formula correctness
- Date math and timing assumptions
- Sign conventions
- Rounding and precision risks
- Aggregation correctness
- Auditability (traceability of metrics)

**Deliverables:**
- Financial risk register
- Formula validation notes
- Critical correctness issues
- Test gaps

---

## PHASE 3 — STATE, PERSISTENCE & DATA INTEGRITY

**Scope:**
- State stores
- Local storage / IndexedDB / APIs
- Import/export
- Edit flows
- Undo/redo or history

**Review for:**
- Corrupt-state risk
- Partial-write failures
- Concurrency hazards
- Non-atomic financial edits
- Schema drift and migrations

**Deliverables:**
- Data integrity risks
- Failure-mode analysis
- Recommended safeguards

---

## PHASE 4 — SECURITY & PERFORMANCE

**Security:**
- XSS, injection, prototype pollution
- Sensitive data exposure
- Unsafe storage
- File handling risks

**Performance:**
- Hot-path loops
- Recalculation inefficiencies
- Memory growth
- Large dataset behavior

**Deliverables:**
- Exploitable risks
- Performance bottlenecks
- Remediation guidance

---

## PHASE 5 — ARCHITECTURE, TYPES & MAINTAINABILITY

**Review for:**
- Separation of concerns
- Financial engine isolation
- Coupling and circular deps
- Domain typing quality
- Determinism and reproducibility
- Technical debt

**Deliverables:**
- Architectural risk profile
- Type system gaps
- Refactor opportunities

---

## PHASE 6 — TESTS & REGRESSION SAFETY

**Review:**
- Financial formula test coverage
- Scenario completeness
- Edge-case protection
- Brittleness
- Missing golden datasets

**Deliverables:**
- Test gap analysis
- Recommended financial test suite

---

## PHASE 7 — SYNTHESIS & ROADMAP

Combine all findings into:

- Top 5 financial correctness risks
- Top 5 systemic risks
- Prioritized remediation plan
- Architectural improvement plan
- Ongoing validation checklist

---

## RECURRING REVIEW MODE

When running on a schedule:

- Skip Phase 1 unless structure changed
- Re-run Phases 2, 3, 4, and 7
- Compare results against last report
