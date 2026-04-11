# Project Overview and Functionality

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## What This Project Does

Forge Data Center Open Source Project helps teams simulate and compare AI inference data center decisions before committing real capital.

It connects planning across:

- site and permitting
- power and resilience
- cooling and facility constraints
- compute architecture
- interconnect and external bandwidth
- operational reliability and monitoring

## Core User Outcomes

Users can answer practical questions such as:

- If we increase target MW, what breaks first: site envelope, cooling, or cost?
- If we change GPU generation, what happens to rack density, power, and benchmark outputs?
- If we scale nodes, how does network penalty change TTFT and TPS?
- If we move to higher reliability tiers, what is the capex/opex tradeoff?

## Product Components

### Forge (`/forge`)

A phase-based planning simulation with visual build progression and benchmark unlocks.

### Inference Digital Twin (`/explorer` + API)

A deterministic execution engine with scenario contracts, module runs, caching, and provenance reports.

## Design Principles

1. Deterministic runs
2. Explicit assumptions
3. Transparent formulas
4. Reproducible outputs
5. Clear limitations

## Intended Audience

- AI infrastructure and data center operators
- platform and serving engineers
- product/finance decision stakeholders
- research collaborators and open-source contributors
