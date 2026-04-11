# Deep Dive - Facility, Cooling, and Compute Architecture

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## Why This Stage Matters

Compute planning fails when facility constraints are treated as optional. Cooling, PUE, and electrical architecture define the usable IT envelope.

## Facility Design Decisions

- developer/build model
- cooling strategy
- electrical architecture
- PUE target and tolerance

## Compute Design Decisions

- GPU generation and memory profile
- GPUs per rack
- inference stack choice
- serving architecture (utilization characteristics)

## Core Constraints

- IT load available after PUE overhead
- rack count bounded by both power and footprint
- GPU/cooling compatibility requirements

## Best-Practice Checklist

1. validate GPU to cooling compatibility before scaling scenarios
2. estimate rack power with conservative derate
3. check rack plan feasibility against IT load envelope
4. benchmark with workload-specific settings, not generic defaults

## What to Compare Across Scenarios

- rack count and total GPU count
- total compute potential
- capex shifts in IT infrastructure and cooling
- TTFT and TPS sensitivity by stack and workload profile
