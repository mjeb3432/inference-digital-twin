# Sensitivity Sweep Planner Template

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## Purpose

Run controlled variable sweeps to identify which assumptions have the biggest impact.

## Sweep Table Fields

- Variable name
- Baseline value
- Sweep min
- Sweep max
- Step size
- Controlled constants
- Output metrics tracked
- Impact summary
- Recommended action

## Recommended Sweep Sequence

1. Power price and PUE sensitivity
2. GPU SKU and rack density sensitivity
3. Network/fabric scale sensitivity
4. Runtime and orchestration sensitivity
5. Renewable mix and carbon sensitivity

## Interpretation Rule

Prioritize variables that move multiple business-critical outcomes at once (for example TTFT + TCO + reliability).
