# Deep Dive - Power Procurement and Resilience

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## Why This Stage Matters

Power strategy is usually the largest long-term cost driver and one of the strongest reliability determinants.

## Key Decision Areas

- source mix (grid, gas, solar, wind, nuclear pathways)
- redundancy tier policy
- UPS and storage response strategy
- onsite generation and renewable share assumptions

## Core Tradeoffs

- lower blended energy rate vs capex intensity
- higher redundancy vs cost escalation
- cleaner energy mix vs lead-time complexity

## Reliability Lens

Reliability is not only an SLO concern. It alters capex architecture, operational burden, and risk profile for maintenance windows.

## Best-Practice Checklist

1. enforce source percentages summing to 100
2. model both energy rate and infrastructure capex effects
3. define backup response expectations explicitly
4. treat redundancy tier as a policy decision, not a cosmetic setting

## What to Compare Across Scenarios

- blended rate
- power capex component
- annual power opex
- uptime projection deltas
