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

### Health Poll Max-Retry Cap

**What:** Add a max-retry count to the health poll `setInterval` in `forge.js`. After N consecutive `ECONNREFUSED` network errors (e.g., 60 retries = 30s at 500ms), treat as a permanent error state and transition the ambient dot to red.

**Why:** Currently the dot pulses amber indefinitely on network error. If the FastAPI process crashes before ever responding, the user sees amber forever — no actionable signal. The red dot only fires when the server returns `status === "error"`, not when it never binds.

**Context:** Flagged during /plan-eng-review outside voice. Accepted as P2 because ECONNREFUSED is rare (FastAPI typically either binds or throws a ServiceInitializationError that health can report). The current behavior is "wrong but rare" — amber is still preferable to nothing, and the red dot fires correctly in the common case.

**Effort:** S
**Priority:** P2
**Depends on:** localStorage session restore + ambient dot (#ui-startup-performance)

### HTML Routes Bypass runtime_or_503()

**What:** Standardize `/runs/{run_id}` and `/reports/{report_id}/provenance` HTML routes in `app/main.py` through `runtime_or_503()` so they return a clean 503 response (or a rendered error page) if the runtime isn't ready, instead of raising an unhandled exception.

**Why:** Currently both routes call `get_services(request.app).get()` directly. If the runtime isn't initialized, they raise an unhandled `ServiceInitializationError` — a 500, not a 503, and with no user-friendly error page. The JSON data routes all use `runtime_or_503()` correctly. The HTML routes are an inconsistency.

**Context:** Flagged during /plan-eng-review code quality pass. Not blocking this PR (HTML routes are secondary surfaces; the primary Forge route is always available). Fix is minimal — apply the same `runtime_or_503()` wrapper or an HTML equivalent.

**Effort:** S
**Priority:** P2
**Depends on:** None

### QWebEngineView Storage Path (Windows)

**What:** Investigate whether localStorage should use a named `QWebEngineProfile` with an explicit `AppData/Roaming` storage path instead of the default Chromium cache directory.

**Why:** The default profile stores localStorage under Chromium's cache dir on Windows. This directory can be wiped by Windows Disk Cleanup, antivirus tools, or profile resets — silently losing the user's session state. An `AppData/Roaming` path survives these events.

**Context:** Flagged during /plan-eng-review outside voice. Accepted as P2 because the risk is real but low-probability for developer users who don't typically run Disk Cleanup on active dev machines. The named profile change requires passing a custom `QWebEngineProfile` to `QWebEngineView` in `desktop/screens/main_app_window.py` and setting a stable storage path — a one-time change, but needs testing to confirm profile behavior matches expectations.

**Effort:** M
**Priority:** P2
**Depends on:** localStorage session restore (#ui-startup-performance) — ships after session restore is proven stable

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

### Reconcile `--healthy` Color Token with DESIGN.md

**What:** Replace `--healthy: #10b981` in `forge.css` with DESIGN.md's success token `#15803D` and audit all components that reference `--healthy` (rack status, canvas indicators).

**Why:** The service dot (added in #ui-startup-performance) correctly uses `#15803D` per DESIGN.md. The existing rack status uses `#10b981` (Tailwind emerald). Two different greens for "healthy" state erode the design system's color contract.

**Context:** Flagged during /plan-design-review. The difference is subtle (~15% lightness gap) but compounds as more components anchor to the wrong token. Fix is one CSS variable change plus a visual QA pass.

**Effort:** S
**Priority:** P3
**Depends on:** #ui-startup-performance ambient dot shipped (establishes #15803D as the correct success token)

### Header LED State Tie-in (Post-Service-Ready)

**What:** When the FastAPI service transitions from warming to ready, update the "UNDER CONSTRUCTION" header LED and label to reflect online state (e.g., "ONLINE" with `.led.led--ok`).

**Why:** Currently the header LED pulses amber permanently as a construction metaphor. After the service is ready, the amber LED is misleading — it reads as "still loading" rather than "operational." The ambient dot already signals service readiness in the canvas corner; the header LED is the natural secondary surface to close the loop.

**Context:** Flagged during /plan-design-review as a future UX enhancement. Not blocking this PR — the ambient dot is the designated service indicator for #ui-startup-performance. This is a cosmetic follow-on.

**Effort:** S
**Priority:** P3
**Depends on:** #ui-startup-performance ambient dot shipped and service state polling stable

### Boot-Error Copy: Add Log Path Hint

**What:** Add a log file path or diagnostic hint to the `.boot-error` paragraph and the 10-second boot-shell timeout message. E.g., "✗ INITIALIZATION FAILED — Restart the app. Check logs at %APPDATA%\Forge\logs."

**Why:** The current copy is a dead end for the ML engineers and SRE teams who are this app's users. "Restart the app" gives no information about what failed or where to look. A log path converts a dead end into a diagnostic entry point.

**Context:** Flagged during /plan-design-review. Out of scope for #ui-startup-performance because the app log path needs to be confirmed first (depends on how the FastAPI process is launched and what PyQt6 captures). Once the log path is stable, this is a one-line copy change.

**Effort:** S
**Priority:** P3
**Depends on:** Confirmed log file path for the Forge desktop app
