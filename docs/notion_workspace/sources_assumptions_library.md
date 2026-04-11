# Sources and Assumptions Library

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## Purpose

This page documents where major V1 assumptions come from and how they are represented in the model.

## Internal Implementation Sources (Primary)

- Forge phase equations and validations: `app/static/forge.js`
- Digital Twin execution path and report assembly: `app/orchestrator.py`
- Hardware formulas: `app/modules/hardware.py`
- Interconnect formulas: `app/modules/interconnect.py`
- Runtime formulas: `app/modules/runtime.py`
- Orchestration formulas: `app/modules/orchestration.py`
- Energy and carbon formulas: `app/modules/energy.py`
- Versioned calibration constants: `artifacts/coefficients.v1.json`
- Contract schemas: `contracts/v1/*.json`
- Canonical hashing and reproducibility identity: `app/hashing.py`

## External Reference Anchors (Captured in Forge cost-basis comments)

- EIA utility-scale generator costs:
  https://www.eia.gov/electricity/annual/table.php?t=epa_08_04
- EIA commercial electricity price:
  https://www.eia.gov/electricity/sales_revenue_price/pdf/table_13.pdf
- JLL data center and AI infrastructure report:
  https://www.jll.com/en-us/insights/data-centers-and-ai-infrastructure-report
- Cushman & Wakefield development cost guide:
  https://cushwake.cld.bz/Data-Center-Development-Cost-Guide-2025

## Source Quality Rules for Contributors

1. Prefer primary technical sources over commentary.
2. Link exact file anchors when citing internal assumptions.
3. Include capture date for external market references.
4. Record confidence and expected refresh cadence.
5. Never update coefficients without documenting rationale and expected impact.

## Refresh Cadence

- Power and market-cost references: quarterly
- Hardware/runtime priors: per major model/hardware release
- Carbon intensity assumptions: quarterly or region-change trigger
