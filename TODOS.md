# TODOS

## Inference Digital Twin

### Interconnect Fidelity Module (v1.1)

**What:** Add a dedicated interconnect module that models NVLink/InfiniBand topology effects on inference latency and concurrency.

**Why:** The v1 core can ship without full interconnect fidelity, but cross-layer realism stays limited until interconnect behavior is explicitly modeled.

**Context:** Deferred during /plan-eng-review to keep first release shippable. This is the most important architecture expansion after v1 core stability.

**Effort:** L
**Priority:** P1
**Depends on:** ScenarioSpec v1, deterministic calibration pipeline, orchestrator/worker pipeline stability

### Artifact Compatibility Guardrail

**What:** Implement a compatibility checker that validates scenario packs against coefficient artifact versions before execution.

**Why:** Prevents subtle incorrect outputs caused by version mismatch between scenario definitions and calibration artifacts.

**Context:** /plan-eng-review locked artifact provenance and compatibility as core trust mechanisms. This TODO tracks stricter enforcement beyond baseline checks.

**Effort:** M
**Priority:** P1
**Depends on:** Versioned contracts, artifact metadata schema, canonical error taxonomy

### Auto-save (30s interval)

**What:** Write `idt_session_v1` to localStorage on a 30-second interval, in addition to the existing mutation-debounce write.

**Why:** The mutation debounce covers graceful usage but not crashes between mutations. A periodic write closes the gap without requiring persistent-state infrastructure.

**Context:** localStorage restore accepted in #ui-startup-performance. Auto-save is the natural next step — ships after session restore is stable in production.

**Effort:** S
**Priority:** P2
**Depends on:** localStorage session restore (#ui-startup-performance)

### Behavioral Tests for Desktop Intro Screens

**What:** Convert `tests/test_desktop_intro.py` from source-string assertions to behavioral PyQt6 tests using `QApplication` in `conftest.py` and `QTest.keyClick()` for skip-key coverage.

**Why:** Source-string assertions don't catch regressions in behavior — only in file content. A rename or refactor could break the feature without breaking the tests.

**Context:** Current assertions check that `earthspin-sheet-citylights.png` and `FastTransformation` appear in the file text. Behavioral tests require a QApplication instance and QTest event simulation.

**Effort:** M
**Priority:** P2
**Depends on:** QApplication conftest.py setup (none currently)

### Reproducibility Bundle CLI

**What:** Add a CLI to export and import reproducibility bundles (scenario, report, provenance, artifact references).

**Why:** External researchers need a low-friction, standardized way to reproduce and compare published results.

**Context:** Success criteria require third-party reproducibility. Hosted UI and docs are necessary but not sufficient for research workflows.

**Effort:** M
**Priority:** P2
**Depends on:** Stable PredictionReport schema, provenance block, artifact registry metadata

## Completed

## Design System and UX

### Create Canonical DESIGN.md

**What:** Create a project-level `DESIGN.md` and migrate interim token definitions into it.

**Why:** Prevent future UI drift by making typography, spacing, color roles, and interaction conventions explicit.

**Context:** /plan-design-review locked interim tokens as a bridge; this TODO creates the long-term source of truth.

**Effort:** M
**Priority:** P1
**Depends on:** Approved design locks in the inference digital twin plan

### Accessibility QA Checklist for Async Flows

**What:** Add a reusable accessibility QA checklist covering keyboard navigation, live status announcements, and screen-reader behavior for `/explorer`, `/runs/:id`, and `/reports/:id/provenance`.

**Why:** Ensure accessibility requirements in the plan stay enforced as UI evolves.

**Context:** Responsive and a11y behavior were locked in review; this TODO operationalizes those specs into repeatable QA.

**Effort:** M
**Priority:** P1
**Depends on:** Initial implementation of the three core UI routes

### Motion and Micro-interaction Spec (Post-v1 Usability)

**What:** Define a high-fidelity motion and micro-interaction spec after initial usability signal from v1.

**Why:** Improve clarity and perceived quality without distracting from core workflow delivery.

**Context:** Advanced motion was intentionally deferred during design review to keep v1 scope focused.

**Effort:** M
**Priority:** P2
**Depends on:** Baseline usability feedback from first v1 users
