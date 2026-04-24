# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2.0] - 2026-04-23

### Performance
- Introduced `AppServices` lazy-init layer — heavy backend services (DB, orchestrator, run queue) now warm in a background thread, so the Forge UI loads immediately instead of blocking on startup.
- Space title screen intro reduced from 10s to 3.2s by default (`IDT_FAST_INTRO=1`). Set `IDT_FAST_INTRO=0` to restore the cinematic version.

### Changed
- API routes now return `503 Service Unavailable` during the warm-up window instead of crashing with a 500.
- `/api/health` reports `"warming"` status while services initialize, and `"error"` if initialization fails — so clients can tell the difference.
- Desktop intro screens (space title, WBR title) polished with cleaner visuals and updated brand copy: "WATT-BIT INTELLIGENCE / INFERENCE DIGITAL TWIN / Simulate before you spend."
- Removed stale `docs/notion_workspace/` files that were no longer maintained.

### Fixed
- `AppError.__post_init__` now calls `Exception.__init__` directly to avoid MRO issues with dataclass inheritance.

### Added
- `tests/test_desktop_intro.py` — regression tests for desktop screen brand copy and asset references.
- `tests/test_integration.py` — integration test verifying Forge stays available if backend warmup fails.

## [0.1.1.0] - 2026-03-28

### Added
- Added `The Forge` single-page AI data center construction simulator at `/forge`.
- Added a full 8-phase build flow with dependency locks, economics model, and live inspector details.
- Added inline SVG floor/map visualizations, benchmark suite cards, and phase transition deployment log UX.
- Added complete frontend assets (`app/static/forge.css`, `app/static/forge.js`) and template (`app/templates/forge.html`).
- Added route wiring in `app/main.py` and integration coverage for `/forge`.
- Added project ignore rules for local QA outputs and workspace artifacts.

### Changed
- Updated slider controls to support direct numeric entry for precision adjustments.
- Improved phase 8 behavior with dedicated map/floor/full-screen controls and adaptive benchmark auto-collapse for shorter desktop windows.
- Updated cache-busting asset versions in `forge.html` to reflect UI iterations.

### Fixed
- Fixed benchmark toggle accessibility state by syncing `aria-expanded` with collapse/expand state.
