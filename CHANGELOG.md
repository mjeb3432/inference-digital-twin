# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3.0] - 2026-04-24

### Changed
- **Intro sequence redesigned** — earth/globe opening removed entirely; Watt-Bit Intelligence title screen now leads directly into The Forge.
- **Manual-dismiss only** — both the desktop title screen and the web Forge intro overlay now wait for user input (Enter, Space, Esc, or click) rather than auto-dismissing on a timer. Progress bar fills over ~4.5s to signal readiness, then holds.
- **Branding cleaned up** — all "Simply Silicon", "Augur", and "Calgary" references removed from the intro sequence. Only Watt-Bit Intelligence branding throughout.
- **Cinematic timing** — web intro animation delays extended: title words appear at 700/920ms, subtitle at 1.9s, HUD meta at 2.8s, "ENTER THE HALL" CTA at 5s.
- **Amber visual language** — WebGL dot-flow band and scan line changed from red to amber (`#f5a623`) to match the Forge palette; parallax strength and bloom increased for depth.
- **HUD corner brackets** — amber L-shaped brackets added to all four corners of the web intro overlay (pure CSS, no JS dependency).

### Fixed
- Removed dead `SpaceTitleScreen` import from `app_manager.py` that would cause an `ImportError` if the file was ever cleaned up.
- HUD corner brackets moved off the perspective-transformed `.intro-grid` element onto a flat overlay div — brackets now render at the correct viewport corners.
- `forge.js` comment referencing the internal workbook by its old "Simply Silicon" name updated to match current branding.

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
