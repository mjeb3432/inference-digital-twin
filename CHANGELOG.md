# Changelog

All notable changes to this project will be documented in this file.

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
